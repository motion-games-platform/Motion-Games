// 动漫手 2D 骨骼绑定（方案 C）：用 MediaPipe 21 个关键点驱动切图零件。
//
// 手指零件：指向正右方（+x），近端关节在左边缘 → 每段用「位置 + 角度 + 长度」跟随骨骼。
// 手掌零件：指向正右方（+x），手腕在左（上=拇指端，下=小指端）。
//   手掌用「最小二乘仿射」拟合 6 个关键点（手腕 / 拇指根 / 四指根），
//   这样四指根都能大致接上手掌，且手翻转时手掌会倾斜/缩放。

import { mediaUrl } from "~/utils/media";

// 手部零件素材走 CDN 子域（public/storage/pinch-pop-bubbles → storage.swayjoy.com/pinch-pop-bubbles），见 app/utils/media.js
const BASE = mediaUrl("/storage/pinch-pop-bubbles");

// 手指零件统一参数
const FINGER = { pivotX: 0, pivotY: 0.5, refAngle: 0, refAxis: "width" };

// 手掌：参考点在 plam.webp 里的位置（图片尺寸的分数 0~1）→ 对应的 landmark。
// 若某处对不齐，微调对应坐标即可。
const PALM = {
  src: `${BASE}/plam.webp`,
  refs: [
    { x: 0.1, y: 0.5, lm: 0 }, // 手腕
    { x: 0.9, y: 0.1, lm: 2 }, // 拇指根
    { x: 0.98, y: 0.2, lm: 5 }, // 食指根
    { x: 0.98, y: 0.5, lm: 9 }, // 中指根
    { x: 0.98, y: 0.7, lm: 13 }, // 无名指根
    { x: 0.98, y: 0.9, lm: 17 }, // 小指根
  ],
};

// 拇指根与手掌之间留一点空隙（把拇指根参考点往手掌中心收一点）
const THUMB_GAP = 0.04;

// 数组顺序即绘制层级：四指先画，拇指最后（手掌在 draw 里最先画）
const PART_DEFS = [
  { name: "index-proximal", a: 5, b: 6, ...FINGER },
  { name: "index-middle", a: 6, b: 7, ...FINGER },
  { name: "index-distal", a: 7, b: 8, ...FINGER },
  { name: "middle-proximal", a: 9, b: 10, ...FINGER },
  { name: "middle-middle", a: 10, b: 11, ...FINGER },
  { name: "middle-distal", a: 11, b: 12, ...FINGER },
  { name: "ring-proximal", a: 13, b: 14, ...FINGER },
  { name: "ring-middle", a: 14, b: 15, ...FINGER },
  { name: "ring-distal", a: 15, b: 16, ...FINGER },
  { name: "pinky-proximal", a: 17, b: 18, ...FINGER },
  { name: "pinky-middle", a: 18, b: 19, ...FINGER },
  { name: "pinky-distal", a: 19, b: 20, ...FINGER },
  { name: "thumb-proximal", a: 2, b: 3, ...FINGER },
  { name: "thumb-distal", a: 3, b: 4, ...FINGER },
];

export class HandRig {
  constructor() {
    this.palm = { ...PALM, img: null };
    this.parts = PART_DEFS.map((d) => ({ ...d, src: `${BASE}/${d.name}.webp`, img: null }));
    if (typeof window !== "undefined") this._load();
  }

  _load() {
    const pi = new Image();
    pi.src = this.palm.src;
    this.palm.img = pi;
    for (const p of this.parts) {
      const img = new Image();
      img.src = p.src;
      p.img = img;
    }
  }

  get ready() {
    const palmOk = this.palm.img && this.palm.img.complete && this.palm.img.naturalWidth > 0;
    return palmOk && this.parts.every((p) => p.img && p.img.complete && p.img.naturalWidth > 0);
  }

  /**
   * 在「未镜像」的画布上下文中绘制动漫手。
   * @param {CanvasRenderingContext2D} ctx 2D 上下文
   * @param {Array<{x:number,y:number}>} pts 21 个关键点的「镜像后」画布像素坐标
   */
  draw(ctx, pts) {
    if (!this.ready || !pts || pts.length < 21) return;
    this._drawPalm(ctx, pts);
    for (const p of this.parts) this._drawPart(ctx, p, pts);
  }

  _drawPalm(ctx, pts) {
    const img = this.palm.img;
    if (!img || !img.complete || !img.naturalWidth) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const src = this.palm.refs.map((r) => ({ x: r.x * w, y: r.y * h }));
    const dst = this.palm.refs.map((r) => {
      if (r.lm === 2) {
        // 拇指根：往手掌中心（中指根）收一点，留空隙
        const t = pts[2];
        const m = pts[9];
        if (!t || !m) return null;
        return { x: t.x + (m.x - t.x) * THUMB_GAP, y: t.y + (m.y - t.y) * THUMB_GAP };
      }
      return pts[r.lm];
    });
    if (dst.some((d) => !d)) return;

    const mat = leastSquaresAffine(src, dst);
    if (!mat) return;

    ctx.save();
    ctx.transform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  _drawPart(ctx, p, pts) {
    const img = p.img;
    const a = pts[p.a];
    const b = pts[p.b];
    if (!a || !b) return;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;

    const angle = Math.atan2(dy, dx);
    const refLen = p.refAxis === "width" ? img.naturalWidth : img.naturalHeight;
    const scale = len / refLen;
    const px = p.pivotX * img.naturalWidth;
    const py = p.pivotY * img.naturalHeight;

    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(angle - p.refAngle);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -px, -py);
    ctx.restore();
  }
}

// 最小二乘仿射：给定 N 组点对应（N≥3），求仿射矩阵使总误差最小。
// 返回 {a,b,c,d,e,f}：x' = a*x + c*y + e，y' = b*x + d*y + f
function leastSquaresAffine(src, dst) {
  const n = src.length;
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0;
  let dxsx = 0, dxsy = 0, dx = 0, dysx = 0, dysy = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i].x, y = src[i].y, X = dst[i].x, Y = dst[i].y;
    sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y;
    dxsx += X * x; dxsy += X * y; dx += X;
    dysx += Y * x; dysy += Y * y; dy += Y;
  }

  const A = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const solX = solve3(A, [dxsx, dxsy, dx]);
  const solY = solve3(A, [dysx, dysy, dy]);
  if (!solX || !solY) return null;

  const [a, c, e] = solX;
  const [b, d, f] = solY;
  return { a, b, c, d, e, f };
}

// 解 3x3 线性方程组（高斯消元 + 列主元）
function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-9) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 4; c++) M[r][c] -= f * M[col][c];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}
