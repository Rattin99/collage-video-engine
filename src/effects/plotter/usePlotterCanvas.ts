import { useCallback, useMemo, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { hashSeed, renderPlot, toneFromSource } from "./engine";
import { resolveParams, type PlotterParams, type PlotterPreset } from "./presets";

export type PlotterCommonProps = {
  /** Named look from presets.ts. Default "inkCrossHatch". */
  preset?: PlotterPreset;
  /** Per-shot overrides on top of the preset, e.g. `{ inkColor: "#5a2e12", layers: 3 }`. */
  params?: Partial<PlotterParams>;
  /** Same seed = same drawing. Use a shot name, e.g. "ep01-nietzsche". */
  seed?: string | number;
  /**
   * Redraw strokes every N frames for a hand-animated "boil". 0 = static ink.
   * 2 = "on twos" (15 redraws/s at 30fps). Default 2.
   */
  boil?: number;
  /** 0..1 share of strokes drawn — animate with interpolate() for a plot-on effect. */
  reveal?: number;
  /** Canvas resolution. Defaults to the composition size. */
  width?: number;
  height?: number;
  /** Render at a fraction of width/height (CSS still fills the box). Useful for previews. */
  resolutionScale?: number;
  style?: React.CSSProperties;
  className?: string;
};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Pixel size of whatever Remotion hands us (img, video element, VideoFrame, bitmap). */
export const sourceSize = (src: CanvasImageSource): [number, number] => {
  const s = src as Partial<
    HTMLImageElement & HTMLVideoElement & VideoFrame & ImageBitmap
  >;
  if (s.naturalWidth) return [s.naturalWidth, s.naturalHeight ?? 0];
  if (s.videoWidth) return [s.videoWidth, s.videoHeight ?? 0];
  if (s.displayWidth) return [s.displayWidth, s.displayHeight ?? 0];
  return [Number(s.width) || 0, Number(s.height) || 0];
};

/**
 * Shared core for PlotterImage / PlotterVideo: resolves params, owns the canvas and
 * returns a `draw(source)` that re-hatches the given frame for the current Remotion frame.
 * Tone maps are cached per source + tone settings, so still images only re-hatch on boil.
 */
export const usePlotterCanvas = (props: PlotterCommonProps) => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const scale = props.resolutionScale ?? 1;
  const W = even((props.width ?? config.width) * scale);
  const H = even((props.height ?? config.height) * scale);

  const params = useMemo(
    () => resolveParams(props.preset, props.params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.preset, JSON.stringify(props.params ?? {})],
  );
  const seed = useMemo(() => hashSeed(props.seed ?? "plotter"), [props.seed]);
  const boil = props.boil ?? 2;
  const reveal = props.reveal ?? 1;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const toneCache = useRef<{ source: CanvasImageSource | null; key: string; tone: Float32Array | null }>({
    source: null,
    key: "",
    tone: null,
  });

  // Latest values for callbacks fired outside React's render (OffthreadVideo onVideoFrame).
  const latest = useRef({ frame, W, H, params, seed, boil, reveal });
  latest.current = { frame, W, H, params, seed, boil, reveal };

  const draw = useCallback((source: CanvasImageSource, sourceChanged = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { frame: f, W: w, H: h, params: p, seed: s, boil: b, reveal: r } = latest.current;
    const [sw, sh] = sourceSize(source);
    if (!sw || !sh) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const key = [w, h, sw, sh, p.fit, p.margin, p.contrast, p.brightness, p.smoothing, p.invert].join("|");
    const cache = toneCache.current;
    if (sourceChanged || cache.source !== source || cache.key !== key || !cache.tone) {
      if (!scratchRef.current) scratchRef.current = document.createElement("canvas");
      cache.tone = toneFromSource(scratchRef.current, source, sw, sh, w, h, p);
      cache.source = source;
      cache.key = key;
    }
    renderPlot(ctx, cache.tone, w, h, p, {
      seed: s,
      boilStep: b > 0 ? Math.floor(f / b) : 0,
      reveal: r,
    });
  }, []);

  const canvasStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "block",
    ...props.style,
  };

  return { canvasRef, draw, canvasStyle, deps: [frame, W, H, params, seed, boil, reveal] as const };
};
