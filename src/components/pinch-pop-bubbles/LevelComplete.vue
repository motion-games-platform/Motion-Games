<template>
  <div class="level-screen">
    <div class="level-complete-popup plate-menus">
      <!-- 飘带：顶部居中，超出弹窗上边框 36px，4:1 宽高比，内嵌关卡号 -->
      <div class="level-complete-ribbon">
        <span class="level-complete-ribbon-text">Level {{ state.lastLevelId }}</span>
      </div>

      <div class="level-complete-body">
        <div class="level-complete-trophy-wrap">
          <span
            v-for="(piece, i) in confetti"
            :key="i"
            class="level-confetti"
            :style="{
              background: piece.color,
              width: piece.size,
              height: piece.size,
              '--tx': piece.tx,
              '--ty': piece.ty,
              '--rot': piece.rot,
              '--dur': piece.dur,
              '--delay': piece.delay,
            }"
          />
          <img
            class="level-complete-trophy"
            :src="trophySrc"
            :alt="`Level ${state.lastLevelId} trophy`"
          />
        </div>
        <p v-if="state.lastScore > 0" class="level-complete-score">Score: {{ state.lastScore }}</p>

        <div class="level-complete-actions">
          <button
            class="level-replay-btn"
            type="button"
            aria-label="Replay"
            title="Replay"
            @click="replayNow()"
          >
            <img
              class="level-replay-icon"
              :src="mediaUrl('/storage/pinch-pop-bubbles/replay.webp')"
              alt="Replay"
            />
          </button>
          <button
            v-if="!isLastLevel"
            class="level-btn level-btn--primary btn-plate-continue"
            type="button"
            @click="continueNow()"
          >
            Continue ({{ countdown }}s)
          </button>
          <button
            v-else
            class="level-btn level-btn--primary"
            type="button"
            @click="finishNow()"
          >
            Finish
          </button>
        </div>

        <span v-if="!isLastLevel" class="level-complete-next-label">Next: Level {{ state.lastLevelId + 1 }}</span>
        <span v-else class="level-complete-next-label">All Levels Complete</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLevelManager } from "~/composables/pinch-pop-bubbles/useLevelManager";
import { TOTAL_LEVELS } from "~/config/pinch-pop-bubbles/levels";

const { state, toNextLevel, toSummary, replayCurrent } = useLevelManager();

// 是否为最后一关：最后一关通关后定格在恭喜画面，不自动进入下一关
const isLastLevel = computed(() => state.lastLevelId >= TOTAL_LEVELS);

// 奖杯图片：按当前关卡号映射 trophy-01 ~ trophy-NN（两位补零）；素材走 CDN 子域（mediaUrl）
const trophySrc = computed(() => {
  const n = String(state.lastLevelId).padStart(2, "0");
  return mediaUrl(`/storage/pinch-pop-bubbles/trophy-${n}.webp`);
});

// 奖杯背后不停飘出的彩色碎片：随机生成方向 / 大小 / 时长，无限循环
const CONFETTI_COLORS = [
  "#f3f269", // 糖果黄
  "#ef9482", // 糖果珊瑚
  "#7be5e0", // 糖果青
  "#2fa8a6", // 深青
  "#d9c84a", // 深黄
  "#c96a56", // 深珊瑚
  "#f6b7aa", // 浅珊瑚
  "#4ecdc4",
];

interface ConfettiPiece {
  color: string;
  tx: string;
  ty: string;
  rot: string;
  dur: string;
  delay: string;
  size: string;
}

const confetti: ConfettiPiece[] = Array.from({ length: 20 }, () => {
  const angle = Math.random() * Math.PI * 2;
  const dist = 55 + Math.random() * 75;
  return {
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    tx: `${(Math.cos(angle) * dist).toFixed(0)}px`,
    ty: `${(Math.sin(angle) * dist - 45).toFixed(0)}px`,
    rot: `${(Math.random() * 540 + 180).toFixed(0)}deg`,
    dur: `${(1 + Math.random() * 1.5).toFixed(2)}s`,
    delay: `${(Math.random() * 3).toFixed(2)}s`,
    size: `${(6 + Math.random() * 6).toFixed(0)}px`,
  };
});

// 5 秒倒计时：默认自动点击 Continue 进入下一关
const countdown = ref(5);
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function continueNow() {
  stopTimer();
  toNextLevel();
}

function finishNow() {
  stopTimer();
  toSummary();
}

function replayNow() {
  stopTimer();
  replayCurrent();
}

onMounted(() => {
  // 最后一关：不启动倒计时，定格在通关画面，由用户手动点击 Finish
  if (isLastLevel.value) return;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      stopTimer();
      toNextLevel();
    }
  }, 1000);
});

onUnmounted(() => {
  stopTimer();
});
</script>
