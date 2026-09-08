// Type declarations for hand tracking and bubble game

export interface Point3D {
  x: number;
  y: number;
  z?: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface ContentRect {
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
}

export interface FingerState {
  extended: boolean;
  folded: boolean;
  state: "EXTENDED" | "FOLDED" | "BENT";
  score: number;
  debug: Record<string, number>;
}

export interface FingerStates {
  thumb: FingerState;
  index: FingerState;
  middle: FingerState;
  ring: FingerState;
  pinky: FingerState;
}

export interface PinchResult {
  isPinching: boolean;
  pinchDist: number;
  pinchRatio: number;
  thresholdRatio: number;
  baseLen: number;
}

export interface GestureResult {
  gesture: string;
  label: string;
  states: FingerStates;
  mask: number;
  code: string;
  pinch: PinchResult;
  handWidth: number;
  allFour: boolean;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export type CameraStatus = "idle" | "requesting" | "running" | "blocked" | "stopped";

declare global {
  interface Window {
    Hands: any;
    HAND_CONNECTIONS: any;
    drawConnectors: any;
    drawLandmarks: any;
  }
}

export {};
