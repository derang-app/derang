// Cover scanning: straighten a photographed cover (perspective warp from four
// corners to a flat rectangle) and gently fix light and colour. Pure pixel math on
// RGBA buffers, so it runs on the phone, offline, and is testable without a canvas.

export interface Point {
  x: number;
  y: number;
}

/** Corners in image pixels, clockwise from top-left. */
export type Quad = [Point, Point, Point, Point];

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Starting corners when nothing better is known: a centred rectangle. */
export function defaultQuad(width: number, height: number, inset = 0.1): Quad {
  const x0 = width * inset;
  const y0 = height * inset;
  const x1 = width * (1 - inset);
  const y1 = height * (1 - inset);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function cross(o: Point, a: Point, b: Point) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** A usable cover outline: convex, same winding all round, and not tiny. */
export function isUsableQuad(q: Quad, width: number, height: number) {
  const turns = q.map((p, i) => cross(p, q[(i + 1) % 4], q[(i + 2) % 4]));
  const convex = turns.every((t) => t > 0) || turns.every((t) => t < 0);
  const area = Math.abs(q.reduce((s, p, i) => s + (p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y), 0)) / 2;
  return convex && area >= width * height * 0.05;
}

/** Output size of the flattened cover: its edge lengths, capped on the long side. */
export function outputSize(q: Quad, max: number) {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Projective map from the unit square onto the quad (Heckbert's closed form):
 * (0,0)→q0, (1,0)→q1, (1,1)→q2, (0,1)→q3.
 */
export function squareToQuad(q: Quad) {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  return (u: number, v: number): Point => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / w, y: (d * u + e * v + p0.y) / w };
  };
}

/** Flatten the quad from `src` into a width×height image (bilinear sampling). */
export function warp(src: Pixels, q: Quad, width: number, height: number): Pixels {
  const map = squareToQuad(q);
  const out = new Uint8ClampedArray(width * height * 4);
  const sw = src.width;
  const sh = src.height;
  const s = src.data;
  for (let j = 0; j < height; j++) {
    const v = (j + 0.5) / height;
    for (let i = 0; i < width; i++) {
      const p = map((i + 0.5) / width, v);
      const x = Math.min(Math.max(p.x - 0.5, 0), sw - 1);
      const y = Math.min(Math.max(p.y - 0.5, 0), sh - 1);
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (j * width + i) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * fx;
        const bottom = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * fx;
        out[o + c] = top + (bottom - top) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width, height };
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function percentile(hist: Uint32Array, total: number, p: number) {
  const target = total * p;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += hist[i];
    if (sum >= target) return i;
  }
  return 255;
}

/**
 * Gentle auto-fix, in place: removes a lamp's colour cast (only when the brightest
 * area is near-neutral, i.e. probably white paper, so colourful covers keep their
 * colours) and stretches contrast a little. Never extreme.
 */
export function enhance(px: Pixels): Pixels {
  const d = px.data;
  const n = d.length / 4;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(lum(d[i], d[i + 1], d[i + 2]))]++;

  // White balance from the brightest 3% of pixels.
  const bright = percentile(hist, n, 0.97);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (lum(d[i], d[i + 1], d[i + 2]) >= bright) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      count++;
    }
  }
  const gains = [1, 1, 1];
  if (count) {
    const avg = [r / count, g / count, b / count];
    const mean = (avg[0] + avg[1] + avg[2]) / 3;
    const spread = Math.max(...avg) / Math.max(1, Math.min(...avg));
    // Most of the way, not all: a cream-coloured cover should stay a little cream.
    if (mean > 140 && spread < 1.35)
      for (let c = 0; c < 3; c++) gains[c] = Math.min(1.25, Math.max(0.8, 1 + (mean / Math.max(1, avg[c]) - 1) * 0.7));
  }

  // Contrast: map the 0.5–99.5% luminance range to full scale, but never stretch hard.
  const lo = Math.min(percentile(hist, n, 0.005), 40);
  const hi = Math.max(percentile(hist, n, 0.995), 215);
  const scale = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] * gains[c] - lo) * scale;
  }
  return px;
}

/** Light unsharp mask (3×3), to undo the softness of resampling. */
export function sharpen(px: Pixels, amount = 0.35): Pixels {
  const { width: w, height: h, data: d } = px;
  const src = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += src[o + (dy * w + dx) * 4 + c];
        const v = src[o + c];
        d[o + c] = v + (v - sum / 9) * amount;
      }
    }
  }
  return px;
}
