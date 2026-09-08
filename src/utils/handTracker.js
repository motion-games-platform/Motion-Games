// MediaPipe Hand Landmarker（Tasks API）封装。
// 优先使用 GPU（WebGL）加速，初始化失败时回退到 CPU（WASM）。

import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { mediaUrl } from "~/utils/media";

// 手部骨架连接关系（用于绘制），替代旧版 window.HAND_CONNECTIONS。
export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

// MediaPipe wasm/task 走 CDN 子域（public/storage/vendor → storage.swayjoy.com/vendor），见 app/utils/media.js。
const WASM_BASE_PATH = mediaUrl("/storage/vendor/mediapipe/tasks");
const MODEL_ASSET_PATH = mediaUrl("/storage/vendor/mediapipe/tasks/hand_landmarker.task");

// 缓存 FilesetResolver 结果，避免看门狗重建时重复加载 WASM。
let _filesetPromise = null;

function _getFileset() {
  if (!_filesetPromise) {
    _filesetPromise = FilesetResolver.forVisionTasks(WASM_BASE_PATH);
  }
  return _filesetPromise;
}

export class HandTracker {
  /**
   * @param {{maxNumHands?:number, minDetectionConfidence?:number, minTrackingConfidence?:number, preferredDelegate?:string}} opts
   */
  constructor(opts = {}) {
    this.maxNumHands = opts.maxNumHands ?? 1;
    this.minDetectionConfidence = opts.minDetectionConfidence ?? 0.5;
    this.minTrackingConfidence = opts.minTrackingConfidence ?? 0.5;
    this.preferredDelegate = opts.preferredDelegate ?? "GPU";

    /** @type {HandLandmarker | null} */
    this.landmarker = null;
    /** 最终实际使用的 delegate："GPU" 或 "CPU" */
    this.delegate = "CPU";
    this._resultsCb = null;
  }

  /** 初始化 landmarker：按 preferredDelegate 选择，GPU 失败回退 CPU。返回实际 delegate。 */
  async init() {
    const vision = await _getFileset();

    const makeOptions = (delegate) => ({
      baseOptions: {
        modelAssetPath: MODEL_ASSET_PATH,
        delegate,
      },
      runningMode: "VIDEO",
      numHands: this.maxNumHands,
      minHandDetectionConfidence: this.minDetectionConfidence,
      minTrackingConfidence: this.minTrackingConfidence,
    });

    if (this.preferredDelegate === "CPU") {
      this.landmarker = await HandLandmarker.createFromOptions(vision, makeOptions("CPU"));
      this.delegate = "CPU";
    } else {
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, makeOptions("GPU"));
        this.delegate = "GPU";
      } catch (e) {
        console.warn("[HandTracker] GPU delegate init failed, falling back to CPU", e);
        this.landmarker = await HandLandmarker.createFromOptions(vision, makeOptions("CPU"));
        this.delegate = "CPU";
      }
    }

    return this.delegate;
  }

  /** @param {(results:any)=>void} cb */
  onResults(cb) {
    this._resultsCb = cb;
  }

  /**
   * 处理一帧视频（同步，detectForVideo 会阻塞直到推理完成）。
   * @param {HTMLVideoElement} videoEl
   */
  processVideoFrame(videoEl) {
    if (!this.landmarker) return;
    const results = this.landmarker.detectForVideo(videoEl, performance.now());
    if (this._resultsCb) {
      // 适配成旧版 `multiHandLandmarks` 结构，保持 onHandResults 不变
      this._resultsCb({
        multiHandLandmarks: results.landmarks || [],
        worldLandmarks: results.worldLandmarks || [],
      });
    }
  }

  getDelegate() {
    return this.delegate;
  }
}
