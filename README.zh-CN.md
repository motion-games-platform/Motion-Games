# Motion Bubble Shooter（体感泡泡龙）

> 一款**纯浏览器运行**的手势体感泡泡射击游戏：打开摄像头，用「捏合 / 握拳」抓取泡泡、拉弓瞄准、张开手指发射，消除同色泡泡闯过 13 关。
> 本项目由 [SwayJoy](https://swayjoy.com) 开源，**单游戏、单页面**，无其他多余页面与路由。

![game-bg](public/pinch-pop-bubbles/game-bg.webp)

**语言**：中文版 · [English（README.md）](README.md)

---

## 目录

1. [技术栈](#一技术栈)
2. [玩法与操作说明](#二玩法与操作说明)
3. [运行方式](#三运行方式)
4. [参数与配置](#四参数与配置)
5. [目录结构](#五目录结构)
6. [常见问题](#六常见问题)

---

## 一、技术栈

| 模块 | 技术 | 说明 |
| --- | --- | --- |
| 前端框架 | **Vue 3**（`<script setup>` + TypeScript） | 单页面应用，无 Vue Router / Pinia，跨组件状态用模块级 `reactive` 单例 |
| 构建工具 | **Vite 6** | dev / build / preview |
| 手部追踪 | **MediaPipe Tasks `HandLandmarker`**（`@mediapipe/tasks-vision` 1.0.1） | 实时识别 21 个手部关键点；**GPU(WebGL) 优先，失败自动回退 CPU(WASM)**；WASM 本地推理，**视频帧不上传** |
| 推理模型 | `public/storage/vendor/mediapipe/tasks/hand_landmarker.task` | 由本地 WASM 引擎加载 |
| 游戏渲染 | **Canvas 2D**（双画布） | `hand-canvas` 画手部骨骼反馈、`game-canvas` 画游戏（泡泡/弹弓/特效），DPR 适配，60 FPS 渲染 |
| 手势识别 | 自研纯函数 `src/utils/gestureMatcher.js` | 14 种手势分类 + EMA 平滑 + 迟滞（hysteresis）判定捏合 |
| 音效 | **Web Audio API**（泡泡爆裂）+ `HTMLAudioElement`（背景音乐） | 均在本机播放 |
| 样式 | 原生 CSS | `src/assets/css/main.css`（共用舞台/关卡界面/按钮）+ `pinch-pop-bubbles.css`（游戏专属） |

> 摄像头采集：`getUserMedia`，默认档位 720p / 60fps（可在设置里切 480p / 720p / 1080p）。

---

## 二、玩法与操作说明

### 2.1 核心交互（两种抓取方式，默认捏合，可在设置或游戏内左下角切换）

| 步骤 | 捏合（Pinch，默认） | 握拳（Fist） |
| --- | --- | --- |
| 抓取 | 拇指 + 食指捏合靠近 → 抓取泡泡 | 五指全蜷成拳 → 抓取泡泡 |
| 瞄准 | 保持捏合向下拉弓 | 保持握拳向下拉弓 |
| 发射 | 张开拇指 + 食指 | 张开 5 根手指（≥4 根伸展） |
| 取消 | 手指完全张开（超过阈值） | 一般不触发取消 |

- 抓到泡泡后**泡泡会吸附到弹弓**，可在画面任意位置抓取（不要求手贴在弹弓上）。
- **拉的越远，方向越稳**：瞄准虚线越不容易抖动。
- 摄像头画面默认隐藏，只显示手部骨骼反馈（可在设置开启「Show camera feed」）。

### 2.2 计分与过关规则

- **消除泡泡**：同色 3 个及以上相连并消除 → 每个 +100 分。
- **掉落泡泡**：消除后失去支撑而掉落的悬浮泡泡 → 每个 +200 分。
- 过关条件由关卡配置决定：
  - `OR`：分数达标 **或** 全部清空，满足其一即过关；
  - `AND`：分数达标 **且** 全部清空（第 11–13 关）。

### 2.3 界面流转

```
首页(home) ── New Game / Continue ──▶ 关卡预览(intro，8s 倒计时) ──▶ 游戏中(playing)
   ▲                                        │
   │                                  过关 ─ win(恭喜/彩带)  失败 ─ summary(路线图)
   └────────── Exit / Finish / Continue ◀──┴───────────────────────────┘
```

- 进度保存在浏览器 `localStorage`（键见 §4.4），清除后即重置。
- 建议全屏游玩，手距离摄像头 **30–80 cm**、光线充足，效果最佳。

---

## 三、运行方式

### 3.1 环境要求

- **Node.js ≥ 18**（推荐 20+）
- 现代浏览器（Chrome / Edge / Safari 等），需支持 **WebGL** 与摄像头
- 摄像头是**安全上下文**要求：用 `http://localhost` 开发即可；如需在局域网/其它域名访问，请走 **HTTPS**

### 3.2 常用命令

```bash
npm install          # 安装依赖

npm run dev          # 开发服务器 → http://localhost:5173
npm run build        # 生产构建 → dist/
npm run preview      # 本地预览生产产物 → http://localhost:4173
```

> 首次打开浏览器会请求摄像头权限，请点击「允许」。

---

## 四、参数与配置

### 4.1 页面级 / 运行时开关

| 配置 | 方式 | 说明 |
| --- | --- | --- |
| 调试面板 | 游戏舞台**左上角常驻「Debug」按钮** | 点击展开/收起位于**游戏区域下方**的 StatusPanel（整行栏，不悬浮不遮挡舞台）：手势名 / 手指状态 / 捏合比值 / FPS / delegate / 摄像头切换 / 滚动日志 |
| 推理 delegate | 调试面板内 **Switch** 按钮 | 在 `GPU+WebGL` 与 `CPU+WASM` 间运行时切换 |
| 抓取方式 | 设置弹框「Grab mode」或游戏内左下角按钮 | `pinch`（捏合）/ `fist`（握拳），持久化到 localStorage |
| 摄像头画面 | 设置弹框「Show camera feed」或舞台左下角按钮 | 是否显示摄像头画面 |
| 视频质量 | 设置弹框「Video quality」 | `480p` / `720p` / `1080p`（默认 720p），对应采集分辨率 |
| 背景音乐 | 内置，进页面即循环 | 音量 0.35，代码见 `src/App.vue`（`BGM_VOLUME`） |
| 随机背景 | 每局自动轮换 | 7 张 1920×1080 背景在进入关卡时随机切换 |

### 4.2 关卡配置 —— `src/config/pinch-pop-bubbles/levels.js`

直接改这个文件即可调整关卡数量、难度与过关要求（无需改引擎代码）。

| 字段 | 含义 |
| --- | --- |
| `bubbleCount` | 泡泡总数 |
| `clusterCount` | 泡泡分成几堆（越小越集中，越容易） |
| `sameColorRatio` | 同色相邻占比 0~1（越高越容易消除） |
| `colorCount` | 颜色种类（2–4） |
| `passScore` | 过关所需分数 |
| `passMode` | `"OR"`：分数达标 **或** 清空全部；`"AND"`：两者都需满足 |
| `aimLineLength` | 瞄准虚线可见长度（内容高度比例，越大越容易瞄准） |

当前 13 关参数一览：

| 关 | 泡泡 | 堆数 | 同色比 | 颜色 | 过关分 | 模式 | 方向线 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 30 | 2 | 0.80 | 2 | 720 | OR | 1.00 |
| 2 | 50 | 3 | 0.60 | 3 | 2000 | OR | 0.95 |
| 3 | 70 | 3 | 0.50 | 3 | 3920 | OR | 0.90 |
| 4 | 90 | 4 | 0.40 | 3 | 6480 | OR | 0.85 |
| 5 | 110 | 4 | 0.65 | 3 | 9680 | OR | 0.80 |
| 6 | 130 | 4 | 0.60 | 3 | 13520 | OR | 0.78 |
| 7 | 150 | 4 | 0.55 | 4 | 18000 | OR | 0.75 |
| 8 | 170 | 4 | 0.50 | 4 | 23120 | OR | 0.72 |
| 9 | 190 | 4 | 0.45 | 4 | 28880 | OR | 0.70 |
| 10 | 210 | 4 | 0.40 | 4 | 35280 | OR | 0.68 |
| 11 | 140 | 4 | 0.10 | 4 | 12000 | AND | 0.65 |
| 12 | 250 | 4 | 0.35 | 4 | 50000 | AND | 0.62 |
| 13 | 270 | 4 | 0.30 | 4 | 58320 | AND | 0.60 |

难度曲线：1–10 关靠数量/颜色/同色比递增（OR 可用高分兜底）；11–13 关改 AND 且同色比骤降，必须同时清空并达标。

### 4.3 引擎参数（如需调手感，改 `src/utils/pinch-pop-bubbles/bubbleGame.js` 顶部常量）

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `BUBBLE_SIZE_RATIO` | 0.025 | 泡泡半径 = 内容区最小边长比例 |
| `FLY_SPEED_RATIO` | 1.8 | 泡泡飞行速度 = 内容高度 × 该比例 / 秒 |
| `POP_DURATION_MS` / `POP_STAGGER_MS` | 350 / 50 | 爆裂动画时长 / 连续消除错开间隔 |
| `GRAVITY_PX_PER_S2` | 900 | 爆裂粒子重力 |
| `SQUISH_DURATION_MS` / `AMPLITUDE` | 320 / 0.22 | 碰撞「Q 弹」形变 |
| `PINCH_GRAB_MIN / MAX` | 0.2 / 0.4 | 捏合抓取区间（归一化比值） |
| `PINCH_LAUNCH` / `PINCH_CANCEL` | 0.5 / 2.0 | 捏合发射 / 取消阈值 |
| `FIST_GRAB_MIN / MAX` | -0.01 / 0.35 | 握拳抓取区间 |
| `FIST_LAUNCH` / `FIST_CANCEL` | 0.7 / 2.0 | 握拳发射 / 取消阈值 |

> 归一化比值 = 拇指-食指间距 ÷ 手指长度，尺度无关（离摄像头远近不影响判定）；捏合/开合均做 EMA 平滑。

### 4.4 本地存储键

| 键 | 内容 |
| --- | --- |
| `swayjoy:pinch-pop-bubbles:progress` | 已通过关卡 id 数组（JSON） |
| `swayjoy:pinch-pop-bubbles:settings` | 抓取方式 / 摄像头画面 / 视频质量（JSON） |

---

## 五、目录结构

```
src/
├── App.vue                          # 入口页：H1「Bubble Shooter」+ How to Play + 舞台 + 舞台下方 Debug 面板（左上角按钮开合）+ BGM
├── main.ts                          # 启动；全局注册 PinchPopBubbles* 组件；载入共用样式
├── components/pinch-pop-bubbles/    # 界面组件（内部目录名沿用 pinch-pop-bubbles）
│   ├── GameClient.vue               # 核心外壳：摄像头 + 双画布 + 三路 rAF 循环 + 关卡覆盖层切换 + debugOverlay 插槽（App 注入左上角 Debug 按钮）
│   ├── GameSettings.vue             # 设置弹框（抓取方式 / 摄像头画面 / 视频质量）
│   ├── LevelHome.vue                # 首页（New Game / Continue）
│   ├── LevelIntro.vue               # 关卡预览（条件 + 难度星 + 8s 倒计时）
│   ├── LevelComplete.vue            # 通关恭喜（彩带 + 奖杯 + 5s 倒计时）
│   ├── LevelMap.vue                 # 路线图（SVG 蛇形节点 + 奖杯）
│   └── StatusPanel.vue              # 调试面板内容（渲染在游戏区域下方，左上角 Debug 按钮控制开合）
├── composables/pinch-pop-bubbles/   # 状态单例（关卡状态机 / 游戏设置 / 调试面板）
├── utils/                           # 摄像头 / MediaPipe 追踪 / 手势识别 / 格式化 / 资源前缀
│   └── pinch-pop-bubbles/           # 游戏引擎 bubbleGame.js（六边形网格 + 物理）+ handRig.js（动漫手绑定）
├── config/pinch-pop-bubbles/levels.js  # 13 关配置（见 §4.2）
├── types/game.d.ts                  # 手势 / 引擎类型
└── assets/css/                      # main.css（共用）+ pinch-pop-bubbles.css（游戏专属）

public/                              # 静态资源，运行期原样以 / 提供
├── dg.png                           # 弹弓图
├── pinch-pop-bubbles/               # 游戏背景等
├── game-common-ui/                  # 关卡卡片/按钮共用贴图
└── storage/
    ├── pinch-pop-bubbles/           # 泡泡球 / 手部零件 / 奖杯 / 图标 / 音效 / 背景轮换图 / BGM
    └── vendor/mediapipe/tasks/      # MediaPipe hand_landmarker.task + vision WASM（本地推理）
```

---

## 六、常见问题

| 现象 | 处理 |
| --- | --- |
| 提示摄像头权限被拒 / 启动失败 | 确认已允许权限；必须 **localhost 或 HTTPS**（手机、局域网访问用 HTTPS）后刷新 |
| 一直停在 Loading 不进入 | 点舞台左上角 **Debug** 看 delegate 是否异常；确认 `public/storage/vendor/mediapipe/tasks/` 下模型与 WASM 文件齐全 |
| 手部识别不稳 / 老是抓不到 | 手离摄像头 30–80 cm、光线均匀、不要有第二只手入镜；在设置里把摄像头画面打开便于观察 |
| 帧率偏低 | 摄像头质量降到 480p；在调试面板确认 delegate 为 `GPU+WebGL`（若回退 CPU 属低端机正常现象） |
| 进度 / 设置重置 | 清除浏览器站点数据会同时清掉 localStorage 里的进度键（§4.4） |

---

## License

MIT — 见 [LICENSE](LICENSE)。

---

## 作者

**Holy Yang** · [https://swayjoy.com/about](https://swayjoy.com/about)
