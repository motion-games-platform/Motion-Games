import { reactive } from "vue";

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface GamePanelState {
  currentLabel: string;
  gestureDetail: string;
  fingerStates: Record<string, { state: string }> | null;
  pinchStatus: string;
  cameraDevices: CameraDevice[];
  activeDeviceId: string | null;
  score: number;
  gameState: string;
  fps: string;
  logLines: string[];
  logPaused: boolean;
  delegateMode: string;
  switchCamera: ((deviceId: string) => void) | null;
  switchDelegate: (() => void) | null;
  clearLog: (() => void) | null;
}

// Module-level singleton shared between GameClient (writer) and the
// game page (reader) so the control panel can live outside the game area.
const state: GamePanelState = reactive({
  currentLabel: "—",
  gestureDetail: "—",
  fingerStates: null,
  pinchStatus: "—",
  cameraDevices: [],
  activeDeviceId: null,
  score: 0,
  gameState: "ready",
  fps: "0",
  logLines: [],
  logPaused: false,
  delegateMode: "—",
  switchCamera: null,
  switchDelegate: null,
  clearLog: null,
});

export function useGamePanelState() {
  return state;
}
