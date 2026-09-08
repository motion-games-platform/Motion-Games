<template>
  <div class="level-screen">
    <div class="level-screen-card plate-menus">
      <h2 class="level-screen-title">Are You Ready ? {{ currentLevel.name }} ~</h2>
      <!-- 难易程度：第一关 1 星，每过一关 +0.5 星（支持半星） -->
      <div class="level-difficulty">
        <span class="level-difficulty-label">Difficulty</span>
        <div class="level-stars">
          <span v-for="i in fullStars" :key="'star-' + i" class="level-star">★</span>
          <span v-if="hasHalfStar" class="level-star level-star--half">★</span>
        </div>
      </div>

      <!-- 过关条件：标签靠左，两行条件居中，中间一行居中 OR / AND -->
      <div class="level-condition">
        <span class="level-condition-label">Pass Condition</span>
        <div class="level-condition-line">Score {{ currentLevel.passScore }} points</div>
        <div class="level-condition-sep">{{ currentLevel.passMode === "OR" ? "OR" : "AND" }}</div>
        <div class="level-condition-line">Clear all bubbles</div>
      </div>
      <div class="level-intro-actions">
        <button class="level-btn level-btn--secondary" type="button" @click="exitNow()">Exit</button>
        <button class="level-btn level-btn--primary" type="button" @click="startNow()">Start</button>
      </div>
      <div class="level-intro-countdown">Starts in {{ countdown }}s</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLevelManager } from "~/composables/pinch-pop-bubbles/useLevelManager";

const { currentLevel, startCurrent, toHome } = useLevelManager();

// 难度星级：第一关 1 星，每过一关 +0.5 星（支持半星）
const difficultyStars = computed(() => 1 + (currentLevel.value.id - 1) * 0.5);
const fullStars = computed(() => Math.floor(difficultyStars.value));
const hasHalfStar = computed(() => difficultyStars.value - fullStars.value >= 0.5);

const countdown = ref(8);
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function startNow() {
  stopTimer();
  startCurrent();
}

function exitNow() {
  stopTimer();
  toHome();
}

onMounted(() => {
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      stopTimer();
      startCurrent();
    }
  }, 1000);
});

onUnmounted(() => {
  stopTimer();
});
</script>
