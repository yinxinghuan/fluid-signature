import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = await readFile(resolve(root, 'upstream/codepen-fullpage.source.txt'), 'utf8');
const srcdocMatch = snapshot.match(/srcdoc="([\s\S]*?)"\s+sandbox=/);
if (!srcdocMatch) throw new Error('CodePen srcdoc not found');

const decode = value => value
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&');
const documentSource = decode(srcdocMatch[1]);
const shaderIds = [
  'vertShader',
  'fragShaderAdvection',
  'fragShaderDivergence',
  'fragShaderPressure',
  'fragShaderGradientSubtract',
  'fragShaderPoint',
  'fragShaderOutputShader'
];
const shaders = {};
for (const id of shaderIds) {
  const match = documentSource.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`));
  if (!match) throw new Error(`Shader ${id} not found`);
  shaders[id] = match[1].trim();
}
await writeFile(
  resolve(root, 'src/shaders.js'),
  `// Mechanically extracted from the fixed upstream snapshot.\nexport const shaders = ${JSON.stringify(shaders, null, 2)};\n`
);

const jsMatch = documentSource.match(/<script id="rendered-js" type="module">([\s\S]*?)<\/script>/);
if (!jsMatch) throw new Error('Rendered JavaScript not found');
let js = jsMatch[1].trim();
js = js
  .replace(/import GUI from .*?;\n/, '')
  .replace('createControls();\n', '')
  .replace(
    /function createControls\(\) \{[\s\S]*?\n\}\n\/\/# sourceURL=pen\.js/,
    ''
  )
  .replace(
    /document\.getElementById\((.*?)\)\.innerHTML/g,
    'shaders[$1]'
  );
await writeFile(
  resolve(root, 'src/upstream.js'),
  `// Mechanically extracted from the fixed upstream snapshot.\nimport { shaders } from './shaders.js';\n${js}\n`
);
