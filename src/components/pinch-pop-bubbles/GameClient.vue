<template>
  <section
    ref="stageEl"
    class="stage"
    :class="{ 'stage--fullscreen': isFullscreen, 'stage--no-video': !showVideo }"
    :style="{ '--game-bg': `url(${gameBg})` }"
  >
    <video
      ref="videoEl"
      id="video"
      autoplay
      muted
      playsinline
      :class="{ 'video-hidden': !showVideo }"
    ></video>
    <canvas ref="handCanvasRef" class="hand-canvas"></canvas>
    <canvas ref="gameCanvasEl" class="game-canvas"></canvas>

    <!-- Score HUD (bottom-right) -->
    <div v-show="screen === 'playing'" class="scoreHud">
      <div class="scoreHud-row">
        <span class="scoreHud-score">Score: {{ gameScore }}</span>
        <span class="scoreHud-pct">{{ progressPercent }}%</span>
      </div>
      <div class="scoreHud-bar">
        <div class="scoreHud-bar-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <div v-if="currentLevel.passMode === 'AND'" class="scoreHud-remaining">
        Bubbles Left: {{ remainingBubbles }}
      </div>
    </div>

    <!-- Pass hint（进入关卡时从顶部滑入，5 秒后滑出） -->
    <div class="pass-hint" :class="{ 'pass-hint--visible': passHintVisible }">
      <div class="pass-hint-card">
        <div class="pass-hint-title">How to Pass</div>
        <ul class="pass-hint-list">
          <li>
            Score {{ currentLevel.passScore }} points
            <span class="pass-hint-note">(popped bubble = 100 pts · dropped bubble = 200 pts)</span>
          </li>
          <li>Clear all bubbles</li>
          <li>{{ currentLevel.passMode === "OR" ? "Complete either condition above" : "Complete both conditions above" }}</li>
        </ul>
      </div>
    </div>

    <!-- 抓取方式提示（切换时从顶部滑入，2 秒后滑出） -->
    <div class="grab-hint" :class="{ 'grab-hint--visible': grabHintVisible }">
      <div class="grab-hint-card">{{ grabHintText }}</div>
    </div>

    <!-- Fullscreen Toggle（始终可见，所有界面都能退出全屏） -->
    <button
      class="fullscreen-btn icon-btn"
      type="button"
      :title="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'"
      @click="toggleFullscreen"
    >
      <img :src="isFullscreen ? fullScreenOffIcon : fullScreenOnIcon" alt="" />
    </button>

    <!-- Show Video Toggle（仅游戏进行中显示） -->
    <button
      v-show="screen === 'playing'"
      class="video-btn icon-btn"
      type="button"
      :title="showVideo ? 'Hide Video' : 'Show Video'"
      @click="toggleVideo"
    >
      <img :src="showVideo ? videoOffIcon : videoOnIcon" alt="" />
    </button>

    <!-- 抓取方式切换（左下角）：捏合 ↔ 握拳 -->
    <button
      v-show="screen === 'playing'"
      class="grab-mode-btn icon-btn"
      type="button"
      :title="settings.grabMode === 'fist' ? 'Grab: Fist — click to switch' : 'Grab: Pinch (thumb + index) — click to switch'"
      @click="toggleGrabMode"
    >
      <img :src="settings.grabMode === 'fist' ? fistPoseIcon : fingerPinchIcon" alt="" />
    </button>

    <!-- Loading Overlay -->
    <div v-if="loadingVisible" class="loading">
      <div class="loadingInner">
        <div class="spinner" aria-hidden="true"></div>
        <div class="loadingTitle">Loading…</div>
        <div class="loadingText">{{ loadingMsg }}</div>
        <div v-if="showRetry" class="loadingActions">
          <button class="btn btnSmall" type="button" @click="handleRetry">Retry</button>
        </div>
      </div>
    </div>

    <!-- 关卡覆盖层：home / intro / win / summary，覆盖在舞台上方，保证全屏目标舞台始终挂载 -->
    <div v-if="screen !== 'playing'" class="stage-overlay">
      <PinchPopBubblesLevelHome v-if="screen === 'home'" />
      <PinchPopBubblesLevelIntro v-else-if="screen === 'intro'" />
      <PinchPopBubblesLevelComplete v-else-if="screen === 'win'" />
      <PinchPopBubblesLevelMap v-else />
    </div>

    <!-- App 注入的舞台内元素（Debug 按钮）随 .stage 一起进入全屏；不由本组件使用时插槽为空 -->
    <slot name="debugOverlay" />
  </section>
</template>

