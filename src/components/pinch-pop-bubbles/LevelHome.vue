<template>
  <div class="level-screen">
    <div class="level-screen-card plate-menus">
      <PinchPopBubblesGameSettings />

      <h2 class="level-screen-title">Motion Bubble Shooter</h2>

      <ul class="level-home-tips">
        <li>Pinch a bubble to grab it</li>
        <li>Pull back to aim, then open your fingers to fire</li>
        <li>Match 3+ bubbles of the same color to pop them</li>
      </ul>

      <div class="level-home-actions">
        <button class="level-btn level-btn--secondary btn-plate-newgame" type="button" @click="newGame()">New Game</button>
        <button v-if="hasProgress" class="level-btn level-btn--primary btn-plate-continue" type="button" @click="continueGame()">Continue</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLevelManager } from "~/composables/pinch-pop-bubbles/useLevelManager";

const { state, newGame, continueGame } = useLevelManager();

// 本地无存档（未通过任何关卡）时不显示 Continue
const hasProgress = computed(() => state.passedIds.length > 0);
</script>
