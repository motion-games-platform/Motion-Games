<template>
  <div class="level-screen level-map-screen">
    <h2 class="level-map-game-title">Motion Bubble Shooter</h2>
    <h2 class="level-map-progress-title">Level Progress</h2>

    <svg class="level-map-svg" :viewBox="`0 0 ${viewW} ${viewH}`">
      <!-- 蛇形连线 -->
      <polyline :points="routePoints" class="level-map-line" fill="none" />
      <!-- 关卡节点：奖杯图片 + 底部关卡数字 -->
      <g v-for="lv in LEVELS" :key="lv.id">
        <!-- 当前关卡外圈高亮 -->
        <circle
          v-if="isUnlocked(lv.id) && !isPassed(lv.id)"
          :cx="pos(lv.id).x"
          :cy="pos(lv.id).y"
          :r="NODE_HALF + 5"
          class="level-node-ring"
        />
        <image
          :href="trophySrc(lv.id)"
          :x="pos(lv.id).x - NODE_HALF"
          :y="pos(lv.id).y - NODE_HALF"
          :width="NODE_SIZE"
          :height="NODE_SIZE"
          :class="nodeClass(lv.id)"
        />
        <text
          :x="pos(lv.id).x"
          :y="pos(lv.id).y + NODE_HALF + 15"
          :fill="numFill(lv.id)"
          class="level-map-num"
          text-anchor="middle"
        >{{ lv.id }}</text>
        <text
          v-if="isPassed(lv.id)"
          :x="pos(lv.id).x"
          :y="pos(lv.id).y - NODE_HALF - 7"
          fill="#ffffff"
          class="level-map-check"
          text-anchor="middle"
        >✓</text>
      </g>
    </svg>

    <button class="level-btn level-btn--primary btn-plate-continue" type="button" @click="toIntro()">
      {{ state.lastResult === "fail" ? "Retry" : "Continue" }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { LEVELS } from "~/config/pinch-pop-bubbles/levels";
import { useLevelManager } from "~/composables/pinch-pop-bubbles/useLevelManager";

const { state, isPassed, isUnlocked, toIntro } = useLevelManager();

// 蛇形布局：5 列 × 4 行，偶数行从左到右、奇数行从右到左
const COLS = 5;
const GAP_X = 100;
const GAP_Y = 90;
const MARGIN = 50;

const viewW = MARGIN * 2 + (COLS - 1) * GAP_X;
const viewH = MARGIN * 2 + (Math.ceil(LEVELS.length / COLS) - 1) * GAP_Y;

// 节点尺寸：奖杯原图 102×102，节点内显示 50×50
const NODE_SIZE = 50;
const NODE_HALF = NODE_SIZE / 2;

// 奖杯图：第 N 关使用 trophy-NN.webp（两位补零）；素材走 CDN 子域（mediaUrl）
function trophySrc(id: number) {
  const n = String(id).padStart(2, "0");
  return mediaUrl(`/storage/pinch-pop-bubbles/trophy-${n}.webp`);
}

function pos(id: number) {
  const idx = id - 1;
  const row = Math.floor(idx / COLS);
  const col = idx % COLS;
  const actualCol = row % 2 === 0 ? col : COLS - 1 - col;
  return {
    x: MARGIN + actualCol * GAP_X,
    y: MARGIN + row * GAP_Y,
  };
}

const routePoints = computed(() => {
  return LEVELS.map((lv) => `${pos(lv.id).x},${pos(lv.id).y}`).join(" ");
});

function nodeClass(id: number) {
  if (isPassed(id)) return "level-node level-node--passed";
  if (isUnlocked(id)) return "level-node level-node--current";
  return "level-node level-node--locked";
}

function numFill(id: number) {
  if (isPassed(id)) return "#ffffff";
  if (isUnlocked(id)) return "#f3f269"; // 糖果黄，与关卡卡片的青绿底搭配
  return "#9ca3af";
}
</script>