<script setup lang="ts">
import { CameraManager } from "~/utils/camera";
import { HandTracker } from "~/utils/handTracker";
import {
  classifyGesture,
  fingerStatesToChinese,
  extendedListChinese,
} from "~/utils/gestureMatcher";
import { BubbleGame } from "~/utils/pinch-pop-bubbles/bubbleGame";
import { HandRig } from "~/utils/pinch-pop-bubbles/handRig";
import {
  fmtTimeMs,
  fmt,
  shortId,
  gestureLabel,
} from "~/utils/format";
import { useGamePanelState } from "~/composables/pinch-pop-bubbles/useGamePanelState";
import { useLevelManager } from "~/composables/pinch-pop-bubbles/useLevelManager";
import { useGameSettings, VIDEO_QUALITIES, type GrabMode } from "~/composables/pinch-pop-bubbles/useGameSettings";

const gamePanelState = useGamePanelState();
const { currentLevel, completeCurrent, failCurrent, state: levelState } = useLevelManager();
const { settings, setGrabMode } = useGameSettings();
// 当前关卡满分（进度条的 100% 基准）
const maxScore = computed(() => currentLevel.value?.passScore ?? 0);
// 当前界面（home / intro / playing / win / summary），由关卡管理层单例驱动
const screen = computed(() => levelState.screen);

// Refs（舞台 / 视频 / 两个画布；舞台是全屏目标，始终挂载）
const stageEl = ref<HTMLElement | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const handCanvasRef = ref<HTMLCanvasElement | null>(null);
const gameCanvasEl = ref<HTMLCanvasElement | null>(null);

const isFullscreen = ref(false);
const showVideo = ref(settings.showCamera); // 摄像头画面显隐，初始值取自设置（默认隐藏，仅显示骨骼）

// 图标素材走 CDN 子域（public/storage/pinch-pop-bubbles → storage.swayjoy.com/pinch-pop-bubbles），见 app/utils/media.js
const ICON_BASE = mediaUrl("/storage/pinch-pop-bubbles");
const videoOnIcon = `${ICON_BASE}/video-on.png`;
const videoOffIcon = `${ICON_BASE}/video-off.png`;
const fullScreenOnIcon = `${ICON_BASE}/full-screen-on.png`;
const fullScreenOffIcon = `${ICON_BASE}/full-screen-off.png`;
const fingerPinchIcon = `${ICON_BASE}/finger-pinch.png`;
const fistPoseIcon = `${ICON_BASE}/fist-pose.png`;

// 游戏背景图（7 张 1920×1080），每次进入游戏时随机轮换一张
// game-bg-01…06 走 CDN 子域；game-bg.webp 因被 app/assets/css/main.css 的 url() 引用（编译后固定解析主站 origin），保留在主站原路径、不加前缀
const GAME_BG_IMAGES = [
  mediaUrl("/storage/pinch-pop-bubbles/game-bg-01.webp"),
  mediaUrl("/storage/pinch-pop-bubbles/game-bg-02.webp"),
  mediaUrl("/storage/pinch-pop-bubbles/game-bg-03.webp"),
  mediaUrl("/storage/pinch-pop-bubbles/game-bg-04.webp"),
  mediaUrl("/storage/pinch-pop-bubbles/game-bg-05.webp"),
  mediaUrl("/storage/pinch-pop-bubbles/game-bg-06.webp"),
  "/pinch-pop-bubbles/game-bg.webp",
];
const gameBg = ref(GAME_BG_IMAGES[Math.floor(Math.random() * GAME_BG_IMAGES.length)]);

// 轮换到一张与当前不同的背景，实现「轮流随机」效果
function rotateGameBg() {
  const others = GAME_BG_IMAGES.filter((img) => img !== gameBg.value);
  const pool = others.length ? others : GAME_BG_IMAGES;
  gameBg.value = pool[Math.floor(Math.random() * pool.length)];
}

// 顶部滑入的通关提示：进入关卡时滑入，5 秒后自动滑出
const passHintVisible = ref(false);
let passHintTimer: ReturnType<typeof setTimeout> | null = null;

function showPassHint() {
  if (passHintTimer) clearTimeout(passHintTimer);
  passHintVisible.value = true;
  passHintTimer = setTimeout(() => {
    passHintVisible.value = false;
    passHintTimer = null;
  }, 5000);
}

function hidePassHint() {
  if (passHintTimer) {
    clearTimeout(passHintTimer);
    passHintTimer = null;
  }
  passHintVisible.value = false;
}

// 顶部滑入的抓取方式提示：切换握拳/捏合时滑入，2 秒后滑出。
const grabHintVisible = ref(false);
const grabHintText = ref("");
let grabHintTimer: ReturnType<typeof setTimeout> | null = null;

function showGrabHint(mode: GrabMode) {
  if (grabHintTimer) clearTimeout(grabHintTimer);
  grabHintText.value = mode === "fist" ? "Grab mode: Fist" : "Grab mode: Pinch (thumb + index)";
  grabHintVisible.value = true;
  grabHintTimer = setTimeout(() => {
    grabHintVisible.value = false;
    grabHintTimer = null;
  }, 2000);
}

