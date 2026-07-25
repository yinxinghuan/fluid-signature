# Fluid Signature 需求文档

## 1. Overview

一件把玩家用户名变成流体障碍与颜料留存区域的 WebGL 互动签名：手指划过姓名，
流速、压力和粉色墨迹同时被搅动；完成三笔后显示一次签名结算。

## 2. Visual Design

保留原作白底、黑色流场与洋红墨迹的高反差构图，以及文字参与压力求解的核心。
产品层只增加画册式标题、身份署名、Google Material 幽灵手指和无面板结算。
目标视口为 390×844 与 320×568；完整规范见 `doc/visual.md`。

## 3. Game Mechanics

- 流场分辨率：视口宽高的 0.5 倍，使用 float FBO。
- 每帧：注入触点 → divergence → 10 次 pressure Jacobi → gradient subtract
  → velocity advection → color advection → output。
- 原作参数：`dt=1/60`、点尺寸 `4/viewportHeight`、颜色 `(1,0,.5)`。
- 文字：产品模式为玩家用户名，按 42–128px 自适应；基线为 `fluid / 80px`。
- 结算：每次 pointerdown 计一笔，完成 3 笔并松手 950ms 后显示 1.5 秒结果。

## 4. Controls

- Touch / Pointer：单指按下并拖动注入速度与洋红墨迹；松手完成一笔。
- Mouse：移动即可搅动，按下拖动用于累计结算笔数。
- 引导：首次 850ms 后幽灵手指沿原作自动流场轨迹演示，真实操作立即取消。

## 5. Win / Lose Conditions

无失败条件。完成三笔形成一轮闭环，显示“签名已凝结”和玩家用户名；随后继续
搅动会重新开始下一轮。

## 6. Sound Effects

首版无声。原作的持续流体运动、触点墨迹、三笔结算与幽灵手指承担即时和阶段反馈，
避免信息流中自动播放音频。
