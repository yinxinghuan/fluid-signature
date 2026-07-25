// Mechanically extracted from the fixed upstream snapshot.
import { shaders } from './shaders.js';
import './style.css';
import { callAigramAPI, isInAigram, telegramId } from './shared/runtime/bridge.ts';

const canvasEl = document.querySelector("canvas");
const textureEl = document.createElement("canvas");
const textureCtx = textureEl.getContext("2d");
const query = new URLSearchParams(location.search);
const baselineMode = query.get('baseline') === '1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const localeOverride = localStorage.getItem('game_locale');
const locale = localeOverride === 'en' || localeOverride === 'zh'
  ? localeOverride
  : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const copy = {
  zh: { settled: '签名已凝结', errorTitle: '墨迹没有出现', errorBody: '请重新载入这张流体纸面', retry: '重新载入' },
  en: { settled: 'SIGNATURE SET', errorTitle: 'INK NOT FOUND', errorBody: 'Reload this fluid sheet', retry: 'RELOAD' }
}[locale];

async function resolveName() {
  if (baselineMode) return 'fluid';
  const debugName = query.get('user_name');
  if (debugName) return debugName;
  if (isInAigram && telegramId) {
    const response = await callAigramAPI(
      `/note/telegram/user/get/info/by/telegram_id?telegram_id=${encodeURIComponent(telegramId)}`,
      'GET'
    );
    const profile = response?.data ?? null;
    if (!profile?.user_name) throw new Error('AlterU profile did not return user_name');
    return profile.user_name;
  }
  return 'AlterU';
}

let identityName = baselineMode
  ? 'fluid'
  : (query.get('user_name') || (isInAigram ? '' : 'AlterU'));
document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
document.body.classList.toggle('fs-baseline', baselineMode);
document.querySelector('#identityName').textContent = identityName.toUpperCase();
document.querySelector('#settledTitle').textContent = copy.settled;
document.querySelector('#settledName').textContent = identityName.toUpperCase();
document.querySelector('#errorTitle').textContent = copy.errorTitle;
document.querySelector('#errorBody').textContent = copy.errorBody;
document.querySelector('#retry').textContent = copy.retry;
document.querySelector('#retry').addEventListener('click', () => location.reload());

const fontOptions = {
  "Arial": "Arial, sans-serif",
  "Verdana": "Verdana, sans-serif",
  "Tahoma": "Tahoma, sans-serif",
  "Times New Roman": "Times New Roman, serif",
  "Georgia": "Georgia, serif",
  "Garamond": "Garamond, serif",
  "Courier New": "Courier New, monospace",
  "Brush Script MT": "Brush Script MT, cursive" };


const params = {
  fontName: "Verdana",
  isBold: false,
  fontSize: 80,
  text: identityName,
  pointerSize: null,
  color: { r: 1., g: .0, b: .5 } };


const pointer = {
  x: 0,
  y: 0,
  dx: 0,
  dy: 0,
  moved: false };



let outputColor, velocity, divergence, pressure, canvasTexture;
let isPreview = true;
let pointerActive = false;
let gestureCount = 0;
let settleTimer = 0;
let userActed = false;
const ghost = document.querySelector('#ghost');
const settled = document.querySelector('#settled');

const gl = canvasEl.getContext("webgl", { antialias: false, powerPreference: 'high-performance' });
const floatTexture = gl?.getExtension("OES_texture_float");
if (!gl || !floatTexture) {
  document.querySelector('#error').hidden = false;
  throw new Error('WebGL float textures unavailable');
}

const vertexShader = createShader(
shaders["vertShader"],
gl.VERTEX_SHADER);

const splatProgram = createProgram("fragShaderPoint");
const divergenceProgram = createProgram("fragShaderDivergence");
const pressureProgram = createProgram("fragShaderPressure");
const gradientSubtractProgram = createProgram("fragShaderGradientSubtract");
const advectionProgram = createProgram("fragShaderAdvection");
const outputShaderProgram = createProgram("fragShaderOutputShader");

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
-1, -1,
-1, 1,
1, 1,
1, -1]),
gl.STATIC_DRAW);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(0);


createTextCanvasTexture();
initFBOs();
setupEvents();
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

