/**
 * Pen-plotter ink engine: image pixels -> darkness map -> hand-drawn strokes -> canvas.
 *
 * TypeScript port of `tools/hatching.js` from the Sketches repo, kept framework-free so
 * the React wrappers (PlotterImage / PlotterVideo) stay thin.
 *
 * How the look is built:
 *  1. Tonal layers — each hatch layer switches on above its own darkness threshold, so
 *     highlights stay paper, midtones get one direction, shadows get 3-4 crossed directions.
 *  2. Broken strokes — every hatch line is walked through the tone map and cut into short
 *     dashes wherever the tone changes or a random stroke length runs out.
 *  3. Hand imperfection — overshoot, slight tilt, bow, wobble and pen pressure per dash;
 *     ink is multiplied onto paper so crossings darken, and a blurred under-pass bleeds.
 *
 * Deterministic: all randomness comes from seeded mulberry32 (never Math.random), so
 * parallel Remotion render tabs produce identical frames.
 * All "px" params are relative to a 1200px-long canvas (see `unitFor`), so a look holds
 * at preview scale, 1080p and 4K.
 */
import type { PlotterParams } from "./presets";

const TAU = Math.PI * 2;

export type Rect = { x: number; y: number; w: number; h: number };

export type Stroke = {
  layer: number;
  /** pen pressure bucket 0..2 */
  w: number;
  /** flat polyline [x0, y0, x1, y1, ...] */
  pts: Float32Array;
};

export type StrokeSet = { strokes: Stroke[]; layers: number };

export const unitFor = (width: number, height: number): number =>
  Math.max(width, height) / 1200;

