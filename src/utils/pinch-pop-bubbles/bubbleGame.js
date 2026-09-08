// 泡泡射击游戏引擎
// 通过摄像头手部追踪控制的泡泡射击游戏，叠加在摄像头画面上。

import { mediaUrl } from "~/utils/media";

const COLORS = ["#a855f7", "#22c55e", "#eab308", "#ef4444"]; // 紫、绿、黄、红（图片加载前的兜底色）
// 素材走 CDN 子域（public/storage/pinch-pop-bubbles → storage.swayjoy.com/pinch-pop-bubbles），见 app/utils/media.js
const BALL_IMAGES = [
  mediaUrl("/storage/pinch-pop-bubbles/purple-ball.webp"),
  mediaUrl("/storage/pinch-pop-bubbles/green-ball.webp"),
  mediaUrl("/storage/pinch-pop-bubbles/yellow-ball.webp"),
  mediaUrl("/storage/pinch-pop-bubbles/red-ball.webp"),
];
const BUBBLE_SIZE_RATIO = 0.025; // 泡泡半径 = 视频内容区域最小边长的 2.5%
const POP_DURATION_MS = 350; // 单个泡泡爆裂动画时长
const POP_STAGGER_MS = 50; // 连续消除时，每个泡泡爆裂之间的间隔
const GRAVITY_PX_PER_S2 = 900; // 爆裂粒子所受重力（像素/秒²）
const FLY_SPEED_RATIO = 1.8; // 每秒像素数 = rect.h * 该比例
const SQUISH_DURATION_MS = 320; // 碰撞形变（Q 弹）动画时长
const SQUISH_AMPLITUDE = 0.22; // 碰撞形变的最大压缩幅度

// 尺度无关的捏合阈值 —— 拇指-食指距离 / 手指长度 的比值
// （由 GameClient 在传入前对捏合距离做归一化得到）。
// 这些取代了旧的基于像素的 `D * n` 阈值（那些会随手的大小变化，导致抓取/松开误判）。
const PINCH_GRAB_MIN = 0.2; // 捏合抓取最小阈值：两指间距比值≥此数值，才可触发抓取泡泡
const PINCH_GRAB_MAX = 0.4; // 捏合抓取最大阈值：两指间距比值≤此数值，持续保持抓取状态
const PINCH_LAUNCH = 0.5; // 手指张开超过该比例 → 发射
const PINCH_CANCEL = 2.0; // 手指完全张开超过该比例 → 取消（放弃）

// 握拳抓取模式的尺度无关阈值（fistRatio：0=完全握拳，1=五指伸展）。
// 方向与捏合一致：越小越「闭合」→ 抓取，越大越「张开」→ 发射。
const FIST_GRAB_MIN = -0.01; // 允许完全握拳（ratio≈0）也能稳定触发抓取
const FIST_GRAB_MAX = 0.35; // 握拳闭合状态的上限
const FIST_LAUNCH = 0.7; // 五指伸展超过该比例 → 发射
const FIST_CANCEL = 2.0; // 远高于 1（fistRatio 封顶 1），拳模式不会误触「取消」

