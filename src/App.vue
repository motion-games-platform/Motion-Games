<script setup lang="ts">
// Motion Bubble Shooter —— 单游戏页面外壳（由 sway_joy_web 的游戏页裁剪而来）。
// 移除了 Nuxt 专用能力：SSR/ClientOnly/useHead/useRoute/顶栏标题/长文营销与 FAQ；
// 保留：BGM、主舞台（GameClient 常驻）、页面顶部 H1「Bubble Shooter」+ 紧随其下的 How to Play 模块；
// 游戏区域左上角常驻「Debug」按钮，点击展开/收起舞台下方（游戏区域下方）的调试面板。

import "~/assets/css/pinch-pop-bubbles.css"; // 游戏专属样式（内部目录名 pinch-pop-bubbles），随入口加载
import GameClient from "~/components/pinch-pop-bubbles/GameClient.vue";
import StatusPanel from "~/components/pinch-pop-bubbles/StatusPanel.vue";
import { useGamePanelState } from "~/composables/pinch-pop-bubbles/useGamePanelState";
import { mediaUrl } from "~/utils/media";

// 调试面板默认收起；点舞台左上角「Debug」按钮切换开/合。展开后渲染在游戏区域下方（不悬浮、不遮挡舞台）。
const controlOpen = ref(false);
const gamePanelState = useGamePanelState();

document.title = "Motion Bubble Shooter｜Play the Gesture‑Based Bubble Shooting Game";

function onSwitchCamera(deviceId: string) {
  gamePanelState.switchCamera?.(deviceId);
}
function onSwitchDelegate() {
  gamePanelState.switchDelegate?.();
}
function onPauseLog() {
  gamePanelState.logPaused = true;
}
function onClearLog() {
  gamePanelState.clearLog?.();
}
function onResumeLog() {
  gamePanelState.logPaused = false;
}

// —— 背景音乐：进入页面即循环播放；刷新/直达 URL 被浏览器拦自动播放时，等首次手势（点击/按键）兜底触发 ——
const BGM_SRC = mediaUrl("/storage/pinch-pop-bubbles/bg-music.m4a");
const BGM_VOLUME = 0.35; // 背景垫乐，压低避免盖过爆裂等游戏音效
let bgm: HTMLAudioElement | null = null;
let bgmUnlock: (() => void) | null = null;

function stopBgm() {
  if (bgmUnlock) {
    document.removeEventListener("pointerdown", bgmUnlock);
    document.removeEventListener("keydown", bgmUnlock);
    bgmUnlock = null;
  }
  if (bgm) {
    bgm.pause();
    bgm.src = "";
    bgm.load();
    bgm = null;
  }
}