// 游戏内左下角按钮：点击即切换抓取方式（捏合 ↔ 握拳），并同步到引擎与设置。
function toggleGrabMode() {
  const next: GrabMode = settings.grabMode === "fist" ? "pinch" : "fist";
  setGrabMode(next);
  game?.setGrabMode(next);
  showGrabHint(next);
}

// Camera
const cameraStatus = ref<"idle" | "requesting" | "running" | "blocked" | "stopped">("idle");
const activeDeviceId = ref<string | null>(null);
const cameraDevices = ref<{ deviceId: string; label: string }[]>([]);
let camera: CameraManager | null = null;

// Hand Tracker
let tracker: HandTracker | null = null;
let preferredDelegate = "GPU"; // 用户偏好的 delegate："GPU" 或 "CPU"

// Game
let game: BubbleGame | null = null;
// 动漫手骨骼绑定（客户端创建，加载 15 张切图零件）
let handRig: HandRig | null = null;
const gameScore = ref(0);
const gameState = ref("ready");
const isWin = ref(false);
const isLose = ref(false);
const remainingBubbles = ref(0);

// 分数进度百分比：当前分数 / 满分（passScore），封顶 100%
const progressPercent = computed(() => {
  const max = maxScore.value;
  if (!max || max <= 0) return 0;
  return Math.min(100, Math.round((gameScore.value / max) * 100));
});

// 监听过关 / 失败，交给关卡管理层处理
watch(isWin, (win) => {
  if (win) completeCurrent(gameScore.value);
});
watch(isLose, (lose) => {
  if (lose) failCurrent();
});

// 界面切换驱动游戏启停：进入 playing 启动，离开 playing 停止。
// immediate 兜底「单例 state.screen 仍停留在 playing 时路由返回」的场景。
watch(
  screen,
  (s, prev) => {
    if (s === "playing") {
      rotateGameBg();
      showPassHint();
      showVideo.value = settings.showCamera; // 应用设置中的摄像头显示偏好
      start().catch(() => {});
    } else if (prev === "playing") {
      hidePassHint();
      stop().catch(() => {});
    }
  },
  { immediate: true },
);

// Latest hand data (written by AI inference, read by the 60fps render loop)
let latestHand: {
  thumb: { x: number; y: number } | null;
  index: { x: number; y: number } | null;
  pinchRatio: number | null;
  fistRatio: number | null;
  fistCenter: { x: number; y: number } | null;
} = { thumb: null, index: null, pinchRatio: null, fistRatio: null, fistCenter: null };

// FPS
const fps = ref(0);
let lastResultsPerfMs: number | null = null;
let fpsEma = 0;
let lastAiResultMs = 0; // 上一次收到 AI 结果的时间（供看门狗检测卡死）

// Loading UI
const loadingVisible = ref(false);
const loadingMsg = ref("Requesting camera permission…");
const showRetry = ref(false);

// Gesture recognition
const currentLabel = ref("—");
const gestureDetail = ref("—");
const fingerStates = ref<Record<string, { state: string }> | null>(null);
const pinchStatus = ref("—");
const gestureHist: string[] = [];
const GESTURE_HIST_N = 3;
let pinchActive = false;
const PINCH_ENTER_RATIO = 0.8;
const PINCH_EXIT_RATIO = 0.92;

// Log
const logLines = ref<string[]>([]);
const LOG_MAX_LINES = 260;
let lastLogUiMs = 0;

// Processing loop
let isRunning = false;
let loopStopper: (() => void) | null = null;
let prevIndexTipPx: { x: number; y: number } | null = null;
let prevTsMs: number | null = null;

// Landmark temporal smoothing (EMA) to reduce jitter
let smoothedLandmarks: any[] | null = null;
const SMOOTH_ALPHA = 0.35;

// Scale-invariant pinch ratio smoothing (EMA) to reduce jitter near the
// grab/launch thresholds.
let smoothedPinchRatio: number | null = null;
const PINCH_RATIO_SMOOTH = 0.4;

// 握拳抓取模式的开合度平滑（EMA）：fistRatio 0=握拳 1=伸展，方向与捏合一致。
let smoothedFistRatio: number | null = null;
const FIST_RATIO_SMOOTH = 0.4;

// Layout cache
let layoutCache: {
  dpr: number;
  contentRectPx: { x: number; y: number; w: number; h: number; dpr: number };
} | null = null;
let lastLayoutMs = 0;
let _resizeRaf = 0; // rAF 句柄，用于合并同一帧内的多次 resize
let _resizeObserver: ResizeObserver | null = null;

// Computed
const fpsDisplay = computed(() => fmt(fps.value, 1));

// Sync panel-visible state into the shared store so the control panel,
// rendered by the page as a sibling of the game area, stays reactive.
watchEffect(() => {
  gamePanelState.currentLabel = currentLabel.value;
  gamePanelState.gestureDetail = gestureDetail.value;
  gamePanelState.fingerStates = fingerStates.value;
  gamePanelState.pinchStatus = pinchStatus.value;
  gamePanelState.cameraDevices = cameraDevices.value;
  gamePanelState.activeDeviceId = activeDeviceId.value;
  gamePanelState.score = gameScore.value;
  gamePanelState.gameState = gameState.value;
  gamePanelState.fps = fpsDisplay.value;
  gamePanelState.logLines = logLines.value;
});

