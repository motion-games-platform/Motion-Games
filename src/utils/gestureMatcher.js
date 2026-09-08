// Pure gesture computation utilities — ported from handemo-main/public/gestureMatcher.js

const FINGER = {
  THUMB: "thumb",
  INDEX: "index",
  MIDDLE: "middle",
  RING: "ring",
  PINKY: "pinky",
};

const STATE = {
  EXTENDED: "EXTENDED",
  FOLDED: "FOLDED",
  BENT: "BENT",
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function dist3(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(dx, dy, dz);
}

function dist2(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  return Math.hypot(dx, dy);
}

function angleDeg(a, b, c) {
  const v1x = (a.x ?? 0) - (b.x ?? 0);
  const v1y = (a.y ?? 0) - (b.y ?? 0);
  const v1z = (a.z ?? 0) - (b.z ?? 0);
  const v2x = (c.x ?? 0) - (b.x ?? 0);
  const v2y = (c.y ?? 0) - (b.y ?? 0);
  const v2z = (c.z ?? 0) - (b.z ?? 0);

  const dot = v1x * v2x + v1y * v2y + v1z * v2z;
  const n1 = Math.hypot(v1x, v1y, v1z);
  const n2 = Math.hypot(v2x, v2y, v2z);
  if (n1 < 1e-6 || n2 < 1e-6) return 0;
  const cos = clamp(dot / (n1 * n2), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

function fingerAngles(landmarks, mcp, pip, dip, tip) {
  const a = landmarks?.[mcp];
  const b = landmarks?.[pip];
  const c = landmarks?.[dip];
  const d = landmarks?.[tip];
  if (!a || !b || !c || !d) return { pip: 0, dip: 0, min: 0 };
  const angPip = angleDeg(a, b, c);
  const angDip = angleDeg(b, c, d);
  return { pip: angPip, dip: angDip, min: Math.min(angPip, angDip) };
}

function fingerExtendedByScore(
  landmarks,
  handWidth,
  mcp,
  pip,
  dip,
  tip,
  angleThr,
  distPalmThr = 1.18,
  distWThr = 0.06,
) {
  const wrist = landmarks?.[0];
  const tipP = landmarks?.[tip];
  const pipP = landmarks?.[pip];
  if (!wrist || !tipP || !pipP) {
    return { extended: false, folded: false, score: 0, debug: {} };
  }

  const pc = palmCenter(landmarks);
  const ang = fingerAngles(landmarks, mcp, pip, dip, tip);

  const distW = dist3(tipP, wrist) - dist3(pipP, wrist);
  const distWNorm = distW / handWidth;
  const distPalmNorm = dist3(tipP, pc) / handWidth;

  const angleOk = ang.min >= angleThr;
  const farFromWristOk = distWNorm > distWThr;
  const farFromPalmOk = distPalmNorm > distPalmThr;

  const score = (angleOk ? 1 : 0) + (farFromWristOk ? 1 : 0) + (farFromPalmOk ? 1 : 0);
  const extended = score >= 2;

  const folded =
    (distPalmNorm < 0.95 && distWNorm < 0.0) ||
    (ang.min < 120 && distPalmNorm < 1.05);

  return {
    extended,
    folded,
    score,
    debug: { angMin: ang.min, distWNorm, distPalmNorm },
  };
}

function thumbStateByScore(landmarks, handWidth) {
  const tip = landmarks?.[4];
  const ip = landmarks?.[3];
  const mcp = landmarks?.[2];
  const cmc = landmarks?.[1];
  const indexMcp = landmarks?.[5];
  if (!tip || !ip || !mcp || !cmc || !indexMcp) {
    return { extended: false, folded: false, score: 0, debug: {} };
  }

  const pc = palmCenter(landmarks);
  const ang1 = angleDeg(mcp, ip, tip); // at IP
  const ang2 = angleDeg(cmc, mcp, ip); // at MCP
  const angMin = Math.min(ang1, ang2);

  const distPalmNorm = dist3(tip, pc) / handWidth;
  const distIndexMcpNorm = dist3(tip, indexMcp) / handWidth;
  const distThumbBaseNorm = dist3(tip, mcp) / handWidth;

  const angleOk = angMin >= 155;
  const awayFromPalmOk = distPalmNorm > 0.98;
  const notAcrossPalmOk = distIndexMcpNorm > 0.6;
  const notCollapsedOk = distThumbBaseNorm > 0.55;

  const score =
    (angleOk ? 1 : 0) +
    (awayFromPalmOk ? 1 : 0) +
    (notAcrossPalmOk ? 1 : 0) +
    (notCollapsedOk ? 1 : 0);

  const extended = score >= 3;
  const folded = distPalmNorm < 0.9 || distIndexMcpNorm < 0.5 || distThumbBaseNorm < 0.5;

  return {
    extended,
    folded,
    score,
    debug: { angMin, distPalmNorm, distIndexMcpNorm, distThumbBaseNorm },
  };
}

function fingerStateFrom(extended, folded) {
  if (extended) return STATE.EXTENDED;
  if (folded) return STATE.FOLDED;
  return STATE.BENT;
}

function fingerExtendedByAngle(landmarks, mcp, pip, tip, thresholdDeg = 165) {
  const a = landmarks?.[mcp];
  const b = landmarks?.[pip];
  const c = landmarks?.[tip];
  if (!a || !b || !c) return false;
  return angleDeg(a, b, c) >= thresholdDeg;
}

function palmCenter(landmarks) {
  const idx = [0, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of idx) {
    const p = landmarks?.[i];
    x += p?.x ?? 0;
    y += p?.y ?? 0;
    z += p?.z ?? 0;
  }
  return { x: x / idx.length, y: y / idx.length, z: z / idx.length };
}

export function computeFingerStates(landmarks) {
  // Use a 2D width proxy to reduce Z-noise. This improves stability for ring/pinky.
  const handWidth = Math.max(1e-6, dist2(landmarks[5], landmarks[17]));

  const thumb = thumbStateByScore(landmarks, handWidth);
  const index = fingerExtendedByScore(landmarks, handWidth, 5, 6, 7, 8, 160, 1.14, 0.05);
  const middle = fingerExtendedByScore(landmarks, handWidth, 9, 10, 11, 12, 160, 1.16, 0.05);
  const ring = fingerExtendedByScore(landmarks, handWidth, 13, 14, 15, 16, 150, 1.08, 0.045);
  const pinky = fingerExtendedByScore(landmarks, handWidth, 17, 18, 19, 20, 150, 1.05, 0.04);

  /** @type {Record<string, {extended:boolean, folded:boolean, state:"EXTENDED"|"FOLDED"|"BENT", score:number, debug:any}>} */
  const states = {
    thumb: {
      extended: thumb.extended,
      folded: thumb.folded,
      state: fingerStateFrom(thumb.extended, thumb.folded),
      score: thumb.score,
      debug: thumb.debug,
    },
    index: {
      extended: index.extended,
      folded: index.folded,
      state: fingerStateFrom(index.extended, index.folded),
      score: index.score,
      debug: index.debug,
    },
    middle: {
      extended: middle.extended,
      folded: middle.folded,
      state: fingerStateFrom(middle.extended, middle.folded),
      score: middle.score,
      debug: middle.debug,
    },
    ring: {
      extended: ring.extended,
      folded: ring.folded,
      state: fingerStateFrom(ring.extended, ring.folded),
      score: ring.score,
      debug: ring.debug,
    },
    pinky: {
      extended: pinky.extended,
      folded: pinky.folded,
      state: fingerStateFrom(pinky.extended, pinky.folded),
      score: pinky.score,
      debug: pinky.debug,
    },
  };

  let mask = 0;
  if (states.thumb.state === STATE.EXTENDED) mask |= 1;
  if (states.index.state === STATE.EXTENDED) mask |= 2;
  if (states.middle.state === STATE.EXTENDED) mask |= 4;
  if (states.ring.state === STATE.EXTENDED) mask |= 8;
  if (states.pinky.state === STATE.EXTENDED) mask |= 16;

  return { states, mask, handWidth };
}

export function computePinch(landmarks, handWidth) {
  const thumbTip = landmarks?.[4];
  const indexTip = landmarks?.[8];
  const indexMcp = landmarks?.[5];
  const thumbMcp = landmarks?.[2];
  if (!thumbTip || !indexTip || !indexMcp || !thumbMcp) {
    return {
      isPinching: false,
      pinchDist: Infinity,
      pinchRatio: Infinity,
      thresholdRatio: 0,
      baseLen: 0,
    };
  }

  // Pinch is best detected in 2D; Z is noisy and often delays recognition.
  // Use a finger-length-based normalization for faster/more consistent detection across scales.
  const pinchDist = dist2(thumbTip, indexTip);
  const indexLen = dist2(indexMcp, indexTip);
  const thumbLen = dist2(thumbMcp, thumbTip);
  const baseLen = Math.max(1e-6, Math.min(indexLen, thumbLen, handWidth));
  const pinchRatio = pinchDist / baseLen;

  const thresholdRatio = 0.8;
  return {
    isPinching: pinchRatio < thresholdRatio,
    pinchDist,
    pinchRatio,
    thresholdRatio,
    baseLen,
  };
}

export function maskToCode(mask) {
  const t = (mask & 1) ? "T" : "_";
  const i = (mask & 2) ? "I" : "_";
  const m = (mask & 4) ? "M" : "_";
  const r = (mask & 8) ? "R" : "_";
  const p = (mask & 16) ? "P" : "_";
  return `${t}${i}${m}${r}${p}`;
}

export function classifyGesture(landmarks) {
  const { states, mask, handWidth } = computeFingerStates(landmarks);
  const pinch = computePinch(landmarks, handWidth);

  const allFour = (mask & 30) === 30; // index+middle+ring+pinky
  const allFive = mask === 31;
  const onlyIndex = mask === 2;
  const onlyMiddle = mask === 4;
  const onlyRing = mask === 8;
  const onlyPinky = mask === 16;
  const onlyThumb = mask === 1;
  const none = mask === 0;
  const vSign = mask === 6;
  const threeFingers = mask === 14; // index+middle+ring
  const fourFingers = mask === 30; // no thumb
  const rock = mask === 18; // index+pinky
  const thumbIndex = mask === 3;
  const thumbIndexMiddle = mask === 7;

  let gesture = "COMBO";
  let label = `Combo ${maskToCode(mask)}`;

  if (pinch.isPinching) {
    gesture = "PINCH";
    label = "Pinch (thumb + index)";
  } else if (none) {
    gesture = "FIST";
    label = "Fist";
  } else if (allFive) {
    gesture = "OPEN";
    label = "Open (five fingers)";
  } else if (fourFingers) {
    gesture = "OPEN";
    label = "Open (four fingers)";
  } else if (onlyIndex) {
    gesture = "INDEX_ONLY";
    label = "Index only";
  } else if (onlyThumb) {
    gesture = "THUMB_ONLY";
    label = "Thumb only";
  } else if (vSign) {
    gesture = "V_SIGN";
    label = "V (index + middle)";
  } else if (threeFingers) {
    gesture = "THREE";
    label = "Three fingers (index + middle + ring)";
  } else if (rock) {
    gesture = "ROCK";
    label = "Rock (index + pinky)";
  } else if (thumbIndex) {
    gesture = "L_SHAPE";
    label = "L (thumb + index)";
  } else if (thumbIndexMiddle) {
    gesture = "THUMB_INDEX_MIDDLE";
    label = "Three fingers (thumb + index + middle)";
  } else if (onlyMiddle) {
    gesture = "MIDDLE_ONLY";
    label = "Middle only";
  } else if (onlyRing) {
    gesture = "RING_ONLY";
    label = "Ring only";
  } else if (onlyPinky) {
    gesture = "PINKY_ONLY";
    label = "Pinky only";
  }

  return { gesture, label, states, mask, code: maskToCode(mask), pinch, handWidth, allFour };
}

export function fingerStatesToChinese(states) {
  const map = (s) => (s.state === "EXTENDED" ? "Extended" : s.state === "FOLDED" ? "Folded" : "Bent");
  return {
    thumb: map(states.thumb),
    index: map(states.index),
    middle: map(states.middle),
    ring: map(states.ring),
    pinky: map(states.pinky),
  };
}

export function extendedListChinese(states) {
  const out = [];
  if (states.thumb.state === "EXTENDED") out.push("Thumb");
  if (states.index.state === "EXTENDED") out.push("Index");
  if (states.middle.state === "EXTENDED") out.push("Middle");
  if (states.ring.state === "EXTENDED") out.push("Ring");
  if (states.pinky.state === "EXTENDED") out.push("Pinky");
  return out.length ? out.join("+") : "None";
}