onMounted(() => {
  const audio = new Audio(BGM_SRC);
  audio.loop = true;
  audio.volume = BGM_VOLUME;
  bgm = audio;

  audio.play().catch(() => {
    // NotAllowedError：无用户激活。挂一次性手势监听，用户首次点击/按键（例如点 New Game 进入关卡）即开播。
    const unlock = () => {
      audio.play().catch(() => {});
      bgmUnlock = null;
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    bgmUnlock = unlock;
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
  });
});

onBeforeUnmount(stopBgm);
</script>

<template>
  <!-- 页面滚动容器：main.css 中 body overflow:hidden，这里自行提供全高滚动区 -->
  <div class="app-scroll">
    <div class="game-page">
      <!-- H1 -->
      <header class="game-header">
        <h1 class="game-title">Bubble Shooter</h1>
      </header>

      <!-- H1 下方紧跟 How to Play 模块 -->
      <section class="game-howto">
        <h2 class="game-howto-title">How to Play</h2>
        <p>1. Pinch the bubble with your thumb and index finger in the camera area, then drag and release to launch.</p>
        <p>2. In relaxed mode, you can grab the bubble anywhere and drag it backward before launching.</p>
        <p>3. The farther you drag the bubble, the more stable the launch direction and the less the aim line wobbles.</p>
        <p>4. Fullscreen mode gives the best experience.</p>
        <p>5. For the best experience, keep your hand 30 to 80 cm away from the camera.</p>
      </section>

      <!-- 游戏舞台：整个生命周期（home/playing/win/summary）都在 GameClient 内持久化切换，全屏目标舞台永不卸载。
           通过 debugOverlay 具名插槽注入左上角 Debug 按钮（常驻，普通/全屏都可见），按钮本身在 .stage 内部。 -->
      <div class="game-area">
        <GameClient>
          <template #debugOverlay>
            <button
              class="debug-toggle-btn"
              :class="{ 'debug-toggle-btn--on': controlOpen }"
              type="button"
              :title="controlOpen ? 'Hide debug panel' : 'Show debug panel'"
              @click="controlOpen = !controlOpen"
            >Debug</button>
          </template>
        </GameClient>
      </div>

      <!-- 调试面板：展开后显示在游戏区域下方（整行栏，不悬浮不遮挡舞台） -->
      <div v-if="controlOpen" class="game-control">
        <StatusPanel
          :current-label="gamePanelState.currentLabel"
          :gesture-detail="gamePanelState.gestureDetail"
          :finger-states="gamePanelState.fingerStates"
          :pinch-status="gamePanelState.pinchStatus"
          :camera-devices="gamePanelState.cameraDevices"
          :active-device-id="gamePanelState.activeDeviceId"
          :score="gamePanelState.score"
          :game-state="gamePanelState.gameState"
          :fps="gamePanelState.fps"
          :delegate-mode="gamePanelState.delegateMode"
          :log-lines="gamePanelState.logLines"
          @switch-camera="onSwitchCamera"
          @switch-delegate="onSwitchDelegate"
          @pause-log="onPauseLog"
          @clear-log="onClearLog"
          @resume-log="onResumeLog"
        />
      </div>
    </div>
  </div>
</template>

<style>
/* main.css 中 body overflow:hidden；这里提供游戏页自身的全高滚动容器（顶栏等平台外壳已裁掉） */
.app-scroll {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
}

/* ---- 页面外壳主题：teal(#1f8a86) 底 + 纯白文字 + #ffe62f 强调 ----
   只作用于游戏舞台外围（标题区 / How to Play 等页面文字），
   .game-area 舞台内部的关卡卡片 / 按钮贴图保持原风格不动。 */
html,
body {
  background: #1f8a86;
}

.app-scroll {
  background: #1f8a86;
}

.game-page > .game-header {
  color: #ffffff;
}

/* 顶部大标题用黄色强调 */
.game-header .game-title {
  color: #ffe62f;
}

/* How to Play 一带本来就是 teal + 白/黄配色，保留；标题白、要点黄 */
.game-howto {
  color: #ffe62f;
}

/* ---- 游戏舞台左上角常驻 Debug 按钮 ----
   经 GameClient 的 debugOverlay 插槽渲染进 .stage，随舞台全屏可见；
   点击展开/收起游戏区域下方的调试面板（.game-control 用 main.css 的默认整行样式）。 */
.debug-toggle-btn {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 8; /* 高于舞台覆盖层(6)与左下工具钮(7)，低于右上角设置齿轮(10) */
  padding: 6px 14px;
  border-radius: 999px;
  background: #ffffff;
  border: 2px solid var(--candy-teal-deep);
  color: var(--candy-ink);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 3px 0 var(--candy-teal-deep);
  transition: transform 0.1s ease, background 0.2s, color 0.2s;
}
.debug-toggle-btn:hover {
  background: var(--candy-teal);
  transform: scale(1.04);
}
.debug-toggle-btn:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--candy-teal-deep);
}
.debug-toggle-btn--on {
  background: var(--candy-teal);
  color: #ffffff;
}
</style>