// ---- Helpers ----

function appendLog(line: string) {
  if (gamePanelState.logPaused) return;
  logLines.value.push(line);
  if (logLines.value.length > LOG_MAX_LINES) {
    logLines.value.splice(0, logLines.value.length - LOG_MAX_LINES);
  }
  const t = performance.now();
  if (t - lastLogUiMs < 60) return;
  lastLogUiMs = t;
  logLines.value = [...logLines.value];
}

function pushGesture(code: string) {
  gestureHist.push(code);
  if (gestureHist.length > GESTURE_HIST_N) gestureHist.shift();
}

function stableGesture(): string {
  if (gestureHist.length === 0) return "NONE";
  const counts = new Map<string, number>();
  for (const g of gestureHist) counts.set(g, (counts.get(g) || 0) + 1);
  let best = gestureHist[gestureHist.length - 1];
  let bestCount = -1;
  for (const [k, v] of counts.entries()) {
    if (v > bestCount) { best = k; bestCount = v; }
  }
  return best;
}

function computeMotion(pointPx: { x: number; y: number }, tsMs: number) {
  if (!prevIndexTipPx || prevTsMs == null) {
    prevIndexTipPx = pointPx;
    prevTsMs = tsMs;
    return { speedPxPerS: 0 };
  }
  const dt = Math.max(1, tsMs - prevTsMs);
  const dx = pointPx.x - prevIndexTipPx.x;
  const dy = pointPx.y - prevIndexTipPx.y;
  const speedPxPerS = (Math.hypot(dx, dy) / dt) * 1000;
  prevIndexTipPx = pointPx;
  prevTsMs = tsMs;
  return { speedPxPerS };
}

// ---- Layout ----

function updateLayout(force = false) {
  const video = videoEl.value;
  const handCanvas = handCanvasRef.value;
  const gameCanvas = gameCanvasEl.value;
  if (!video || !handCanvas || !gameCanvas) return;

  const t = performance.now();
  if (!force && t - lastLayoutMs < 200 && layoutCache) return;
  lastLayoutMs = t;

  const rect = video.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));

  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const pxW = Math.max(1, Math.round(cssW * dpr));
  const pxH = Math.max(1, Math.round(cssH * dpr));

  if (handCanvas.width !== pxW) handCanvas.width = pxW;
  if (handCanvas.height !== pxH) handCanvas.height = pxH;
  handCanvas.style.width = `${cssW}px`;
  handCanvas.style.height = `${cssH}px`;

  if (gameCanvas.width !== pxW) gameCanvas.width = pxW;
  if (gameCanvas.height !== pxH) gameCanvas.height = pxH;
  gameCanvas.style.width = `${cssW}px`;
  gameCanvas.style.height = `${cssH}px`;

  const inFS = !!document.fullscreenElement;
  // 竖屏（舞台高 > 宽）：游戏内容填满整个舞台，避免视频被留黑边
  const portrait = cssH > cssW;
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;

  if (inFS || portrait) {
    // Fullscreen / 竖屏：cover mode — 内容填满整个画布
    layoutCache = {
      dpr,
      contentRectPx: { x: 0, y: 0, w: pxW, h: pxH, dpr },
    };
  } else {
    // Normal: contain mode — letterbox-aware
    const scale = Math.min(cssW / vw, cssH / vh);
    const dispW = vw * scale;
    const dispH = vh * scale;
    const offX = (cssW - dispW) / 2;
    const offY = (cssH - dispH) / 2;
    layoutCache = {
      dpr,
      contentRectPx: { x: offX * dpr, y: offY * dpr, w: dispW * dpr, h: dispH * dpr, dpr },
    };
  }
}

function getVideoContentRectPx() {
  updateLayout(false);
  return layoutCache?.contentRectPx || { x: 0, y: 0, w: 1280, h: 720, dpr: 1 };
}

// 浏览器宽度 / 舞台尺寸变化时及时重算布局（rAF 合并同一帧内的多次触发）
function handleResize() {
  if (_resizeRaf) return;
  _resizeRaf = requestAnimationFrame(() => {
    _resizeRaf = 0;
    updateLayout(true);
    game?.recalcLayout();
  });
}

function normToCanvasPx(lm: { x: number; y: number; z?: number }) {
  const r = getVideoContentRectPx();
  const x = r.x + Math.max(0, Math.min(1, lm.x)) * r.w;
  const y = r.y + Math.max(0, Math.min(1, lm.y)) * r.h;
  return { x, y, _rect: r };
}

// ---- Hand Overlay Drawing ----