export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Turns any string/number seed (e.g. "ep01-nietzsche") into a 32-bit integer. */
export const hashSeed = (seed: string | number): number => {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const hash1 = (i: number, seed: number): number => {
  let h = Math.imul(i ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/** Smooth 1D value noise in -1..1. */
const noise1 = (x: number, seed: number): number => {
  const i = Math.floor(x);
  const f = x - i;
  const t = f * f * (3 - 2 * f);
  const a = hash1(i, seed);
  const b = hash1(i + 1, seed);
  return (a + (b - a) * t) * 2 - 1;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------
// Placement + tone map
// ---------------------------------------------------------------------------

/**
 * Where the source lands on a W×H canvas. `draw` is the scaled source rect, `box` the
 * margin-inset area it's clipped to, `mask` the part that may receive ink.
 */
export const placeSource = (
  srcW: number,
  srcH: number,
  W: number,
  H: number,
  params: PlotterParams,
  unit: number,
): { box: Rect; draw: Rect; mask: Rect } => {
  const m = Math.min(params.margin * unit, Math.min(W, H) * 0.45);
  const box = { x: m, y: m, w: W - 2 * m, h: H - 2 * m };
  const s =
    params.fit === "cover"
      ? Math.max(box.w / srcW, box.h / srcH)
      : Math.min(box.w / srcW, box.h / srcH);
  const dw = srcW * s;
  const dh = srcH * s;
  const draw = {
    x: box.x + (box.w - dw) / 2,
    y: box.y + (box.h - dh) / 2,
    w: dw,
    h: dh,
  };
  const x0 = Math.max(box.x, draw.x);
  const y0 = Math.max(box.y, draw.y);
  const x1 = Math.min(box.x + box.w, draw.x + draw.w);
  const y1 = Math.min(box.y + box.h, draw.y + draw.h);
  return { box, draw, mask: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
};

/** In-place separable box blur, keeps noisy pixels from shattering strokes. */
const boxBlur = (buf: Float32Array, w: number, h: number, r: number) => {
  const tmp = new Float32Array(buf.length);
  const size = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += buf[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / size;
      acc +=
        buf[row + Math.min(w - 1, x + r + 1)] - buf[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      buf[y * w + x] = acc / size;
      acc +=
        tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
};

/** Darkness map: 0 = paper, 1 = full ink, -1 = outside the artwork. */
export const buildTone = (
  imageData: ImageData,
  mask: Rect,
  params: PlotterParams,
  unit: number,
): Float32Array => {
  const { width: W, height: H, data } = imageData;
  const lum = new Float32Array(W * H);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    lum[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255;
  }

  const x0 = Math.max(0, Math.floor(mask.x));
  const y0 = Math.max(0, Math.floor(mask.y));
  const x1 = Math.min(W, Math.ceil(mask.x + mask.w));
  const y1 = Math.min(H, Math.ceil(mask.y + mask.h));

  const radius = Math.round(params.smoothing * unit);
  if (radius > 0 && x1 > x0 && y1 > y0) {
    // Extend edge pixels outward so the blur doesn't pull paper-white into the frame edge.
    for (let y = 0; y < H; y++) {
      const sy = Math.min(y1 - 1, Math.max(y0, y));
      for (let x = 0; x < W; x++) {
        if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
        lum[y * W + x] = lum[sy * W + Math.min(x1 - 1, Math.max(x0, x))];
      }
    }
    boxBlur(lum, W, H, radius);
  }

  const tone = new Float32Array(W * H);
  for (let i = 0; i < tone.length; i++) tone[i] = -1;
  const { contrast, brightness, invert } = params;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      let l = clamp01((lum[i] - 0.5) * contrast + 0.5 + brightness);
      if (invert) l = 1 - l;
      tone[i] = 1 - l;
    }
  }
  return tone;
};

/**
 * Draws `source` onto a scratch canvas at W×H and returns its tone map.
 * Reuse the same scratch canvas across frames to avoid allocations.
 */
export const toneFromSource = (
  scratch: HTMLCanvasElement,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  W: number,
  H: number,
  params: PlotterParams,
): Float32Array => {
  const unit = unitFor(W, H);
  const { box, draw, mask } = placeSource(srcW, srcH, W, H, params, unit);
  scratch.width = W;
  scratch.height = H;
  const sctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("Plotter: 2D canvas unavailable");
  sctx.fillStyle = "#fff";
  sctx.fillRect(0, 0, W, H);
  sctx.save();
  sctx.beginPath();
  sctx.rect(box.x, box.y, box.w, box.h);
  sctx.clip();
  sctx.drawImage(source, draw.x, draw.y, draw.w, draw.h);
  sctx.restore();
  return buildTone(sctx.getImageData(0, 0, W, H), mask, params, unit);
};

// ---------------------------------------------------------------------------
// Stroke generation
// ---------------------------------------------------------------------------

const CROSS_ANGLES = [0, 55, -55, 90];
const STAGGER = [0, 0.5, 0.25, 0.75];

const layerThresholds = (count: number): number[] => {
  if (count === 1) return [0.3];
  const out: number[] = [];
  for (let k = 0; k < count; k++) out.push(0.14 + (0.8 - 0.14) * (k / (count - 1)));
  return out;
};

const pressureBucket = (rng: () => number, pressure: number): number => {
  if (pressure <= 0) return 1;
  const r = rng();
  return r < 0.33 ? 0 : r < 0.66 ? 1 : 2;
};

/**
 * @param seeds.struct  fixed per shot — line positions/phases
 * @param seeds.jitter  change it to "boil" — breaks, overshoot, wobble, pressure
 */
export const generateStrokes = (
  tone: Float32Array,
  W: number,
  H: number,
  params: PlotterParams,
  unit: number,
  seeds: { struct: number; jitter: number },
): StrokeSet => {
  const srng = mulberry32(seeds.struct);
  const jrng = mulberry32(seeds.jitter);
  return params.style === "waves"
    ? waveStrokes(tone, W, H, params, unit, srng, jrng)
    : hatchStrokes(tone, W, H, params, unit, srng, jrng);
};

type HatchCtx = {
  unit: number;
  spacing: number;
  waveAmp: number;
  waveFreq: number;
  cx: number;
  cy: number;
  jrng: () => number;
  roughness: number;
  overshoot: number;
  wobble: number;
  pressure: number;
  layer: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
};

const hatchStrokes = (
  tone: Float32Array,
  W: number,
  H: number,
  params: PlotterParams,
  unit: number,
  srng: () => number,
  jrng: () => number,
): StrokeSet => {
  const cross = params.style !== "hatch";
  const L = Math.max(1, Math.min(4, Math.round(params.layers)));
  const thresholds = layerThresholds(L);
  const spacing = Math.max(1.5, params.spacing * unit);
  const step = Math.max(1, unit * 1.5);
  const R = Math.hypot(W, H) / 2;
  const waveAmp = params.waveAmp * unit * 0.35;
  const waveFreq = params.waveFreq / unit;
  const strokeLen = Math.max(2, params.strokeLength * unit);
  const strokeGap = params.strokeGap * unit;
  const basePhase = srng();
  const strokes: Stroke[] = [];

  for (let k = 0; k < L; k++) {
    const deg = params.angle + (cross ? CROSS_ANGLES[k] : 0);
    const theta = (deg * Math.PI) / 180 + (cross ? (srng() - 0.5) * 0.06 : 0);
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const phase = cross ? srng() : (basePhase + STAGGER[k]) % 1;
    const thr = thresholds[k] * params.darkThreshold;
    const c: HatchCtx = {
      unit,
      spacing,
      waveAmp,
      waveFreq,
      cx: W / 2,
      cy: H / 2,
      jrng,
      roughness: params.roughness,
      overshoot: params.overshoot * unit,
      wobble: params.wobble * unit,
      pressure: params.pressure,
      layer: k,
      ux,
      uy,
      nx: -uy,
      ny: ux,
    };

    for (let o = -R + phase * spacing; o <= R; o += spacing) {
      const linePhase = srng() * TAU;
      let inStroke = false;
      let s0 = 0;
      let target = 0;
      let gapUntil = -Infinity;
      for (let s = -R; s <= R + step; s += step) {
        const off = o + waveAmp * Math.sin(waveFreq * s + linePhase);
        const x = c.cx + s * ux + off * c.nx;
        const y = c.cy + s * uy + off * c.ny;
        let d = -1;
        if (x >= 0 && y >= 0 && x < W && y < H && s <= R) d = tone[(y | 0) * W + (x | 0)];
        const on = d >= thr && s >= gapUntil;
        if (on && !inStroke) {
          inStroke = true;
          s0 = s;
          target = strokeLen * (0.5 + jrng());
        } else if (inStroke && (!on || s - s0 >= target)) {
          strokes.push(emitHatch(c, o, s0, s - step, linePhase));
          inStroke = false;
          if (on) gapUntil = s + strokeGap * jrng();
        }
      }
    }
  }
  return { strokes, layers: L };
};

/** Turns a straight run along a hatch line into a hand-drawn dash. */
const emitHatch = (
  c: HatchCtx,
  o: number,
  s0: number,
  s1: number,
  linePhase: number,
): Stroke => {
  const { jrng, unit, roughness } = c;
  const a = s0 - c.overshoot * jrng();
  const b = s1 + c.overshoot * jrng();
  const mid = (a + b) / 2;
  const len = Math.max(b - a, unit);
  const rot = (jrng() * 2 - 1) * roughness * 0.035;
  const shift = (jrng() * 2 - 1) * roughness * c.spacing * 0.15;
  const bow = (jrng() * 2 - 1) * roughness * Math.min(len * 0.05, c.spacing * 0.35);
  const nseed = (jrng() * 1e9) | 0;
  const cosr = Math.cos(rot);
  const sinr = Math.sin(rot);
  const n = Math.max(2, Math.ceil(len / (4 * unit)) + 1);
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const s = a + (b - a) * t;
    const along = s - mid;
    const tc = 2 * t - 1;
    const perp =
      shift +
      bow * (1 - tc * tc) +
      c.waveAmp * Math.sin(c.waveFreq * s + linePhase) +
      c.wobble * 1.2 * noise1((s / unit) * 0.05, nseed);
    const al = along * cosr - perp * sinr;
    const pp = along * sinr + perp * cosr;
    pts[i * 2] = c.cx + (mid + al) * c.ux + (o + pp) * c.nx;
    pts[i * 2 + 1] = c.cy + (mid + al) * c.uy + (o + pp) * c.ny;
  }
  return { layer: c.layer, w: pressureBucket(jrng, c.pressure), pts };
};

/** Horizontal lines whose wave amplitude and frequency grow with darkness. */
const waveStrokes = (
  tone: Float32Array,
  W: number,
  H: number,
  params: PlotterParams,
  unit: number,
  srng: () => number,
  jrng: () => number,
): StrokeSet => {
  const spacing = Math.max(2, params.spacing * unit * 1.4);
  const step = Math.max(1, unit * 1.5);
  const amp = params.waveAmp * unit;
  const freq = params.waveFreq / unit;
  const thr = 0.1 * params.darkThreshold;
  const wobble = params.wobble * unit;
  const strokes: Stroke[] = [];
  for (let y = srng() * spacing; y < H; y += spacing) {
    let phase = srng() * TAU;
    const nseed = (jrng() * 1e9) | 0;
    const tilt = (jrng() * 2 - 1) * params.roughness * 0.01;
    let pts: number[] = [];
    const flush = () => {
      if (pts.length >= 4) {
        strokes.push({
          layer: 0,
          w: pressureBucket(jrng, params.pressure),
          pts: Float32Array.from(pts),
        });
      }
      pts = [];
    };
    for (let x = 0; x < W; x += step) {
      const yi = y | 0;
      const d = yi >= 0 && yi < H ? tone[yi * W + (x | 0)] : -1;
      if (d < thr) {
        flush();
        continue;
      }
      const dd = clamp01((d - thr) / Math.max(0.05, params.darkThreshold - thr));
      phase += freq * step * (0.35 + 2.4 * dd);
      pts.push(
        x,
        y + x * tilt + amp * dd * Math.sin(phase) + wobble * noise1((x / unit) * 0.03, nseed),
      );
    }
    flush();
  }
  return { strokes, layers: 1 };
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const v = parseInt(h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/** Light ink on dark paper has to be screened instead of multiplied. */
const inkBlendMode = (params: PlotterParams): GlobalCompositeOperation =>
  !params.transparentPaper && luminance(params.inkColor) > luminance(params.paperColor)
    ? "screen"
    : "multiply";

const penWidths = (params: PlotterParams, unit: number): number[] => {
  const base = Math.max(0.3, params.thickness * unit);
  const v = params.pressure * 0.45;
  return [base * (1 - v), base, base * (1 + v)];
};

let grainTile: HTMLCanvasElement | null = null;
const getGrainTile = (): HTMLCanvasElement => {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  if (!g) return c;
  const img = g.createImageData(256, 256);
  const rng = mulberry32(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rng() + rng() + rng() - 1.5) * 90;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
};

export const drawPaper = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  params: PlotterParams,
) => {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);
  if (!params.transparentPaper) {
    ctx.fillStyle = params.paperColor;
    ctx.fillRect(0, 0, W, H);
    if (params.grain > 0) {
      const pattern = ctx.createPattern(getGrainTile(), "repeat");
      if (pattern) {
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = params.grain * 0.6;
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }
  ctx.restore();
};

/** Aged-paper edges, drawn last so ink and paper darken together. */
export const drawVignette = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  params: PlotterParams,
) => {
  if (params.vignette <= 0 || params.transparentPaper) return;
  ctx.save();
  const r = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(60,35,10,${params.vignette * 0.55})`);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
};

/**
 * One Path2D per (layer, pen width): strokes within a layer don't darken each other,
 * but crossing layers do — that's what makes cross-hatching read as darker.
 * `reveal` (0..1) draws only the first share of strokes, for a plotting-on animation.
 */
export const drawStrokes = (
  ctx: CanvasRenderingContext2D,
  set: StrokeSet,
  params: PlotterParams,
  unit: number,
  reveal = 1,
) => {
  const { strokes, layers } = set;
  const count = reveal >= 1 ? strokes.length : Math.floor(strokes.length * clamp01(reveal));
  const paths: Path2D[] = [];
  for (let i = 0; i < layers * 3; i++) paths.push(new Path2D());
  for (let i = 0; i < count; i++) {
    const { layer, w, pts } = strokes[i];
    const path = paths[layer * 3 + w];
    path.moveTo(pts[0], pts[1]);
    for (let j = 2; j < pts.length; j += 2) path.lineTo(pts[j], pts[j + 1]);
  }
  const widths = penWidths(params, unit);
  ctx.save();
  ctx.globalCompositeOperation = inkBlendMode(params);
  ctx.strokeStyle = params.inkColor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (params.bleed > 0) {
    ctx.filter = `blur(${(params.bleed * unit * 0.7).toFixed(2)}px)`;
    ctx.globalAlpha = params.inkOpacity * 0.22;
    paths.forEach((path, i) => {
      ctx.lineWidth = widths[i % 3] + params.bleed * unit * 1.2;
      ctx.stroke(path);
    });
    ctx.filter = "none";
  }
  ctx.globalAlpha = params.inkOpacity;
  paths.forEach((path, i) => {
    ctx.lineWidth = widths[i % 3];
    ctx.stroke(path);
  });
  ctx.restore();
};

/** Full frame: paper, ink, aged edges. */
export const renderPlot = (
  ctx: CanvasRenderingContext2D,
  tone: Float32Array,
  W: number,
  H: number,
  params: PlotterParams,
  opts: { seed: number; boilStep: number; reveal: number },
): StrokeSet => {
  const unit = unitFor(W, H);
  const set = generateStrokes(tone, W, H, params, unit, {
    struct: opts.seed,
    jitter: (opts.seed + opts.boilStep * 7919) >>> 0,
  });
  drawPaper(ctx, W, H, params);
  drawStrokes(ctx, set, params, unit, opts.reveal);
  drawVignette(ctx, W, H, params);
  return set;
};
