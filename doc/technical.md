# Fluid Signature 技术文档

## 1. 技术栈

- Vite 6 + 原生 ES Modules
- WebGL 1、`OES_texture_float` 与多组 float FBO
- 平台 guest shell 和 Aigram profile bridge
- 原作源码由固定 CodePen 快照机械提取后本地打包

## 2. 目录结构

- `src/upstream.js`：原作流体求解器及产品身份、Pointer 和结算扩展。
- `src/shaders.js`：从快照提取的 1 个顶点 shader 与 6 个片元 shader。
- `scripts/extract-source.mjs`：可复验的源码提取器，不参与常规 build。
- `src/style.css` / `index.html`：产品界面、引导、结算和错误状态。
- `upstream/` 与 `public/THIRD_PARTY_NOTICES.txt`：来源、哈希与分发署名。
- `_qa/ui/`：两种移动端尺寸、基线和结算截图。

## 3. 核心模块

身份解析按 URL `user_name`、Aigram profile、发布者姓名顺序执行，异步结果会更新
文字纹理。流体循环使用 velocity、divergence、pressure、outputColor 四组 FBO；
每帧执行触点注入、散度、Jacobi 压力、梯度扣除和两次平流。产品模式将压力迭代
从 10 降到 7 以降低信息流 GPU 压力，`?baseline=1` 保持原作 10 次。Pointer
Events 统一鼠标和触屏，完成三次 pointerdown/up 后触发结算。

## 4. 扩展点

- 改流体参数、压力次数或结算规则：`src/upstream.js`。
- 改原作 shader：重新固定快照并运行 `npm run extract`，随后重新应用产品差异。
- 改身份来源：`resolveName()`。
- 改标题、排版、幽灵手指与结算：`index.html` / `src/style.css`。
- 加声音：在 pointer 注入和三笔结算处创建用户手势解锁后的 Web Audio。