function drawHandOverlay(
  landmarks: any[],
  pinchPx: number | null,
  pinchThresholdPx: number,
) {
  const handCanvas = handCanvasRef.value;
  if (!handCanvas) return;

  const ctx = handCanvas.getContext("2d", { desynchronized: true });
  if (!ctx) return;

  const r = getVideoContentRectPx();
  ctx.clearRect(0, 0, handCanvas.width, handCanvas.height);

  // 关键点 → 镜像后的画布像素坐标（视频是 CSS 镜像的）
  const w = handCanvas.width;
  const pts = landmarks.map((lm: any) => {
    const p = normToCanvasPx(lm);
    return { x: w - p.x, y: p.y };
  });

  // 绘制动漫手（骨骼绑定）
  handRig?.draw(ctx, pts);

  // 捏合反馈线（拇指-食指）—— 握拳模式下不展示
  const thumb = pts[4];
  const index = pts[8];
  if (settings.grabMode !== "fist" && thumb && index) {
    const pinching = typeof pinchPx === "number" ? pinchPx < pinchThresholdPx : false;

    ctx.strokeStyle = pinching ? "#4dd4ac" : "rgba(200, 210, 225, 0.55)";
    ctx.lineWidth = 3 * r.dpr;
    ctx.beginPath();
    ctx.moveTo(thumb.x, thumb.y);
    ctx.lineTo(index.x, index.y);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.beginPath();
    ctx.arc(index.x, index.y, 5 * r.dpr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clearOverlay() {
  const handCanvas = handCanvasRef.value;
  if (!handCanvas) return;
  const ctx = handCanvas.getContext("2d", { desynchronized: true });
  if (!ctx) return;
  ctx.clearRect(0, 0, handCanvas.width, handCanvas.height);
}

// ---- MediaPipe Results Handler ----

function onHandResults(results: any) {
  updateLayout(false);
  loadingVisible.value = false;

  const perfNow = performance.now();
  lastAiResultMs = perfNow;
  if (lastResultsPerfMs != null) {
    const dt = Math.max(1, perfNow - lastResultsPerfMs);
    const inst = 1000 / dt;
    fpsEma = fpsEma ? fpsEma * 0.85 + inst * 0.15 : inst;
  }
  lastResultsPerfMs = perfNow;
  fps.value = fpsEma;

  const tsWall = Date.now();
  const tsPerf = performance.now();
  const lmList = results.multiHandLandmarks || [];

  // --- Cache latest hand data for the 60fps render loop ---
  const hasHand = lmList.length > 0;
  const thumb = hasHand && lmList[0][4] ? normToCanvasPx(lmList[0][4]) : null;
  const index = hasHand && lmList[0][8] ? normToCanvasPx(lmList[0][8]) : null;

  // Scale-invariant pinch ratio (thumb-index distance / finger length),
  // EMA-smoothed so the grab/launch thresholds don't jitter.
  let gamePinchRatio: number | null = null;
  if (thumb && index) {
    const t4 = lmList[0][4];
    const i8 = lmList[0][8];
    const i5 = lmList[0][5];
    const t2 = lmList[0][2];
    const pinchDist = Math.hypot(t4.x - i8.x, t4.y - i8.y);
    const baseLen = Math.max(
      1e-6,
      Math.min(
        Math.hypot(i5.x - i8.x, i5.y - i8.y),
        Math.hypot(t2.x - t4.x, t2.y - t4.y),
      ),
    );
    const raw = pinchDist / baseLen;
    smoothedPinchRatio =
      smoothedPinchRatio == null
        ? raw
        : smoothedPinchRatio + (raw - smoothedPinchRatio) * PINCH_RATIO_SMOOTH;
    gamePinchRatio = smoothedPinchRatio;
  } else {
    smoothedPinchRatio = null;
  }

  latestHand = { thumb, index, pinchRatio: gamePinchRatio, fistRatio: null, fistCenter: null };

  // No hand detected
  if (!lmList.length) {
    smoothedLandmarks = null;
    clearOverlay();
    pushGesture("NONE");
    currentLabel.value = "No hand";
    gestureDetail.value = "—";
    pinchStatus.value = "—";
    appendLog(`${fmtTimeMs(tsWall)}  gesture=No hand  fps=${fmt(fpsEma, 1)}`);
    return;
  }

  // Hand detected — process with temporal smoothing
  const rawLandmarks = lmList[0];

  // 防御：MediaPipe 偶发返回不完整/含空值的关键点，跳过本帧避免 classifyGesture 崩溃
  if (!rawLandmarks || rawLandmarks.length < 21 || rawLandmarks.some((lm: any) => !lm)) {
    return;
  }

  // EMA smooth each landmark to reduce jitter
  if (!smoothedLandmarks || smoothedLandmarks.length !== rawLandmarks.length) {
    smoothedLandmarks = rawLandmarks.map((lm: any) => ({ x: lm.x, y: lm.y, z: lm.z }));
  } else {
    for (let i = 0; i < rawLandmarks.length; i++) {
      smoothedLandmarks[i].x += (rawLandmarks[i].x - smoothedLandmarks[i].x) * SMOOTH_ALPHA;
      smoothedLandmarks[i].y += (rawLandmarks[i].y - smoothedLandmarks[i].y) * SMOOTH_ALPHA;
      smoothedLandmarks[i].z += ((rawLandmarks[i].z ?? 0) - (smoothedLandmarks[i].z ?? 0)) * SMOOTH_ALPHA;
    }
  }
  const landmarks = smoothedLandmarks;
  const g = classifyGesture(landmarks);

  // 握拳模式：拳心（食指/中指/无名指/小指 MCP 关节均值，画布像素坐标）。
  let fistCenter: { x: number; y: number } | null = null;
  if (landmarks?.[5] && landmarks?.[9] && landmarks?.[13] && landmarks?.[17]) {
    let sx = 0;
    let sy = 0;
    for (const idx of [5, 9, 13, 17]) {
      const p = normToCanvasPx(landmarks[idx]);
      sx += p.x;
      sy += p.y;
    }
    fistCenter = { x: sx / 4, y: sy / 4 };
  }

  // 握拳模式开合度（fistRatio：0=握拳，1=五指伸展）。基于「张开手指数量」判定：
  // ≤1 根张开（即 4 根及以上蜷缩）→ 握拳抓取；2–3 根张开 → 保持（不抓取也不发射）；≥4 根张开 → 发射。
  let gameFistRatio: number | null = null;
  {
    const allFingers = [
      g.states.thumb,
      g.states.index,
      g.states.middle,
      g.states.ring,
      g.states.pinky,
    ];
    const extendedCount = allFingers.filter((f) => f?.state === "EXTENDED").length;

    let raw: number;
    if (extendedCount >= 4) {
      raw = 1; // 至少 4 根张开 → 发射
    } else if (extendedCount <= 1) {
      raw = 0; // 4 根及以上蜷缩 → 握拳抓取（允许 1 根手指张开，如大拇指自然外翘）
    } else {
      raw = 0.5; // 2–3 根张开 → 过渡态，保持 grabbed
    }

    smoothedFistRatio =
      smoothedFistRatio == null
        ? raw
        : smoothedFistRatio + (raw - smoothedFistRatio) * FIST_RATIO_SMOOTH;
    gameFistRatio = smoothedFistRatio;
  }
  latestHand.fistRatio = gameFistRatio;
  latestHand.fistCenter = fistCenter;

  pushGesture(g.gesture);
  const stableBase = stableGesture();
  const cn = fingerStatesToChinese(g.states);
  const extList = extendedListChinese(g.states);
  const pinchRatio = g.pinch.pinchRatio;

  // Pinch hysteresis
  if (!pinchActive && pinchRatio < PINCH_ENTER_RATIO) pinchActive = true;
  if (pinchActive && pinchRatio > PINCH_EXIT_RATIO) pinchActive = false;
  const stable = pinchActive ? "PINCH" : stableBase;

  // Compute pinch for overlay
  const thumbTip = landmarks?.[4] ? normToCanvasPx(landmarks[4]) : null;
  const indexTip = landmarks?.[8] ? normToCanvasPx(landmarks[8]) : null;
  const rect = getVideoContentRectPx();
  const pinchPx =
    thumbTip && indexTip
      ? Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y)
      : null;
  const pinchThresholdPx = Math.min(rect.w, rect.h) * 0.06;

  // Draw overlay
  drawHandOverlay(landmarks, pinchPx, pinchThresholdPx);

  // Motion tracking
  const motion = indexTip ? computeMotion(indexTip, tsPerf) : { speedPxPerS: 0 };

  // Update UI state
  const primary = stable === "COMBO" ? g.label : gestureLabel(stable);
  currentLabel.value = primary;
  gestureDetail.value = `Now: ${g.label} | Extended: ${extList} | Thumb:${cn.thumb}  Index:${cn.index}  Middle:${cn.middle}  Ring:${cn.ring}  Pinky:${cn.pinky}`;
  fingerStates.value = g.states;
  pinchStatus.value = `${pinchActive ? "Yes" : "No"} (r=${fmt(pinchRatio, 2)})`;

  // Log
  appendLog(
    [
      fmtTimeMs(tsWall),
      `gesture=${gestureLabel(stable)}`,
      `code=${g.code}`,
      `ext=${extList}`,
      `pinch=${fmt(pinchPx ?? 0, 0)}px`,
      `ratio=${fmt(latestHand.pinchRatio ?? 0, 2)}`,
      `speed=${fmt(motion.speedPxPerS, 0)}px/s`,
    ].join("  "),
  );
}

// ---- Processing Loop ----

function startProcessingLoop() {
  if (isRunning) return;
  const video = videoEl.value;
  if (!video || !tracker) return;

  let stopped = false;

  loopStopper = () => {
    stopped = true;
  };

  lastAiResultMs = performance.now();

  // AI 推理循环：detectForVideo 是同步调用（阻塞直到推理完成），
  // rAF 自然把速率限制在推理耗时上。
  const aiLoop = () => {
    if (stopped) return;
    if (tracker) {
      try {
        tracker.processVideoFrame(video);
      } catch (err) {
        appendLog(`${fmtTimeMs(Date.now())}  error=ai_inference ${String(err)}`);
        console.error("AI inference error:", err);
      }
    }
    requestAnimationFrame(aiLoop);
  };

  // 看门狗（独立 rAF，始终存活）：超过 3s 没收到新结果则判定 AI 卡死，重建 tracker。
  const watchdogLoop = () => {
    if (stopped) return;
    if (performance.now() - lastAiResultMs > 3000) {
      lastAiResultMs = performance.now();
      appendLog(`${fmtTimeMs(Date.now())}  warn=ai_stalled_reinit_tracker`);
      initTracker().catch((e) => {
        appendLog(`${fmtTimeMs(Date.now())}  error=tracker_reinit ${String(e)}`);
        console.error("tracker reinit error:", e);
      });
    }
    requestAnimationFrame(watchdogLoop);
  };

  // Render loop — 60fps, advances the game with the latest hand data
  const renderLoop = () => {
    if (stopped) return;
    if (game) {
      if (settings.grabMode === "fist") {
        game.update(
          latestHand.thumb,
          latestHand.index,
          latestHand.fistRatio,
          performance.now(),
          latestHand.fistCenter,
        );
      } else {
        game.update(latestHand.thumb, latestHand.index, latestHand.pinchRatio, performance.now());
      }
      gameScore.value = game.getScore();
      gameState.value = game.getState();
      isWin.value = game.isWin();
      isLose.value = game.isLose();
      remainingBubbles.value = game.getRemainingBubbles();
    }
    requestAnimationFrame(renderLoop);
  };

  isRunning = true;
  aiLoop();
  watchdogLoop();
  renderLoop();
}

function stopProcessingLoop() {
  loopStopper?.();
  loopStopper = null;
  isRunning = false;
}

// ---- Camera ----

async function refreshCameraMenu() {
  if (!camera) return;
  const list = await camera.listVideoDevices();
  cameraDevices.value = list.map((d: MediaDeviceInfo, i: number) => ({
    deviceId: d.deviceId,
    label: d.label || `Camera ${i + 1}`,
  }));

  const active = camera.getActiveDeviceId();
  if (active) activeDeviceId.value = active;
  if (!activeDeviceId.value && cameraDevices.value.length) {
    activeDeviceId.value = cameraDevices.value[0].deviceId;
  }
}

async function handleSwitchCamera(deviceId: string) {
  activeDeviceId.value = deviceId;
  appendLog(`${fmtTimeMs(Date.now())}  camera_switch=${shortId(deviceId)}`);

  if (isRunning) {
    await stop();
    await start();
  }
}

function handleRetry() {
  showRetry.value = false;
  start().catch(() => {});
}

function toggleVideo() {
  showVideo.value = !showVideo.value;
}

async function toggleFullscreen() {
  if (!stageEl.value) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await stageEl.value.requestFullscreen();
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
  // 等浏览器 reflow 完成后再测量，保证 getBoundingClientRect 尺寸正确
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      updateLayout(true);
      game?.recalcLayout();
    });
  });
}

