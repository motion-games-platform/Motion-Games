export class CameraManager {
  /**
   * @param {HTMLVideoElement} videoEl
   * @param {{width?:number,height?:number,frameRate?:number}} opts
   */
  constructor(videoEl, opts = {}) {
    this.videoEl = videoEl;
    this.width = opts.width ?? 1280;
    this.height = opts.height ?? 720;
    this.frameRate = opts.frameRate ?? 30;

    /** @type {MediaStream | null} */
    this.stream = null;
    /** @type {string | null} */
    this.deviceId = null;
  }

  async listVideoDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  }

  setResolution(width, height) {
    this.width = width;
    this.height = height;
  }

  async start(deviceId = null) {
    await this.stop();

    /** @type {MediaStreamConstraints} */
    const constraints = {
      audio: false,
      video: {
        width: { ideal: this.width },
        height: { ideal: this.height },
        frameRate: { ideal: this.frameRate },
        ...(deviceId ? { deviceId: { exact: deviceId } } : null),
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.stream = stream;
    this.deviceId = deviceId;
    this.videoEl.srcObject = stream;

    // Ensure playback starts quickly.
    await this.videoEl.play();

    try {
      const track = stream.getVideoTracks?.()[0];
      const settings = track?.getSettings?.();
      if (settings?.deviceId) this.deviceId = settings.deviceId;
    } catch {
      // ignore
    }

    return stream;
  }

  async stop() {
    const stream = this.stream;
    this.stream = null;
    this.deviceId = null;

    try {
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
      }
    } catch {
      // ignore
    }

    try {
      this.videoEl.srcObject = null;
    } catch {
      // ignore
    }
  }

  getActiveDeviceId() {
    return this.deviceId;
  }
}
