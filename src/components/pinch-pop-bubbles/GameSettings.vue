<template>
  <div class="game-settings">
    <!-- 关卡主菜单卡片右上角的设置按钮 -->
    <button class="settings-btn icon-btn" type="button" title="Settings" aria-label="Settings" @click="open">
      <svg
        class="settings-btn-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </button>

    <!-- 弹框直接渲染在 .game-settings 内（不再 Teleport 到 body），
         使其位于 .stage 全屏元素子树内，全屏模式下也能正常显示 -->
    <div v-if="visible" class="settings-modal" @click.self="close">
      <div class="settings-dialog plate-menus-col" role="dialog" aria-modal="true" aria-label="Game settings">
        <h3 class="settings-title">Settings</h3>

        <div class="settings-group">
          <div class="settings-group-label">Grab mode</div>
          <label class="settings-radio">
            <input
              type="radio"
              name="grabMode"
              value="pinch"
              :checked="draft.grabMode === 'pinch'"
              @change="draft.grabMode = 'pinch'"
            />
            <span>Pinch (thumb + index finger)</span>
          </label>
          <label class="settings-radio">
            <input
              type="radio"
              name="grabMode"
              value="fist"
              :checked="draft.grabMode === 'fist'"
              @change="draft.grabMode = 'fist'"
            />
            <span>Fist</span>
          </label>
        </div>

        <div class="settings-group">
          <div class="settings-group-label">Show camera feed</div>
          <label class="settings-radio">
            <input
              type="radio"
              name="showCamera"
              value="yes"
              :checked="draft.showCamera"
              @change="draft.showCamera = true"
            />
            <span>Yes</span>
          </label>
          <label class="settings-radio">
            <input
              type="radio"
              name="showCamera"
              value="no"
              :checked="!draft.showCamera"
              @change="draft.showCamera = false"
            />
            <span>No</span>
          </label>
        </div>

        <div class="settings-group">
          <div class="settings-group-label">Video quality</div>
          <label
            v-for="(q, key) in VIDEO_QUALITIES"
            :key="key"
            class="settings-radio"
          >
            <input
              type="radio"
              name="videoQuality"
              :value="key"
              :checked="draft.videoQuality === key"
              @change="draft.videoQuality = key"
            />
            <span>{{ q.label }}</span>
          </label>
        </div>

        <div class="settings-actions">
          <button class="level-btn level-btn--secondary btn-plate-no" type="button" @click="close">Cancel</button>
          <button class="level-btn level-btn--primary btn-plate-yes" type="button" @click="save">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  useGameSettings,
  VIDEO_QUALITIES,
  type GrabMode,
  type VideoQuality,
} from "~/composables/pinch-pop-bubbles/useGameSettings";

const { settings, save: persist } = useGameSettings();

const visible = ref(false);
const draft = ref<{ grabMode: GrabMode; showCamera: boolean; videoQuality: VideoQuality }>({
  grabMode: settings.grabMode,
  showCamera: settings.showCamera,
  videoQuality: settings.videoQuality,
});

function open() {
  // 打开时用当前设置刷新草稿，保证「取消」能回到原值
  draft.value = {
    grabMode: settings.grabMode,
    showCamera: settings.showCamera,
    videoQuality: settings.videoQuality,
  };
  visible.value = true;
}

function close() {
  visible.value = false;
}

function save() {
  persist({
    grabMode: draft.value.grabMode,
    showCamera: draft.value.showCamera,
    videoQuality: draft.value.videoQuality,
  });
  close();
}
</script>