function handleGameRestart() {
  game?.reset();
  gameScore.value = 0;
  gameState.value = "ready";
  isWin.value = false;
  isLose.value = false;
  remainingBubbles.value = 0;
}

async function initTracker() {
  tracker = new HandTracker({
    maxNumHands: 1,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55,
    preferredDelegate,
  });
  tracker.onResults(onHandResults);
  const delegate = await tracker.init();
  gamePanelState.delegateMode = delegate === "GPU" ? "GPU+WebGL" : "CPU+WASM";
  return delegate;
}

function switchDelegate() {
  preferredDelegate = preferredDelegate === "GPU" ? "CPU" : "GPU";
  appendLog(`${fmtTimeMs(Date.now())}  delegate_switch=${preferredDelegate}`);
  initTracker().catch((e) => {
    appendLog(`${fmtTimeMs(Date.now())}  error=delegate_switch ${String(e)}`);
    console.error("delegate switch error:", e);
  });
}

// 按设置中的视频质量档位取摄像头采集分辨率（16:9）
function getVideoQualityRes(): { width: number; height: number } {
  const q = VIDEO_QUALITIES[settings.videoQuality];
  return q ? { width: q.width, height: q.height } : { width: 1280, height: 720 };
}

async function start() {
  const video = videoEl.value;
  if (!video) return;

  // 立即重置镜像状态（同步执行，避免 HUD 在进入新关卡时短暂显示上一关的分数）
  gameScore.value = 0;
  gameState.value = "ready";
  isWin.value = false;
  isLose.value = false;
  remainingBubbles.value = 0;

  cameraStatus.value = "requesting";
  try {
    loadingVisible.value = true;
    loadingMsg.value = "Requesting camera permission…";
    showRetry.value = false;

    if (!camera) {
      camera = new CameraManager(video, { frameRate: 60 });
    }
    const res = getVideoQualityRes();
    camera.setResolution(res.width, res.height);
    await camera.start(activeDeviceId.value);

    // Log the actual camera resolution / frame rate to diagnose the FPS ceiling.
    const track = camera.stream?.getVideoTracks?.()[0];
    const s = track?.getSettings?.();
    const caps = track?.getCapabilities?.();
    appendLog(
      `${fmtTimeMs(Date.now())}  camera=${s?.width ?? "?"}x${s?.height ?? "?"}@${fmt(s?.frameRate ?? 0, 0)}fps (max ${fmt(caps?.frameRate?.max ?? 0, 0)}fps)`,
    );

    await refreshCameraMenu();
    updateLayout(true);

    cameraStatus.value = "running";
    loadingMsg.value = "Loading hand tracking model…";

    // Init tracker if needed
    if (!tracker) {
      await initTracker();
    }

    // Init game if needed
    if (!game) {
      const gameCanvas = gameCanvasEl.value;
      if (gameCanvas) {
        game = new BubbleGame(gameCanvas, video, getVideoContentRectPx);
      }
    }

    // 载入当前关卡配置（重置网格 / 分数 / 过关条件 / 方向线长度）
    game?.loadLevel(currentLevel.value);
    // 应用当前抓取方式（捏合 / 握拳）
    game?.setGrabMode(settings.grabMode);

    // 预加载并预解码音频（异步，不阻塞游戏启动）
    game?.loadPopSound();

    // 摄像头授权也计为一次用户交互，尝试在此解锁音频
    game?.unlockAudio();

    startProcessingLoop();
  } catch (err) {
    cameraStatus.value = "blocked";
    showRetry.value = true;
    loadingMsg.value = "Camera failed to start. Please check: 1) camera permission is granted 2) access via HTTPS or localhost (HTTPS is required on mobile)";
    appendLog(`${fmtTimeMs(Date.now())}  error=camera_denied_or_failed`);
    console.error(err);
  }
}