render();
resolveName().then(nextName => {
  if (!nextName || nextName === identityName) return;
  identityName = nextName;
  params.text = nextName;
  document.querySelector('#identityName').textContent = nextName.toUpperCase();
  document.querySelector('#settledName').textContent = nextName.toUpperCase();
  updateTextCanvas();
}).catch(error => {
  console.error(error);
  document.querySelector('#error').hidden = false;
});
if (!baselineMode && !reducedMotion) {
  window.setTimeout(() => {
    if (!userActed) ghost.classList.add('fs-ghost--show');
  }, 850);
}

function createTextCanvasTexture() {
  canvasTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, canvasTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function updateTextCanvas() {
  textureCtx.fillStyle = "black";
  textureCtx.fillRect(0, 0, textureEl.width, textureEl.height);

  const fittedSize = baselineMode
    ? params.fontSize
    : Math.max(42, Math.min(128, (textureEl.width * .86) / Math.max(2.6, params.text.length * .58)));
  textureCtx.font = (params.isBold ? "bold" : "normal") + " " + fittedSize * devicePixelRatio + "px " + fontOptions[params.fontName];
  textureCtx.fillStyle = "#ffffff";
  textureCtx.textAlign = "center";

  textureCtx.filter = "blur(3px)";

  const textBox = textureCtx.measureText(params.text);
  textureCtx.fillText(params.text, .5 * textureEl.width, .5 * textureEl.height + .5 * textBox.actualBoundingBoxAscent);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, canvasTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureEl);
}

function createProgram(elId) {
  const shader = createShader(
  shaders[elId],
  gl.FRAGMENT_SHADER);
  const program = createShaderProgram(vertexShader, shader);
  const uniforms = getUniforms(program);
  return {
    program, uniforms };

}

function createShaderProgram(vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Unable to initialize the shader program: " + gl.getProgramInfoLog(program));
    return null;
  }

  return program;
}

function getUniforms(program) {
  let uniforms = [];
  let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < uniformCount; i++) {
    let uniformName = gl.getActiveUniform(program, i).name;
    uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
  }
  return uniforms;
}

