// Formatting helpers — extracted from app.js

export function fmt2(n) {
  return String(Math.floor(n)).padStart(2, "0");
}

export function fmtTimeMs(tsMs) {
  const d = new Date(tsMs);
  return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}:${fmt2(d.getSeconds())}.${String(
    d.getMilliseconds(),
  ).padStart(3, "0")}`;
}

export function fmt(n, digits = 1) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function shortId(id) {
  if (!id) return "";
  return id.length <= 6 ? id : `${id.slice(0, 3)}…${id.slice(-3)}`;
}

export function gestureLabel(code) {
  switch (code) {
    case "PINCH":
      return "Pinch (thumb + index)";
    case "FIST":
      return "Fist";
    case "OPEN":
      return "Open";
    case "INDEX_ONLY":
      return "Index only";
    case "THUMB_ONLY":
      return "Thumb only";
    case "V_SIGN":
      return "V (index + middle)";
    case "ROCK":
      return "Rock (index + pinky)";
    case "THREE":
      return "Three fingers";
    case "L_SHAPE":
      return "L (thumb + index)";
    case "THUMB_INDEX_MIDDLE":
      return "Three fingers (thumb + index + middle)";
    case "MIDDLE_ONLY":
      return "Middle only";
    case "RING_ONLY":
      return "Ring only";
    case "PINKY_ONLY":
      return "Pinky only";
    case "COMBO":
      return "Combo";
    case "NONE":
      return "No hand";
    default:
      return "Other";
  }
}