async function stop() {
  stopProcessingLoop();
  cameraStatus.value = "stopped";
  loadingVisible.value = false;
  prevIndexTipPx = null;
  prevTsMs = null;
  gestureHist.length = 0;
  pinchActive = false;
  smoothedLandmarks = null;
  latestHand = { thumb: null, index: null, pinchRatio: null, fistRatio: null, fistCenter: null };
  smoothedPinchRatio = null;
  smoothedFistRatio = null;
  clearOverlay();

  // Clear game canvas
  const gameCanvas = gameCanvasEl.value;
  if (gameCanvas) {
    const gctx = gameCanvas.getContext("2d");
    if (gctx) gctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  }

  currentLabel.value = "—";
  gestureDetail.value = "—";
  fingerStates.value = null;
  pinchStatus.value = "—";

  if (camera) await camera.stop();
}

// Listen for device changes
function onDeviceChange() {
  refreshCameraMenu().catch(() => {});
}

// ---- Lifecycle ----

onMounted(async () => {
  handRig = new HandRig();
  gamePanelState.switchCamera = handleSwitchCamera;
  gamePanelState.switchDelegate = switchDelegate;
  gamePanelState.clearLog = () => {
    logLines.value = [];
  };

  // 解锁音频：Safari 等浏览器要求用户手势后才能播放声音
  const unlockAudio = () => {
    if (game) {
      game.unlockAudio();
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    }
  };
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);

  navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
  document.addEventListener("fullscreenchange", onFullscreenChange);

  // Wait a tick for child components to mount
  await nextTick();

  // 浏览器宽度变化（含跨过 768px 断点导致 aspect-ratio 切换）时及时重算布局
  window.addEventListener("resize", handleResize);
  if (stageEl.value && typeof ResizeObserver !== "undefined") {
    _resizeObserver = new ResizeObserver(handleResize);
    _resizeObserver.observe(stageEl.value);
  }

  // Init camera and refresh device list
  if (videoEl.value) {
    const res = getVideoQualityRes();
    camera = new CameraManager(videoEl.value, { width: res.width, height: res.height, frameRate: 60 });
  }
  await refreshCameraMenu().catch(() => {});

  // 游戏启动交由 watch(screen) 在进入 playing 时触发，此处不再自动 start()。
});

onUnmounted(() => {
  gamePanelState.switchCamera = null;
  gamePanelState.switchDelegate = null;
  gamePanelState.clearLog = null;
  navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  window.removeEventListener("resize", handleResize);
  _resizeObserver?.disconnect();
  _resizeObserver = null;
  if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
  hidePassHint();
  if (grabHintTimer) clearTimeout(grabHintTimer);
  stop().catch(() => {});
});
</script>
