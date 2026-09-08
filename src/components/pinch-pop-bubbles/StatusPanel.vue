<template>
  <aside class="control-panel">
    <div class="control-panel-col control-panel-col--info">
      <div class="control-panel-title">Status</div>

      <div class="statusCard">
      <div class="gestureHeader">
        <div class="gestureName">{{ currentLabel }}</div>
        <div class="gestureSub">{{ gestureDetail }}</div>
      </div>

      <div class="metrics">
        <div class="metric">
          <div class="metricLabel">Fingers</div>
          <div class="fingers">
            <span
              v-for="(info, key) in fingerPills"
              :key="key"
              class="fingerPill"
              :class="info.on ? 'fingerOn' : 'fingerOff'"
            >{{ info.label }}:{{ info.text }}</span>
            <span v-if="!fingerPills">—</span>
          </div>
        </div>
        <div class="metric">
          <div class="metricLabel">Pinch</div>
          <div class="metricValue">{{ pinchStatus }}</div>
        </div>
        <div class="metric">
          <div class="metricLabel">FPS</div>
          <div class="metricValue">{{ fps }}</div>
        </div>
        <div class="metric">
          <div class="metricLabel">Delegate</div>
          <div class="metricValue delegate-value">
            <span>{{ delegateMode }}</span>
            <button class="delegate-switch-btn" type="button" @click="$emit('switch-delegate')">Switch</button>
          </div>
        </div>
      </div>

      <div class="cameraRow">
        <div class="metricLabel">Camera</div>
        <div class="cameraControls">
          <div class="dropdown" ref="cameraDropdownRef">
            <button class="dropBtn" type="button" @click="toggleMenu">
              <span class="dropText">{{ cameraButtonText }}</span>
              <span class="dropCaret">▾</span>
            </button>
            <div v-show="menuOpen" class="dropMenu">
              <button
                v-for="device in cameraDevices"
                :key="device.deviceId"
                type="button"
                class="dropItem"
                @click="selectDevice(device)"
              >
                <span>{{ device.label }}</span>
                <span class="dropMeta">{{ device.deviceId === activeDeviceId ? '✓' : '' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="control-panel-title">Game</div>
    <div class="statusCard">
      <div class="metrics">
        <div class="metric">
          <div class="metricLabel">Score</div>
          <div class="metricValue">{{ score }}</div>
        </div>
        <div class="metric">
          <div class="metricLabel">State</div>
          <div class="metricValue">{{ gameState }}</div>
        </div>
      </div>
    </div>

    </div>

    <div class="control-panel-col control-panel-col--log">
      <div class="control-panel-title">Log</div>
      <div class="log-toolbar">
        <button class="log-btn" type="button" @click="$emit('pause-log')">Pause</button>
        <button class="log-btn" type="button" @click="$emit('clear-log')">Clear</button>
        <button class="log-btn" type="button" @click="$emit('resume-log')">Resume</button>
      </div>
      <pre class="log" ref="logEl">{{ logText }}</pre>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { shortId } from "~/utils/format";

const props = defineProps<{
  currentLabel: string;
  gestureDetail: string;
  fingerStates: Record<string, { state: string }> | null;
  pinchStatus: string;
  cameraDevices: { deviceId: string; label: string }[];
  activeDeviceId: string | null;
  score: number;
  gameState: string;
  fps: string;
  delegateMode: string;
  logLines: string[];
}>();

const emit = defineEmits<{
  (e: "switch-camera", deviceId: string): void;
  (e: "switch-delegate"): void;
  (e: "pause-log"): void;
  (e: "clear-log"): void;
  (e: "resume-log"): void;
}>();

const cameraDropdownRef = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const logEl = ref<HTMLElement | null>(null);

// Finger pills
const fingerPills = computed(() => {
  if (!props.fingerStates) return null;
  const defs: [string, string][] = [
    ["thumb", "Thumb"],
    ["index", "Index"],
    ["middle", "Middle"],
    ["ring", "Ring"],
    ["pinky", "Pinky"],
  ];
  const result: Record<string, { label: string; text: string; on: boolean }> = {};
  for (const [key, label] of defs) {
    const s = props.fingerStates[key];
    if (!s) continue;
    const on = s.state === "EXTENDED";
    result[key] = {
      label,
      text: s.state === "EXTENDED" ? "Ext" : s.state === "FOLDED" ? "Fold" : "Bend",
      on,
    };
  }
  return result;
});

const cameraButtonText = computed(() => {
  if (!props.cameraDevices.length) return "No camera";
  const cur = props.cameraDevices.find((d) => d.deviceId === props.activeDeviceId);
  return cur?.label || props.cameraDevices[0]?.label || "No camera";
});

const logText = computed(() => props.logLines.join("\n"));

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function selectDevice(device: { deviceId: string; label: string }) {
  emit("switch-camera", device.deviceId);
  closeMenu();
}

// Close menu on outside click
function handleClickOutside(e: MouseEvent) {
  if (cameraDropdownRef.value && !cameraDropdownRef.value.contains(e.target as Node)) {
    closeMenu();
  }
}

// Close menu on Escape
function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") closeMenu();
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
  document.removeEventListener("keydown", handleKeydown);
});

// Auto-scroll log — only follow new lines if the user is already near the
// bottom, so manual scrolling up isn't yanked back down.
watch(logText, () => {
  nextTick(() => {
    const el = logEl.value;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  });
});
</script>