function createShader(sourceCode, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, sourceCode);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function blit(target) {
  if (target == null) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  } else {
    gl.viewport(0, 0, target.width, target.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  }
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

function initFBOs() {
  const fboSize = [
  Math.floor(.5 * window.innerWidth),
  Math.floor(.5 * window.innerHeight)];

  outputColor = createDoubleFBO(fboSize[0], fboSize[1]);
  velocity = createDoubleFBO(fboSize[0], fboSize[1], gl.RG);
  divergence = createFBO(fboSize[0], fboSize[1], gl.RGB);
  pressure = createDoubleFBO(fboSize[0], fboSize[1], gl.RGB);
}


function createFBO(w, h, type = gl.RGBA) {
  gl.activeTexture(gl.TEXTURE0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, type, w, h, 0, type, gl.FLOAT, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return {
    fbo,
    width: w,
    height: h,
    attach(id) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return id;
    } };

}

function createDoubleFBO(w, h, type) {
  let fbo1 = createFBO(w, h, type);
  let fbo2 = createFBO(w, h, type);

  return {
    width: w,
    height: h,
    texelSizeX: 1. / w,
    texelSizeY: 1. / h,
    read: () => {
      return fbo1;
    },
    write: () => {
      return fbo2;
    },
    swap() {
      let temp = fbo1;
      fbo1 = fbo2;
      fbo2 = temp;
    } };

}

function render(t) {

  const dt = 1 / 60;

  if (t && isPreview) {
    updateMousePosition(
    (.5 - .45 * Math.sin(.003 * t - 2)) * window.innerWidth,
    (.5 + .1 * Math.sin(.0025 * t) + .1 * Math.cos(.002 * t)) * window.innerHeight);

  }

  if (pointer.moved) {
    if (!isPreview) {
      pointer.moved = false;
    }

    gl.useProgram(splatProgram.program);
    gl.uniform1i(splatProgram.uniforms.u_input_texture, velocity.read().attach(1));
    gl.uniform1f(splatProgram.uniforms.u_ratio, canvasEl.width / canvasEl.height);
    gl.uniform2f(splatProgram.uniforms.u_point, pointer.x / canvasEl.width, 1 - pointer.y / canvasEl.height);
    gl.uniform3f(splatProgram.uniforms.u_point_value, pointer.dx, -pointer.dy, 1);
    gl.uniform1f(splatProgram.uniforms.u_point_size, params.pointerSize);
    blit(velocity.write());
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.u_input_texture, outputColor.read().attach(1));
    gl.uniform3f(splatProgram.uniforms.u_point_value, 1. - params.color.r, 1. - params.color.g, 1. - params.color.b);
    blit(outputColor.write());
    outputColor.swap();
  }

  gl.useProgram(divergenceProgram.program);
  gl.uniform2f(divergenceProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
  gl.uniform1i(divergenceProgram.uniforms.u_velocity_texture, velocity.read().attach(1));
  blit(divergence);

  gl.useProgram(pressureProgram.program);
  gl.uniform2f(pressureProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
  gl.uniform1i(pressureProgram.uniforms.u_divergence_texture, divergence.attach(1));

  const pressureIterations = baselineMode ? 10 : 7;
  for (let i = 0; i < pressureIterations; i++) {
    gl.uniform1i(pressureProgram.uniforms.u_pressure_texture, pressure.read().attach(2));
    blit(pressure.write());
    pressure.swap();
  }

  gl.useProgram(gradientSubtractProgram.program);
  gl.uniform2f(gradientSubtractProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
  gl.uniform1i(gradientSubtractProgram.uniforms.u_pressure_texture, pressure.read().attach(1));
  gl.uniform1i(gradientSubtractProgram.uniforms.u_velocity_texture, velocity.read().attach(2));
  blit(velocity.write());
  velocity.swap();

  gl.useProgram(advectionProgram.program);
  gl.uniform1f(advectionProgram.uniforms.u_use_text, 0);
  gl.uniform2f(advectionProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
  gl.uniform1i(advectionProgram.uniforms.u_velocity_texture, velocity.read().attach(1));
  gl.uniform1i(advectionProgram.uniforms.u_input_texture, velocity.read().attach(1));
  gl.uniform1f(advectionProgram.uniforms.u_dt, dt);
  blit(velocity.write());
  velocity.swap();

  gl.useProgram(advectionProgram.program);
  gl.uniform1f(advectionProgram.uniforms.u_use_text, 1);
  gl.uniform2f(advectionProgram.uniforms.u_texel, outputColor.texelSizeX, outputColor.texelSizeY);
  gl.uniform1i(advectionProgram.uniforms.u_input_texture, outputColor.read().attach(2));
  blit(outputColor.write());
  outputColor.swap();

  gl.useProgram(outputShaderProgram.program);
  gl.uniform1i(outputShaderProgram.uniforms.u_output_texture, outputColor.read().attach(1));

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

  requestAnimationFrame(render);
}

function resizeCanvas() {
  params.pointerSize = 4 / window.innerHeight;
  canvasEl.width = textureEl.width = window.innerWidth;
  canvasEl.height = textureEl.height = window.innerHeight;
  initFBOs();
  updateTextCanvas();
}

function setupEvents() {
  canvasEl.addEventListener("pointerdown", e => {
    e.preventDefault();
    userActed = true;
    ghost.classList.remove('fs-ghost--show');
    isPreview = false;
    pointerActive = true;
    gestureCount += 1;
    settled.classList.remove('fs-settled--show');
    clearTimeout(settleTimer);
    pointer.x = e.pageX;
    pointer.y = e.pageY;
    canvasEl.setPointerCapture?.(e.pointerId);
  });

  canvasEl.addEventListener("pointermove", e => {
    if (e.pointerType !== 'mouse' && !pointerActive) return;
    if (e.pointerType === 'mouse' && !pointerActive) {
      isPreview = false;
      userActed = true;
      ghost.classList.remove('fs-ghost--show');
    }
    updateMousePosition(e.pageX, e.pageY);
  });

  const release = () => {
    if (!pointerActive) return;
    pointerActive = false;
    settleTimer = window.setTimeout(() => {
      if (gestureCount >= 3) {
        settled.classList.add('fs-settled--show');
        window.setTimeout(() => settled.classList.remove('fs-settled--show'), 1500);
        gestureCount = 0;
      }
    }, 950);
  };
  canvasEl.addEventListener('pointerup', release);
  canvasEl.addEventListener('pointercancel', release);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pointer.moved = false;
  });
}

function updateMousePosition(eX, eY) {
  pointer.moved = true;
  pointer.dx = 5 * (eX - pointer.x);
  pointer.dy = 5 * (eY - pointer.y);
  pointer.x = eX;
  pointer.y = eY;
}
