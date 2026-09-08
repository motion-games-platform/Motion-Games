import { reactive, watch } from "vue";

export type GrabMode = "pinch" | "fist";

// 视频质量档位，对应摄像头采集分辨率（16:9，与舞台画面比例一致）
export type VideoQuality = "480p" | "720p" | "1080p";

export const VIDEO_QUALITIES: Record<
  VideoQuality,
  { label: string; width: number; height: number }
> = {
  "480p": { label: "480P", width: 854, height: 480 },
  "720p": { label: "720P", width: 1280, height: 720 },
  "1080p": { label: "1080P", width: 1920, height: 1080 },
};

export interface GameSettings {
  grabMode: GrabMode;
  showCamera: boolean;
  videoQuality: VideoQuality;
}

const STORAGE_KEY = "swayjoy:pinch-pop-bubbles:settings";

const DEFAULTS: GameSettings = { grabMode: "pinch", showCamera: false, videoQuality: "720p" };

function loadSettings(): GameSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      grabMode: parsed?.grabMode === "fist" ? "fist" : "pinch",
      showCamera: parsed?.showCamera === true,
      videoQuality: parsed?.videoQuality in VIDEO_QUALITIES ? parsed.videoQuality : DEFAULTS.videoQuality,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

// 模块级响应式单例：GameClient（游戏内）与 GameSettings（关卡主菜单）共享同一份设置。
const settings = reactive<GameSettings>(loadSettings());

function persist() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// 任意字段变更即持久化到 localStorage。
watch(settings, persist, { deep: true });

export function useGameSettings() {
  return {
    settings,
    setGrabMode(mode: GrabMode) {
      settings.grabMode = mode;
    },
    setShowCamera(show: boolean) {
      settings.showCamera = show;
    },
    setVideoQuality(quality: VideoQuality) {
      settings.videoQuality = quality;
    },
    save(next: Partial<GameSettings>) {
      if (next.grabMode) settings.grabMode = next.grabMode;
      if (next.showCamera !== undefined) settings.showCamera = next.showCamera;
      if (next.videoQuality) settings.videoQuality = next.videoQuality;
      persist();
    },
  };
}