export class BubbleGame {
  /**
   * @param {HTMLCanvasElement} canvas - 游戏画布
   * @param {HTMLVideoElement} videoEl - 用于布局参考的视频元素
   * @param {() => {x:number, y:number, w:number, h:number, dpr:number}} getContentRectFn
   */
  constructor(canvas, videoEl, getContentRectFn) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { desynchronized: true });
    this.videoEl = videoEl;
    this.getContentRectFn = getContentRectFn;

    // 游戏状态
    this.state = "ready"; // 状态：ready | grabbed | flying | landing | matching | popping | win | lose
    this.mode = "relaxed"; // 模式："relaxed"（宽松）| "strict"（严格）
    this.grabMode = "pinch"; // 抓取方式："pinch"（拇指+食指捏合，默认）| "fist"（握拳）
    this.score = 0;
    this.grid = []; // grid[row][col] = 颜色索引（0-3）或 null
    this.colorIdx = 0; // 下一个泡泡的顺序颜色计数器

    // 关卡配置
    this._levelConfig = null; // loadLevel() 传入的关卡参数
    this._colorCount = COLORS.length; // 本关使用的颜色数
    this._aimLineLength = 1; // 方向线可见长度（内容高度比例）

    // 位置（画布像素坐标，未镜像）
    this.slingX = 0;
    this.slingY = 0; // 弹弓顶部中心（泡泡的静止位置）
    this.bubblePos = null; // {x, y} 弹弓/当前泡泡的位置
    this.pullPos = null; // {x, y} 泡泡被拉到的位置
    this.flyPos = null; // {x, y} 飞行中泡泡的位置
    this.flyDir = null; // {x, y} 归一化的发射方向
    this.bubbleR = 20; // 会在 reset() 中重新计算
    this.dpr = 1;

    // 六边形网格布局（在 reset 中计算）
    this._cols = 9; // 动态：根据游戏区域宽度计算
    this.colW = 0; // 列宽 = bubbleR * 2
    this.rowH = 0; // 行高 = bubbleR * 2 * sqrt(3)/2
    this.gridLeft = 0;
    this.gridTop = 0;

    // 游戏区域边界（来自视频内容区域）
    this.playLeft = 0;
    this.playRight = 0;
    this.playTop = 0;
    this.playBottom = 0;

    // 抓取边界检测
    this.wasNearSlingshot = false;
    this.grabbedPinchOk = false;

    // 爆裂动画
    this.matchedCells = []; // [{row, col, color}]
    this.popStartTime = 0;

    // 下落动画（悬浮/孤儿泡泡）
    this._droppingCells = [];
    this._dropStartTime = 0;

    // 爆裂粒子（水滴飞溅）
    this._particles = [];
    // 碰撞形变（Q 弹）动画
    this._squishes = [];
    // 预渲染粒子圆点精灵（按颜色），用 drawImage 绘制，避免 Safari 上每帧 arc() 卡顿
    this._particleSprites = COLORS.map((color) => {
      const size = 32;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const c2 = c.getContext("2d");
      c2.fillStyle = color;
      c2.beginPath();
      c2.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      c2.fill();
      return c;
    });

    // 已放置的格子（用于匹配检测）
    this.placedRow = -1;
    this.placedCol = -1;

    // 上一次更新时间戳（用于计算 delta-time）
    this.lastTs = 0;

    // 侧墙反弹计数器（最多 3 次后泡泡消失）
    this.bounceCount = 0;

    // 宽松模式抓取锚点（捏合起始位置）
    this._grabAnchorX = 0;
    this._grabAnchorY = 0;
    this._grabBaseOffsetY = 0; // 抓取时捏合点相对弹弓下方的偏移
    this._lastValidTargetX = 0; // 上一次有效的拉弓目标（松手前）
    this._lastValidTargetY = 0;
    this._seenOpen = false; // 必须先看到手张开才允许抓取
    this._pinchWasGrabbing = false; // 防止追踪抖动导致误发射
    this._pinchStableFrames = 0; // 去抖：必须连续 N 帧保持捏合

    // 弹弓图片
    this.slingImg = new Image();
    this.slingImg.src = "/dg.png";
    this.slingImgLoaded = false;
    this.slingImg.onload = () => { this.slingImgLoaded = true; };

    // 球体图片素材（按颜色索引：紫、绿、黄、红）
    this.ballImgs = BALL_IMAGES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });

    // 泡泡破裂音效：优先用 Web Audio API（预解码、低延迟，避免 HTMLAudioElement 卡顿）
    this._audioCtx = null;
    this._popBuffer = null;
    this._audioLoaded = false;

    // 兜底：HTMLAudioElement 音频池（Web Audio 不可用时使用）
    this.popSounds = [];
    this._popSoundIdx = 0;
    for (let i = 0; i < 5; i++) {
      const audio = new Audio(mediaUrl("/storage/pinch-pop-bubbles/bubble-brack.wav"));
      audio.preload = "auto";
      this.popSounds.push(audio);
    }

    this.reset();
  }

  // ---- 公共 API ----

  setMode(mode) {
    this.mode = mode;
  }

  getMode() {
    return this.mode;
  }

  /** 设置抓取方式："pinch"（默认，拇指+食指捏合）或 "fist"（握拳）。 */
  setGrabMode(mode) {
    this.grabMode = mode === "fist" ? "fist" : "pinch";
  }

  getGrabMode() {
    return this.grabMode;
  }

  // 抓取/发射阈值的模式适配：捏合与握拳共用同一套「闭合→抓取，张开→发射」逻辑，
  // 只是阈值不同。握拳模式下 fistRatio 由 GameClient 归一化到与捏合同一方向。
  get _grabMin() {
    return this.grabMode === "fist" ? FIST_GRAB_MIN : PINCH_GRAB_MIN;
  }
  get _grabMax() {
    return this.grabMode === "fist" ? FIST_GRAB_MAX : PINCH_GRAB_MAX;
  }
  get _launchRatio() {
    return this.grabMode === "fist" ? FIST_LAUNCH : PINCH_LAUNCH;
  }
  get _cancelRatio() {
    return this.grabMode === "fist" ? FIST_CANCEL : PINCH_CANCEL;
  }

  /** 载入关卡配置并重置游戏。 */
  loadLevel(config) {
    this._levelConfig = config || null;
    this._colorCount = config?.colorCount ?? COLORS.length;
    this._aimLineLength = config?.aimLineLength ?? 1;
    this.reset();
  }

  /** 当前关卡配置（供外部展示过关要求）。 */
  getLevelConfig() {
    return this._levelConfig;
  }

  /** 是否满足过关条件（OR / AND）。 */
  isWinConditionMet() {
    return this._checkWin();
  }

  /** 重新计算布局但不重置游戏状态（用于全屏切换等场景） */
  recalcLayout() {
    const rect = this.getContentRectFn();
    this.dpr = rect.dpr || 1;
    this.bubbleR = Math.max(8, Math.min(rect.w, rect.h) * BUBBLE_SIZE_RATIO);
    this.colW = this.bubbleR * 2;
    this.rowH = this.bubbleR * 2 * 0.866;
    // 网格横跨整个游戏区域宽度
    this._cols = Math.floor((rect.w - this.bubbleR) / this.colW) + 1;
    this.gridLeft = rect.x;
    this.gridTop = rect.y; // 网格从游戏区域顶部边缘开始

    this.playLeft = rect.x;
    this.playRight = rect.x + rect.w;
    this.playTop = rect.y;
    this.playBottom = rect.y + rect.h;

    this.slingX = rect.x + rect.w / 2;
    this.slingY = rect.y + rect.h * 0.85 - Math.round(40 * this.dpr);

    // 如果不在飞行中则更新泡泡位置
    if (this.state !== "flying") {
      this.bubblePos = { x: this.slingX, y: this.slingY };
    }
  }

  reset() {
    this.state = "ready";
    this.score = 0;
    this.grid = [];
    this.colorIdx = 0;
    this.bubblePos = null;
    this.pullPos = null;
    this.flyPos = null;
    this.flyDir = null;
    this.matchedCells = [];
    this._droppingCells = [];
    this._dropStartTime = 0;
    this._particles = [];
    this._squishes = [];
    this.placedRow = -1;
    this.placedCol = -1;
    this.wasNearSlingshot = false;
    this.grabbedPinchOk = false;
    this.lastTs = 0;
    this.bounceCount = 0;

    this.recalcLayout();

    // 在弹弓处放置初始泡泡
    this.bubblePos = { x: this.slingX, y: this.slingY };
    this.currentColor = this._nextColor();

    // 生成初始网格
    this._initGrid();
  }

  /**
   * 每帧用手部追踪数据调用。
   * @param {{x:number, y:number}} thumbTip - 拇指指尖的画布像素位置
   * @param {{x:number, y:number}} indexTip - 食指指尖的画布像素位置
   * @param {number|null} pinchRatio - 尺度无关的开合比值（捏合：拇指-食指距离/手指长度；握拳：0=握拳,1=伸展）
   * @param {number} timestamp - performance.now()
   * @param {{x:number, y:number}|null} [grabCenter] - 抓取锚点（握拳模式为拳心；缺省时用拇指-食指中点）
   */
  update(thumbTip, indexTip, pinchRatio, timestamp, grabCenter) {
    const dt = this.lastTs ? Math.min((timestamp - this.lastTs) / 1000, 0.1) : 0.016;
    this.lastTs = timestamp;

    // 每帧更新爆裂粒子（清理已结束的粒子）
    this._updateParticles();
    // 每帧更新碰撞形变（清理已结束的形变）
    this._updateSquishes();

    // 未检测到手：取消抓取，但飞行/爆裂动画继续
    if (!thumbTip || !indexTip) {
      if (this.state === "grabbed") {
        this.state = "ready";
        this.pullPos = null;
        this.grabbedPinchOk = false;
        this._seenOpen = false;
        this._pinchStableFrames = 0;
        this.bubblePos = { x: this.slingX, y: this.slingY };
      }
      if (this.state === "flying") {
        this._updateFlying(dt);
      } else if (this.state === "popping") {
        this._updatePopping(timestamp);
      } else if (this.state === "dropping") {
        this._updateDropping(timestamp);
      }
      this._render();
      return;
    }

    // 抓取锚点：握拳模式由 GameClient 传入拳心（MCP 关节均值）；捏合模式用拇指-食指中点。
    const pinchCenter = grabCenter
      ? { x: grabCenter.x, y: grabCenter.y }
      : { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 };
    const D = this.bubbleR * 2; // 泡泡直径

    switch (this.state) {
      case "ready":
        this._updateReady(pinchCenter, pinchRatio, D);
        break;
      case "grabbed":
        this._updateGrabbed(pinchCenter, pinchRatio, D);
        break;
      case "flying":
        this._updateFlying(dt);
        break;
      case "popping":
        this._updatePopping(timestamp);
        break;
      case "dropping":
        this._updateDropping(timestamp);
        break;
      case "landing":
      case "matching":
        // 短暂的暂停状态，处理完成后切换
        break;
      case "win":
      case "lose":
        // 不做任何事；等待重新开始
        break;
    }

    this._render();
  }

  // ---- 各状态的更新逻辑 ----

  /** @private */
  _updateReady(pinchCenter, pinchRatio, D) {
    const distToSling = Math.hypot(pinchCenter.x - this.slingX, pinchCenter.y - this.slingY);
    const nearSlingshot = distToSling < D * 2;
    const pinchOk = pinchRatio != null && pinchRatio > this._grabMin && pinchRatio < this._grabMax;

    if (this.mode === "relaxed") {
      // 宽松模式：捏合稳定若干帧后才抓取
      // （防止手快速移动导致的误抓取）
      if (pinchOk && this._seenOpen) {
        this._pinchStableFrames++;
      } else {
        this._pinchStableFrames = 0;
      }

      if (pinchOk && !this.grabbedPinchOk && this._seenOpen && this._pinchStableFrames >= 3) {
        this.grabbedPinchOk = true;
        this.state = "grabbed";
        this._grabAnchorX = pinchCenter.x;
        this._grabAnchorY = pinchCenter.y;
        this._grabBaseOffsetY = Math.max(0, pinchCenter.y - this.slingY);
        this.pullPos = { x: this.slingX, y: this.slingY };
        this.wasNearSlingshot = true;
      }
      if (!pinchOk) {
        this.grabbedPinchOk = false;
        this._seenOpen = true; // 手之前是张开的，现在允许抓取
        this._pinchWasGrabbing = false;
        this._pinchStableFrames = 0;
      }
    } else {
      // 严格模式：必须在弹弓附近捏合
      if (nearSlingshot && pinchOk && !this.grabbedPinchOk) {
        this.grabbedPinchOk = true;
        this.state = "grabbed";
        this.pullPos = { x: pinchCenter.x, y: pinchCenter.y };
        this.wasNearSlingshot = true;
      }
      if (!nearSlingshot) {
        this.grabbedPinchOk = false;
      }
    }

    this.bubblePos = { x: this.slingX, y: this.slingY };
  }

  /** @private */
  _updateGrabbed(pinchCenter, pinchRatio, D) {
    const distToSling = Math.hypot(pinchCenter.x - this.slingX, pinchCenter.y - this.slingY);

    if (this.mode === "relaxed") {
      // 记录上一次有效的拉弓目标（手指开始张开前）
      if (pinchRatio != null && pinchRatio <= this._launchRatio) {
        this._pinchWasGrabbing = true;
        const totalDeltaX = pinchCenter.x - this._grabAnchorX;
        const totalDeltaY = this._grabBaseOffsetY + (pinchCenter.y - this._grabAnchorY);
        this._lastValidTargetX = this.slingX + totalDeltaX;
        this._lastValidTargetY = Math.max(this.slingY, this.slingY + totalDeltaY);
      }

      // 捏合完全张开则取消（远超正常发射的张开程度）
      if (pinchRatio == null || pinchRatio > this._cancelRatio) {
        this.state = "ready";
        this.pullPos = null;
        this.grabbedPinchOk = false;
        this._pinchWasGrabbing = false;
        this.bubblePos = { x: this.slingX, y: this.slingY };
        return;
      }

      // 发射：使用当前的拉动位置（与方向线一致，松手期间 pullPos 已冻结）
      if (this._pinchWasGrabbing && pinchRatio > this._launchRatio) {
        this._launch(this.pullPos.x, this.pullPos.y);
        return;
      }

      // 将手移动的位移映射到弹弓位置（EMA 平滑用于显示）
      const totalDeltaX = pinchCenter.x - this._grabAnchorX;
      const totalDeltaY = this._grabBaseOffsetY + (pinchCenter.y - this._grabAnchorY);
      const targetX = this.slingX + totalDeltaX;
      const targetY = Math.max(this.slingY, this.slingY + totalDeltaY);
      const alpha = 0.3;
      this.pullPos = {
        x: this.pullPos.x + (targetX - this.pullPos.x) * alpha,
        y: this.pullPos.y + (targetY - this.pullPos.y) * alpha,
      };
      this.bubblePos = { x: this.pullPos.x, y: this.pullPos.y };
    } else {
      // 严格模式：手移动太远则取消
      if (distToSling > D * 5) {
        this.state = "ready";
        this.pullPos = null;
        this.grabbedPinchOk = false;
        this.bubblePos = { x: this.slingX, y: this.slingY };
        return;
      }

      // 记录上一次有效的拉弓位置
      if (pinchRatio != null && pinchRatio <= this._launchRatio) {
        this._lastValidTargetX = this.pullPos.x;
        this._lastValidTargetY = this.pullPos.y;
      }

      // 发射：手指张开超过发射比值（使用当前拉动位置，与方向线一致）
      if (pinchRatio != null && pinchRatio > this._launchRatio) {
        this._launch(this.pullPos.x, this.pullPos.y);
        return;
      }

      // 拖拽：泡泡跟随捏合中心，带 EMA 平滑
      const clampedY = Math.max(this.slingY, pinchCenter.y);
      const alpha = 0.25;
      this.pullPos = {
        x: this.pullPos.x + (pinchCenter.x - this.pullPos.x) * alpha,
        y: this.pullPos.y + (clampedY - this.pullPos.y) * alpha,
      };
      this.bubblePos = { x: this.pullPos.x, y: this.pullPos.y };
    }
  }

  /** @private */
  _updateFlying(dt) {
    if (!this.flyPos || !this.flyDir) return;

    const speed = this._getContentH() * FLY_SPEED_RATIO;
    const R = this.bubbleR;
    const totalDist = speed * dt;

    // 子步进：以小增量移动（≤ 0.2× 泡泡半径）以防止穿透
    const stepSize = R * 0.2;
    const steps = Math.max(1, Math.ceil(totalDist / stepSize));
    const stepDist = totalDist / steps;

    for (let i = 0; i < steps; i++) {
      this.flyPos.x += this.flyDir.x * stepDist;
      this.flyPos.y += this.flyDir.y * stepDist;

      // 顶边：泡泡立即吸附，不反弹
      if (this.flyPos.y - R <= this.playTop) {
        this.flyPos.y = this.playTop + R;
        this._land({ type: "top" });
        return;
      }

      // 侧墙反弹
      let bounced = false;
      if (this.flyPos.x - R <= this.playLeft) {
        this.flyPos.x = this.playLeft + R;
        this.flyDir.x = Math.abs(this.flyDir.x);
        bounced = true;
      } else if (this.flyPos.x + R >= this.playRight) {
        this.flyPos.x = this.playRight - R;
        this.flyDir.x = -Math.abs(this.flyDir.x);
        bounced = true;
      }
      if (bounced) {
        this.bounceCount++;
        if (this.bounceCount >= 3) {
          this.flyPos = null;
          this.flyDir = null;
          this._spawnNext();
          return;
        }
      }

      // 在每个子步检查格子碰撞（忽略底边，泡泡始终向上飞）
      const hit = this._checkCollision(this.flyPos);
      if (hit && hit.type === "cell") {
        // 先算出落点格子，用于在落点位置做形变（而不是在接触点做，避免多出影子）
        const landing = this._findNearestEmptyCell(this.flyPos, hit);
        this._addCollisionSquish(hit, landing);
        this._land(hit);
        return;
      }
    }

    // 兜底：所有子步完成后，再做一次最终碰撞检测
    // 以捕获泡泡穿透检测的边界情况。
    if (this.flyPos) {
      const safetyHit = this._checkCollision(this.flyPos);
      if (safetyHit && safetyHit.type === "cell") {
        this._land(safetyHit);
      }
    }
  }

  /** @private */
  _updatePopping(timestamp) {
    // 为已轮到爆裂但还没生成粒子的格子生成水滴飞溅
    for (const cell of this.matchedCells) {
      if (cell.spawned) continue;
      if (timestamp - this.popStartTime >= (cell.delay ?? 0)) {
        cell.spawned = true;
        this._spawnPopParticles(this._getCellCenter(cell.row, cell.col), cell.color);
      }
    }

    // 总时长 = 单个爆裂时长 + 最后一个格子的延迟
    const maxDelay = this.matchedCells.reduce((max, m) => Math.max(max, m.delay ?? 0), 0);
    if (timestamp - this.popStartTime >= POP_DURATION_MS + maxDelay) {
      // 从网格中移除爆裂的格子
      for (const { row, col } of this.matchedCells) {
        if (this.grid[row]) this.grid[row][col] = null;
      }
      this.score += this.matchedCells.length * 100;
      this.matchedCells = [];

      // 找到并掉落悬浮（孤儿）泡泡
      const floating = this._findFloatingBubbles();
      if (floating.length > 0) {
        for (const { row, col } of floating) {
          if (this.grid[row]) this.grid[row][col] = null;
        }
        this.score += floating.length * 200;
        // 存下来用于动画
        this._droppingCells = floating;
        this._dropStartTime = timestamp;
        this.state = "dropping";
      } else if (this._checkWin()) {
        this.state = "win";
      } else if (this._allCleared()) {
        // 已清空但未达过关条件（AND 模式下分数不够）
        this.state = "lose";
      } else {
        this._spawnNext();
      }
    }
  }

  _updateDropping(timestamp) {
    if (timestamp - this._dropStartTime >= POP_DURATION_MS) {
      this._droppingCells = [];
      if (this._checkWin()) {
        this.state = "win";
      } else if (this._allCleared()) {
        this.state = "lose";
      } else {
        this._spawnNext();
      }
    }
  }

  // ---- 核心机制 ----

  /** @private */
  _launch(fromX, fromY) {
    // 方向取自真实拉动位置（不裁剪，与方向线保持一致）
    const px = fromX ?? this.pullPos.x;
    const py = fromY ?? this.pullPos.y;
    const dx = this.slingX - px;
    const dy = this.slingY - py;
    const len = Math.hypot(dx, dy) || 1;

    // 拉弓太短：取消，泡泡回到弹弓
    if (len < this.bubbleR * 0.5) {
      this.state = "ready";
      this.pullPos = null;
      this.grabbedPinchOk = false;
      this._pinchWasGrabbing = false;
      this.bubblePos = { x: this.slingX, y: this.slingY };
      return;
    }

    this.state = "flying";

    // 方向：从拉动位置指向弹弓中心，朝上
    let dirX = dx / len;
    let dirY = dy / len;

    // 确保朝上。若方向向下则默认竖直向上。
    if (dirY >= 0) {
      dirX = 0;
      dirY = -1;
    }

    this.flyDir = { x: dirX, y: dirY };

    // 起飞点与方向线一致，使用真实拉动位置（不再裁剪，避免与方向线偏移）
    this.flyPos = { x: px, y: py };

    this.pullPos = null;
    this.grabbedPinchOk = false;
    this._pinchWasGrabbing = false;
  }

  /**
   * 检测飞行泡泡与网格泡泡/边界之间的碰撞。
   * 找到最近的碰撞格子（而非遍历顺序中的第一个），
   * 防止吸附到错误的格子。
   * @returns {null|{type:'cell',row:number,col:number,dist:number}|{type:'top'}|{type:'bottom'}}
   */
  /** @private */
  _checkCollision(pos) {
    const R = this.bubbleR;

    // 顶边（视频内容区域边界）
    if (pos.y - R <= this.playTop) {
      return { type: "top" };
    }

    // 底边（视频内容区域边界）
    if (pos.y + R >= this.playBottom) {
      return { type: "bottom" };
    }

    // 检查每个网格格子 —— 找到碰撞范围内最近的一个
    let bestR = -1;
    let bestC = -1;
    let bestDist = Infinity;

    for (let r = 0; r < this.grid.length; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c] == null) continue;
        const center = this._getCellCenter(r, c);
        const dist = Math.hypot(pos.x - center.x, pos.y - center.y);
        if (dist < R * 2 && dist < bestDist) {
          bestDist = dist;
          bestR = r;
          bestC = c;
        }
      }
    }

    if (bestR >= 0) {
      return { type: "cell", row: bestR, col: bestC, dist: bestDist };
    }

    return null;
  }

  /**
   * 将飞行泡泡落到最近的合法空格位置。
   */
  /** @private */
  _land(hit) {
    const pos = this.flyPos;

    // 顶边：始终放在第 0 行（若满了则插入新行）
    if (hit.type === "top") {
      this._placeAtTopEdge();
      return;
    }

    const { row, col } = this._findNearestEmptyCell(pos, hit);
    if (row < 0 || col < 0) {
      this._placeAtTopEdge();
      return;
    }
    this._placeBubble(row, col, this.currentColor);
  }

  /** @private */
  _findNearestEmptyCell(pos, hit) {
    let bestRow = -1;
    let bestCol = -1;
    let bestDist = Infinity;

    // 始终搜索所有与已填充格子相邻的空格，
    // 以及命中顶边时的第 0 行格子。
    // 这防止泡泡穿透到被命中格子后面的格子。
    const candidates = new Set();

    if (hit.type === "top") {
      // 顶边：同时考虑第 0 行的格子
      const row0 = this._getRowLength(0);
      for (let c = 0; c < row0; c++) {
        if (!this.grid[0] || this.grid[0][c] == null) {
          candidates.add("0," + c);
        }
      }
    }

    // 始终扫描所有有已填充邻居的空格
    // （与命中类型无关 —— 不限于被命中格子的邻居）
    for (let r = 0; r <= this.grid.length; r++) {
      const rl = this._getRowLength(r);
      for (let c = 0; c < rl; c++) {
        if (this._isCellEmpty(r, c) && this._hasFilledNeighbor(r, c)) {
          candidates.add(r + "," + c);
        }
      }
    }

    // 若仍无候选（正常情况不会发生），兜底尝试第 0 行
    if (candidates.size === 0) {
      const row0 = this._getRowLength(0);
      for (let c = 0; c < row0; c++) {
        candidates.add("0," + c);
      }
    }

    // 找到最近的候选
    for (const key of candidates) {
      const [r, c] = key.split(",").map(Number);
      const center = this._getCellCenter(r, c);
      const d = Math.hypot(pos.x - center.x, pos.y - center.y);
      if (d < bestDist) {
        bestDist = d;
        bestRow = r;
        bestCol = c;
      }
    }

    return { row: bestRow, col: bestCol };
  }

  /** @private */
  _placeAtTopEdge() {
    // 始终放在顶部。若第 0 行没有空格，则插入一个新的空行。
    const rl = this._getRowLength(0);
    if (!this.grid[0]) this.grid[0] = new Array(rl).fill(null);

    // 找到第 0 行中最近的空列
    let bestC = 0;
    let bestDist = Infinity;
    for (let c = 0; c < rl; c++) {
      if (this.grid[0][c] == null) {
        const center = this._getCellCenter(0, c);
        const d = Math.hypot(this.flyPos.x - center.x, this.flyPos.y - center.y);
        if (d < bestDist) { bestDist = d; bestC = c; }
      }
    }

    if (bestDist >= Infinity) {
      // 第 0 行已满 —— 在顶部插入新的空行，把网格往下推
      this.grid.unshift(new Array(rl).fill(null));
      this.grid.forEach((row, i) => { if (i > 0) row.forEach((_, c) => { /* 保留现有内容 */ }); });
      // 重置 gridTop 使其保持在游戏区域顶部
      this.gridTop = this.playTop;
      // 现在第 0 行为空 —— 重新计算最近的列
      for (let c = 0; c < rl; c++) {
        const center = this._getCellCenter(0, c);
        const d = Math.hypot(this.flyPos.x - center.x, this.flyPos.y - center.y);
        if (d < bestDist) { bestDist = d; bestC = c; }
      }
    }

    this._placeBubble(0, bestC, this.currentColor);
  }

  /** @private */
  _placeBubble(row, col, color) {
    // 确保网格行存在
    while (this.grid.length <= row) {
      const r = this.grid.length;
      this.grid.push(new Array(this._getRowLength(r)).fill(null));
    }

    this.grid[row][col] = color;
    this.placedRow = row;
    this.placedCol = col;

    this.flyPos = null;
    this.flyDir = null;

    // 检查匹配
    const matches = this._findMatches(row, col);
    if (matches.length >= 3) {
      this.state = "popping";
      // 按从击中点开始的 BFS 顺序依次爆裂（每个格子带一个延迟）
      this.matchedCells = matches.map(([r, c], i) => ({
        row: r,
        col: c,
        color: this.grid[r][c],
        delay: i * POP_STAGGER_MS,
        spawned: false,
      }));
      this.popStartTime = performance.now();
    } else {
      this._spawnNext();
    }
  }

  /** @private */
  _spawnNext() {
    this.currentColor = this._nextColor();
    this.bubblePos = { x: this.slingX, y: this.slingY };
    this.pullPos = null;
    this.grabbedPinchOk = false;
    this.placedRow = -1;
    this.placedCol = -1;
    this.bounceCount = 0;

    // 检查死亡线：是否有网格泡泡的底边到达弹弓顶部
    if (this._checkDeadLine()) {
      this.state = "lose";
    } else {
      this.state = "ready";
    }
  }

  /**
   * 检查是否有网格泡泡的底边到达或越过死亡线。
   * 死亡线在弹弓顶部（slingY）。
   * @returns {boolean} 若游戏应结束则返回 true
   */
  /** @private */
  _checkDeadLine() {
    const deadLineY = this.slingY;
    for (let r = 0; r < this.grid.length; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c] == null) continue;
        const center = this._getCellCenter(r, c);
        // 泡泡的底边
        if (center.y + this.bubbleR >= deadLineY) {
          return true;
        }
      }
    }
    return false;
  }

  // ---- 网格辅助 ----

  /** @private 根据关卡配置生成网格（泡泡数量 / 堆数 / 同色相邻 / 颜色数）。 */
  _initGrid() {
    const cfg = this._levelConfig || {};
    const bubbleCount = cfg.bubbleCount ?? 30;
    const clusterCount = Math.max(1, cfg.clusterCount ?? 2);
    const sameColorRatio = cfg.sameColorRatio ?? 0.6;
    const colorCount = this._colorCount;

    // 按约 70% 填充密度估算行数
    const rows = Math.max(4, Math.ceil(bubbleCount / (this._cols * 0.7)));

    // 初始化空网格
    this.grid = [];
    for (let r = 0; r < rows; r++) {
      this.grid.push(new Array(this._getRowLength(r)).fill(null));
    }

    // 收集所有格子位置
    const allCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < this._getRowLength(r); c++) {
        allCells.push({ r, c });
      }
    }

    const targetCount = Math.min(bubbleCount, allCells.length);

    // 种子必须锚定在第 0 行（顶边），保证所有生成的泡泡都直接或间接依附到顶部，
    // 不会出现悬浮、不依附顶部的泡泡。簇的种子在第 0 行均匀分布。
    const row0Len = this._getRowLength(0);
    const nClusters = Math.min(clusterCount, row0Len);

    // 从种子 BFS 扩展，轮流填充每个簇，直到达到目标数量
    const filled = new Set();
    const clusterOf = {};
    const queues = [];
    for (let i = 0; i < nClusters; i++) {
      const c = Math.min(row0Len - 1, Math.floor((i * row0Len) / nClusters));
      queues.push([{ r: 0, c, cluster: i }]);
    }
    let placed = 0;

    while (placed < targetCount) {
      let progressed = false;
      for (let i = 0; i < queues.length && placed < targetCount; i++) {
        const q = queues[i];
        let cell = null;
        while (q.length) {
          const cand = q.shift();
          const key = cand.r + "," + cand.c;
          if (!filled.has(key)) {
            cell = cand;
            break;
          }
        }
        if (!cell) continue;
        const key = cell.r + "," + cell.c;
        filled.add(key);
        clusterOf[key] = cell.cluster;
        placed++;
        progressed = true;

        for (const [nr, nc] of this._getHexNeighbors(cell.r, cell.c)) {
          if (nr >= 0 && nr < rows && nc >= 0 && nc < this._getRowLength(nr)) {
            const nk = nr + "," + nc;
            if (!filled.has(nk)) {
              q.push({ r: nr, c: nc, cluster: cell.cluster });
            }
          }
        }
      }
      if (!progressed) break;
    }

    // 分配颜色：每个簇一个主色，簇内以 sameColorRatio 概率沿用主色，否则随机
    const clusterColors = [];
    for (let i = 0; i < nClusters; i++) {
      clusterColors.push(i % colorCount);
    }

    for (const key of filled) {
      const [r, c] = key.split(",").map(Number);
      const clusterIdx = clusterOf[key];
      const primary = clusterColors[clusterIdx];
      const usePrimary = Math.random() < sameColorRatio;
      this.grid[r][c] = usePrimary ? primary : Math.floor(Math.random() * colorCount);
    }
  }

  /**
   * 获取给定行的列数（偶数行有 COLS 列，奇数行有 COLS-1 列）。
   */
  /** @private */
  _getRowLength(row) {
    return row % 2 === 0 ? this._cols : this._cols - 1;
  }

  /**
   * 获取网格格子的画布像素中心位置。
   */
  /** @private */
  _getCellCenter(row, col) {
    const isOdd = row % 2 === 1;
    const offsetX = isOdd ? this.colW / 2 : 0;
    const x = this.gridLeft + col * this.colW + this.bubbleR + offsetX;
    const y = this.gridTop + row * this.rowH + this.bubbleR;
    return { x, y };
  }

  /**
   * 获取某个格子的 6 个六边形邻居坐标。
   */
  /** @private */
  _getHexNeighbors(row, col) {
    const isOdd = row % 2 === 1;
    const neighbors = [];

    if (isOdd) {
      // 奇数行（COLS-1 个格子，右偏）
      // 左上：(row-1, col) - 偶数行有 COLS 个格子
      if (row - 1 >= 0 && col >= 0 && col < this._getRowLength(row - 1))
        neighbors.push([row - 1, col]);
      // 右上：(row-1, col+1)
      if (row - 1 >= 0 && col + 1 >= 0 && col + 1 < this._getRowLength(row - 1))
        neighbors.push([row - 1, col + 1]);
      // 左
      if (col - 1 >= 0) neighbors.push([row, col - 1]);
      // 右
      if (col + 1 < this._getRowLength(row)) neighbors.push([row, col + 1]);
      // 左下
      if (row + 1 < this.grid.length && col >= 0 && col < this._getRowLength(row + 1))
        neighbors.push([row + 1, col]);
      // 右下
      if (row + 1 < this.grid.length && col + 1 >= 0 && col + 1 < this._getRowLength(row + 1))
        neighbors.push([row + 1, col + 1]);
    } else {
      // 偶数行（COLS 个格子，无偏移）
      // 左上：(row-1, col-1) - 奇数行有 COLS-1 个格子
      if (row - 1 >= 0 && col - 1 >= 0 && col - 1 < this._getRowLength(row - 1))
        neighbors.push([row - 1, col - 1]);
      // 右上：(row-1, col)
      if (row - 1 >= 0 && col >= 0 && col < this._getRowLength(row - 1))
        neighbors.push([row - 1, col]);
      // 左
      if (col - 1 >= 0) neighbors.push([row, col - 1]);
      // 右
      if (col + 1 < this._getRowLength(row)) neighbors.push([row, col + 1]);
      // 左下
      if (row + 1 < this.grid.length && col - 1 >= 0 && col - 1 < this._getRowLength(row + 1))
        neighbors.push([row + 1, col - 1]);
      // 右下
      if (row + 1 < this.grid.length && col >= 0 && col < this._getRowLength(row + 1))
        neighbors.push([row + 1, col]);
    }

    return neighbors;
  }

  /** @private */
  _isCellEmpty(row, col) {
    if (row < 0 || col < 0) return false;
    if (row >= this.grid.length) return true; // 超出网格 = 空
    const rowLen = this._getRowLength(row);
    if (col >= rowLen) return false;
    return this.grid[row][col] == null;
  }

  /** @private */
  _hasFilledNeighbor(row, col) {
    const neighbors = this._getHexNeighbors(row, col);
    for (const [nr, nc] of neighbors) {
      if (nr >= 0 && nr < this.grid.length && this.grid[nr] && this.grid[nr][nc] != null) {
        return true;
      }
    }
    // 第 0 行也与顶边相邻
    return row === 0;
  }

  /**
   * BFS 找到从 (row, col) 开始的所有相连同色格子。
   */
  /** @private */
  _findMatches(row, col) {
    if (row < 0 || row >= this.grid.length) return [];
    const rowArr = this.grid[row];
    if (!rowArr || col < 0 || col >= rowArr.length) return [];
    const targetColor = rowArr[col];
    if (targetColor == null) return [];

    const visited = new Set();
    const queue = [[row, col]];
    const result = [];
    visited.add(row + "," + col);

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      result.push([r, c]);

      const neighbors = this._getHexNeighbors(r, c);
      for (const [nr, nc] of neighbors) {
        const key = nr + "," + nc;
        if (visited.has(key)) continue;
        if (nr >= 0 && nr < this.grid.length && this.grid[nr] && this.grid[nr][nc] === targetColor) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }

    return result;
  }

  /** @private */
  /**
   * 找到所有未与顶部（第 0 行或 playTop）相连的泡泡。
   * 这些应该掉落并爆裂。
   */
  _findFloatingBubbles() {
    const visited = new Set();
    const queue = [];

    // 从第 0 行所有已填充格子开始 BFS（与顶部相连）
    if (this.grid[0]) {
      for (let c = 0; c < this.grid[0].length; c++) {
        if (this.grid[0][c] != null) {
          const key = "0," + c;
          visited.add(key);
          queue.push([0, c]);
        }
      }
    }

    // 通过六边形邻居进行 BFS
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      const neighbors = this._getHexNeighbors(r, c);
      for (const [nr, nc] of neighbors) {
        const key = nr + "," + nc;
        if (!visited.has(key) && nr >= 0 && nr < this.grid.length && this.grid[nr] && this.grid[nr][nc] != null) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }

    // 任何未访问的已填充格子即为悬浮
    const floating = [];
    for (let r = 0; r < this.grid.length; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c] != null && !visited.has(r + "," + c)) {
          floating.push({ row: r, col: c, color: row[c] });
        }
      }
    }
    return floating;
  }

  _allCleared() {
    for (const row of this.grid) {
      if (!row) continue;
      for (const cell of row) {
        if (cell != null) return false;
      }
    }
    return true;
  }

  /**
   * 判断是否满足过关条件。
   *   passMode "OR"：分数达标 或 全部清空
   *   passMode "AND"：分数达标 且 全部清空
   */
  _checkWin() {
    const cfg = this._levelConfig || {};
    const cleared = this._allCleared();
    const scoreOk = this.score >= (cfg.passScore ?? 0);
    if (cfg.passMode === "OR") {
      return cleared || scoreOk;
    }
    return cleared && scoreOk;
  }

  // ---- 工具 ----

  /** @private */
  _nextColor() {
    const color = this.colorIdx % this._colorCount;
    this.colorIdx++;
    return color;
  }

  /** @private */
  _getContentH() {
    return this.getContentRectFn().h;
  }

  // ---- 渲染 ----

  /** @private */
  _render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 应用镜像变换以匹配视频的 CSS 镜像
    ctx.translate(w, 0);
    ctx.scale(-1, 1);

    this._drawGrid(ctx);
    this._drawSlingshot(ctx);

    // 碰撞形变（Q 弹）
    this._drawSquishes(ctx);

    if (this.state === "flying" && this.flyPos) {
      this._drawBubble(ctx, this.flyPos.x, this.flyPos.y, this.currentColor, this.bubbleR, 1);
    }

    if (this.state === "dropping" && this._droppingCells.length > 0) {
      this._drawDropAnimation(ctx);
    }

    // 抓取时绘制轨迹线
    if (this.state === "grabbed" && this.pullPos) {
      this._drawTrajectory(ctx);
    }

    // 绘制当前泡泡（在弹弓处或拉动位置）
    if (this.state !== "flying" && this.state !== "win" && this.state !== "lose" && this.state !== "popping" && this.state !== "dropping" && this.bubblePos) {
      const bx = this.pullPos ? this.pullPos.x : this.bubblePos.x;
      const by = this.pullPos ? this.pullPos.y : this.bubblePos.y;
      this._drawBubble(ctx, bx, by, this.currentColor, this.bubbleR, 1);
    }

    // 绘制爆裂粒子（水滴飞溅）
    this._drawParticles(ctx);

    ctx.restore();
  }

  /** @private */
  _drawGrid(ctx) {
    for (let r = 0; r < this.grid.length; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c] == null) continue;

        // 若正在下落则跳过（改由 _drawDropAnimation 绘制）
        if (this.state === "dropping" && this._droppingCells.some((d) => d.row === r && d.col === c)) {
          continue;
        }

        // 若该格子正在做碰撞形变，跳过原样绘制（改由 _drawSquishes 绘制）
        if (this._hasSquishAt(r, c)) {
          continue;
        }

        const center = this._getCellCenter(r, c);

        // 若该格子正在爆裂则跳过
        let alpha = 1;
        if (this.state === "popping") {
          const cell = this.matchedCells.find((m) => m.row === r && m.col === c);
          if (cell) {
            const elapsed = performance.now() - this.popStartTime - (cell.delay ?? 0);
            const t = Math.min(1, Math.max(0, elapsed) / POP_DURATION_MS);
            alpha = 1 - t;
            const scale = 1 - t * 0.5;
            this._drawBubble(ctx, center.x, center.y, row[c], this.bubbleR * scale, alpha);
            continue;
          }
        }

        this._drawBubble(ctx, center.x, center.y, row[c], this.bubbleR, alpha);
      }
    }
  }

  /** @private */
  _drawBubble(ctx, x, y, colorIdx, r, alpha) {
    if (alpha <= 0) return;

    const img = this.ballImgs?.[colorIdx];

    ctx.save();
    ctx.globalAlpha = alpha;

    if (img && img.complete && img.naturalWidth > 0) {
      // 球体图片素材（正方形，以 x,y 为中心）。
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
      // 兜底：素材加载期间用纯色圆。
      const color = COLORS[colorIdx] || COLORS[0];

      // 主体填充
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // 高光（左上弧形，用于 3D 效果）
      ctx.beginPath();
      ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill();

      // 描边
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** @private */
  _drawSlingshot(ctx) {
    const sx = this.slingX;
    const sy = this.slingY;

    if (this.slingImgLoaded && this.slingImg.complete) {
      // 绘制弹弓图片，以 (sx, sy) 为中心
      // 图片宽度随泡泡尺寸缩放；高度按宽高比
      const imgW = this.bubbleR * 8;
      const aspect = this.slingImg.naturalHeight / this.slingImg.naturalWidth;
      const imgH = imgW * aspect;

      // 位置：图片顶部中心对准弹弓静止位置，向上抬高 40 CSS 像素
      const imgX = sx - imgW / 2;
      const imgY = sy - Math.round(40 * this.dpr);

      ctx.drawImage(this.slingImg, imgX, imgY, imgW, imgH);

      // 橡皮筋固定点：叉口尖端（靠近顶部，较窄）
      const bandAnchorY = imgY + imgH * 0.18;
      const bandInset = imgW * 0.15;
      const leftAnchorX = imgX + bandInset;
      const rightAnchorX = imgX + imgW - bandInset;

      // 橡皮筋（仅抓取时）
      if (this.state === "grabbed" && this.pullPos) {
        ctx.strokeStyle = "rgba(190, 150, 105, 0.75)";
        ctx.lineWidth = Math.round(6 * this.dpr);
        ctx.lineCap = "round";

        // 左橡皮筋
        ctx.beginPath();
        ctx.moveTo(leftAnchorX, bandAnchorY);
        ctx.lineTo(this.pullPos.x, this.pullPos.y);
        ctx.stroke();

        // 右橡皮筋
        ctx.beginPath();
        ctx.moveTo(rightAnchorX, bandAnchorY);
        ctx.lineTo(this.pullPos.x, this.pullPos.y);
        ctx.stroke();
      }
    } else {
      // 兜底：图片加载期间绘制简易弹弓
      const forkW = this.bubbleR * 1.8;
      const forkH = this.bubbleR * 2.5;
      const stemLen = this.bubbleR * 3;

      ctx.strokeStyle = "rgba(180,140,100,0.75)";
      ctx.lineWidth = Math.max(2, this.bubbleR * 0.15);
      ctx.lineCap = "round";

      // 左叉臂
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - forkW, sy + forkH);
      ctx.stroke();

      // 右叉臂
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + forkW, sy + forkH);
      ctx.stroke();

      // 握柄
      ctx.beginPath();
      ctx.moveTo(sx, sy + forkH * 0.6);
      ctx.lineTo(sx, sy + forkH + stemLen);
      ctx.stroke();

      // 橡皮筋（仅抓取时）
      if (this.state === "grabbed" && this.pullPos) {
        ctx.strokeStyle = "rgba(190, 150, 105, 0.75)";
        ctx.lineWidth = Math.round(6 * this.dpr);
        ctx.lineCap = "round";

        // 左橡皮筋：从左叉尖到泡泡
        ctx.beginPath();
        ctx.moveTo(sx - forkW, sy + forkH);
        ctx.lineTo(this.pullPos.x, this.pullPos.y);
        ctx.stroke();

        // 右橡皮筋：从右叉尖到泡泡
        ctx.beginPath();
        ctx.moveTo(sx + forkW, sy + forkH);
        ctx.lineTo(this.pullPos.x, this.pullPos.y);
        ctx.stroke();
      }
    }
  }

  /**
   * 追踪方向线轨迹（含左右墙镜面反射），返回路径/方向/预计落点。
   * @returns {null|{direction:{x:number,y:number}, start:{x:number,y:number}, end:{x:number,y:number}, points:Array<{x:number,y:number}>}}
   */
  _traceTrajectory() {
    if (!this.pullPos) return null;

    const sx = this.slingX;
    const sy = this.slingY;
    const px = this.pullPos.x;
    const py = this.pullPos.y;

    // 方向：从拉动位置指向弹弓，并继续向上
    const dx = sx - px;
    const dy = sy - py;
    const len = Math.hypot(dx, dy) || 1;
    let dirX = dx / len;
    let dirY = dy / len;

    if (dirY >= 0) return null; // 不朝上

    const R = this.bubbleR;
    const points = [{ x: px, y: py }];
    let curX = px;
    let curY = py;
    let bounceCount = 0; // 只允许折返一次
    const stepSize = R * 0.2;
    const maxSteps = 3000;
    // 方向线可见长度（本关配置的比例 × 内容高度）
    const maxAimDist = this._getContentH() * (this._aimLineLength ?? 1);
    let traveled = 0;

    for (let i = 0; i < maxSteps; i++) {
      curX += dirX * stepSize;
      curY += dirY * stepSize;
      traveled += stepSize;

      // 长度限制：超过可见长度就截断
      if (traveled >= maxAimDist) {
        points.push({ x: curX, y: curY });
        break;
      }

      // 顶边：截断（泡泡会吸附在顶部）
      if (curY - R <= this.playTop) {
        points.push({ x: curX, y: this.playTop + R });
        break;
      }

      // 左右墙：按对应角度镜面折返（只折返一次）
      if (bounceCount < 1) {
        let bounced = false;
        if (curX - R <= this.playLeft) {
          curX = this.playLeft + R;
          dirX = Math.abs(dirX);
          bounced = true;
        } else if (curX + R >= this.playRight) {
          curX = this.playRight - R;
          dirX = -Math.abs(dirX);
          bounced = true;
        }
        if (bounced) {
          bounceCount++;
          points.push({ x: curX, y: curY });
        }
      }

      // 撞到第一个球：截断，长度不超过该球。
      // 忽略底边碰撞（轨迹是向上的，泡泡被拉到屏幕下方时不应在起点就被截断）。
      const hit = this._checkCollision({ x: curX, y: curY });
      if (hit && hit.type === "cell") {
        points.push({ x: curX, y: curY });
        break;
      }
    }

    return {
      direction: { x: dx / len, y: dy / len },
      start: { x: px, y: py },
      end: points[points.length - 1],
      points,
    };
  }

  /** @private */
  _drawTrajectory(ctx) {
    const traj = this._traceTrajectory();
    if (!traj) return;

    const color = COLORS[this.currentColor] || COLORS[0];

    // 用圆点虚线绘制整条轨迹（无渐变）
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, this.bubbleR * 0.28);
    ctx.lineCap = "round";
    ctx.setLineDash([0, this.bubbleR * 0.9]);

    ctx.beginPath();
    ctx.moveTo(traj.points[0].x, traj.points[0].y);
    for (let i = 1; i < traj.points.length; i++) {
      ctx.lineTo(traj.points[i].x, traj.points[i].y);
    }
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  /** @private */
  _drawDropAnimation(ctx) {
    if (this._droppingCells.length === 0) return;
    const elapsed = performance.now() - this._dropStartTime;
    const t = Math.min(1, elapsed / POP_DURATION_MS);
    const fallDist = t * this.rowH * 3; // 下落约 3 行
    const alpha = 1 - t;

    for (const { row, col, color } of this._droppingCells) {
      const center = this._getCellCenter(row, col);
      this._drawBubble(ctx, center.x, center.y + fallDist, color, this.bubbleR, alpha);
    }
  }

  /** 加载并预解码泡泡音效到 Web Audio 缓冲区（异步，在初始化阶段调用）。 */
  async loadPopSound() {
    if (this._audioLoaded) return;
    try {
      const Ctx = window.AudioContext || window["webkitAudioContext"];
      if (!Ctx) return;
      if (!this._audioCtx) {
        this._audioCtx = new Ctx();
      }
      const resp = await fetch(mediaUrl("/storage/pinch-pop-bubbles/bubble-brack.wav"));
      const arrayBuf = await resp.arrayBuffer();
      this._popBuffer = await this._audioCtx.decodeAudioData(arrayBuf);
      this._audioLoaded = true;
    } catch (e) {
      console.warn("Failed to load bubble sfx, falling back to HTMLAudioElement", e);
    }
  }

  /** 在用户手势中调用一次，解锁音频（Safari 等浏览器要求用户交互后才能播放）。 */
  unlockAudio() {
    // 恢复 Web Audio 上下文
    if (this._audioCtx && this._audioCtx.state === "suspended") {
      this._audioCtx.resume().catch(() => {});
    }
    // 兜底：用极低音量（而非 muted）播放一下再暂停解锁 HTMLAudioElement
    for (const audio of this.popSounds) {
      audio.volume = 0.01;
      try {
        const p = audio.play();
        if (p) {
          p.then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 1;
          }).catch(() => {});
        }
      } catch {
        // ignore
      }
    }
  }

  _playPopSound() {
    // 优先用 Web Audio（低延迟），失败则回退 HTMLAudioElement 池
    if (this._audioCtx && this._popBuffer && this._audioCtx.state === "running") {
      const source = this._audioCtx.createBufferSource();
      source.buffer = this._popBuffer;
      source.connect(this._audioCtx.destination);
      source.start(0);
      return;
    }
    const audio = this.popSounds[this._popSoundIdx];
    this._popSoundIdx = (this._popSoundIdx + 1) % this.popSounds.length;
    try {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {
      // ignore
    }
  }

  /** @private 在某个泡泡爆裂处生成水滴飞溅粒子。 */
  _spawnPopParticles(center, color) {
    this._playPopSound();
    const count = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = this.bubbleR * (2 + Math.random() * 3);
      this._particles.push({
        x: center.x,
        y: center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: this.bubbleR * (0.08 + Math.random() * 0.16),
        color,
        born: performance.now(),
        life: 350 + Math.random() * 150,
      });
    }
  }

  /** @private 每帧更新粒子：清理生命已结束的粒子。 */
  _updateParticles() {
    const now = performance.now();
    for (let i = this._particles.length - 1; i >= 0; i--) {
      if (now - this._particles[i].born >= this._particles[i].life) {
        this._particles.splice(i, 1);
      }
    }
  }

  /** @private 在碰撞接触位置，给发射球和被撞球都加上 Q 弹形变。 */
  _addCollisionSquish(hit, landing) {
    const fixedCenter = this._getCellCenter(hit.row, hit.col);

    // 冲击方向：从被撞球指向发射球的落点
    let dirX = 0;
    let dirY = -1;
    if (landing && landing.row >= 0 && landing.col >= 0) {
      const landingCenter = this._getCellCenter(landing.row, landing.col);
      const dx = landingCenter.x - fixedCenter.x;
      const dy = landingCenter.y - fixedCenter.y;
      const d = Math.hypot(dx, dy) || 1;
      dirX = dx / d;
      dirY = dy / d;

      // 发射球：在落点格子处形变（替换该格子绘制，避免出现影子）
      this._squishes.push({
        x: landingCenter.x,
        y: landingCenter.y,
        colorIdx: this.currentColor,
        dirX,
        dirY,
        row: landing.row,
        col: landing.col,
        born: performance.now(),
      });
    }

    // 被撞的固定球：形变替换原格子绘制
    this._squishes.push({
      x: fixedCenter.x,
      y: fixedCenter.y,
      colorIdx: this.grid[hit.row][hit.col],
      dirX,
      dirY,
      row: hit.row,
      col: hit.col,
      born: performance.now(),
    });
  }

  /** @private 每帧更新碰撞形变：清理已结束的形变。 */
  _updateSquishes() {
    const now = performance.now();
    for (let i = this._squishes.length - 1; i >= 0; i--) {
      if (now - this._squishes[i].born >= SQUISH_DURATION_MS) {
        this._squishes.splice(i, 1);
      }
    }
  }

  /** @private 判断某个格子是否正在做碰撞形变（用于 _drawGrid 跳过原样绘制）。 */
  _hasSquishAt(row, col) {
    for (const s of this._squishes) {
      if (s.row === row && s.col === col) return true;
    }
    return false;
  }

  /** @private 绘制碰撞形变（Q 弹：沿冲击方向压缩、垂直方向膨胀并回弹）。 */
  _drawSquishes(ctx) {
    if (this._squishes.length === 0) return;

    const now = performance.now();
    const r = this.bubbleR;
    const omega = (Math.PI * 2) / 0.15; // 振荡周期约 150ms
    const damping = 9; // 阻尼系数

    for (const s of this._squishes) {
      const t = (now - s.born) / 1000;
      // 阻尼振荡：先压缩、再回弹并轻微过冲、最后稳定
      const squash = SQUISH_AMPLITUDE * Math.cos(omega * t) * Math.exp(-damping * t);
      const sp = 1 - squash; // 沿冲击方向缩放
      const se = 1 + squash * 0.9; // 垂直方向缩放（近似保面积）

      // 画布已做了水平镜像（scale(-1,1)），rotate 在镜像坐标系里会被水平翻转；
      // 这里用「旋转→缩放→回旋」的方式，只改变形状、不旋转贴图方向。
      const angle = Math.atan2(s.dirY, s.dirX);
      const img = this.ballImgs?.[s.colorIdx];

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(angle);
      ctx.scale(sp, se);
      ctx.rotate(-angle);

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -r, -r, r * 2, r * 2);
      } else {
        // 兜底：纯色圆
        ctx.fillStyle = COLORS[s.colorIdx] || COLORS[0];
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /** @private 绘制爆裂粒子（水滴飞溅，带重力下坠与淡出）。 */
  _drawParticles(ctx) {
    if (this._particles.length === 0) return;

    const now = performance.now();
    ctx.save();
    for (const p of this._particles) {
      const t = (now - p.born) / 1000;
      const alpha = 1 - (now - p.born) / p.life;
      if (alpha <= 0) continue;

      // 位置：初速度 + 重力（0.5 * g * t²）
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + 0.5 * GRAVITY_PX_PER_S2 * t * t;

      const sprite = this._particleSprites[p.color];
      if (!sprite) continue;

      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - p.r, y - p.r, p.r * 2, p.r * 2);
    }
    ctx.restore();
  }

  // ---- 公共 getter ----

  getScore() {
    return this.score;
  }

  getState() {
    return this.state;
  }

  isWin() {
    return this.state === "win";
  }

  isLose() {
    return this.state === "lose";
  }

  /** 当前场上剩余的泡泡数量（未爆裂的格子数）。 */
  getRemainingBubbles() {
    let count = 0;
    for (const row of this.grid) {
      if (!row) continue;
      for (const cell of row) {
        if (cell != null) count++;
      }
    }
    return count;
  }
}
