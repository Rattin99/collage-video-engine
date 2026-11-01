import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, OffthreadVideo, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { createRetroRunner, type RetroRunner, type RetroSource } from "sketches/clips/retro";
import { useClipRunner, type ClipOptions } from "./useClipRunner";

export type RetroSourceProp =
  | { type: "image"; src: string }
  | { type: "video"; src: string; muted?: boolean; trimBefore?: number; trimAfter?: number }
  | ({ type: "clip" } & ClipOptions);

export type RetroLayerProps = {
  source: RetroSourceProp;
  /** Overrides over the preset, over the Retro FX defaults. */
  params?: Record<string, unknown>;
  /** A key of PRESETS in Sketches artworks/retro-fx/params.js, e.g. "Mac Atkinson". */
  preset?: string;
  seed?: string | number;
  /**
   * Video sources only. Error diffusion with stability > 0 depends on frame order, which parallel
   * tabs break, so video forces stability to 0 unless this is true. Only use it with --concurrency=1.
   */
  allowHistory?: boolean;
  style?: React.CSSProperties;
  className?: string;
};

const resolveSrc = (src: string) =>
  /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src.replace(/^\/?(public\/)?/, ""));

const dims = (f: CanvasImageSource) => {
  const s = f as any;
  return {
    srcW: s.naturalWidth || s.videoWidth || s.displayWidth || s.width,
    srcH: s.naturalHeight || s.videoHeight || s.displayHeight || s.height,
  } as { srcW: number; srcH: number };
};

/**
 * Retro FX (ASCII / dither / CRT) applied to an image, a video or a Sketches clip.
 * Each RetroLayer owns one WebGL context, destroyed on unmount. Chrome allows about 16 live
 * contexts per page, so keep the count of layers on screen at once well below that.
 *
 * @example
 * <RetroLayer source={{ type: "clip", id: "mesh" }} preset="Mac Atkinson" />
 */
export const RetroLayer: React.FC<RetroLayerProps> = ({
  source,
  params,
  preset,
  seed,
  allowHistory,
  style,
  className,
}) => {
  const frame = useCurrentFrame();
  // Clip sources render through a hidden runner whose canvas is the Retro source.
  const clipHook = useClipRunner(source.type === "clip" ? source : null);
  const { width, height, fps, duration } = clipHook;
  const clipRunner = clipHook.runner;
  const releaseClip = clipHook.release;

  const boxRef = useRef<HTMLDivElement>(null);
  const retroRef = useRef<RetroRunner | null>(null);
  const [retroGen, setRetroGen] = useState(0);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const lastVideo = useRef<CanvasImageSource | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const heldRef = useRef<number | null>(null);

  // Hold the render until the first frame has been drawn.
  useLayoutEffect(() => {
    heldRef.current = delayRender("RetroLayer first frame", { timeoutInMilliseconds: 120000 });
    return () => {
      if (heldRef.current !== null) continueRender(heldRef.current);
      heldRef.current = null;
    };
  }, []);
  const firstDrawn = useCallback(() => {
    if (heldRef.current !== null) {
      continueRender(heldRef.current);
      heldRef.current = null;
    }
    releaseClip();
  }, [releaseClip]);

  // Image source.
  const imageSrc = source.type === "image" ? source.src : null;
  useLayoutEffect(() => {
    if (imageSrc === null) return;
    let cancelled = false;
    const h = delayRender(`RetroLayer image ${imageSrc}`, { timeoutInMilliseconds: 60000 });
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setImage(img);
      continueRender(h);
    };
    img.onerror = () => {
      continueRender(h);
      throw new Error(`RetroLayer: could not load image "${imageSrc}"`);
    };
    img.src = resolveSrc(imageSrc);
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  const runnerKey = JSON.stringify({
    type: source.type,
    preset,
    params,
    seed: seed ?? "retro",
    allowHistory: !!allowHistory,
    width,
    height,
    fps,
    duration,
  });

  // One WebGL context per runner: a fresh canvas each time, since a lost context cannot be reused.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    Object.assign(canvas.style, { width: "100%", height: "100%", display: "block" });
    box.appendChild(canvas);
    const runner = createRetroRunner(canvas, {
      params,
      preset,
      seed: seed ?? "retro",
      fps,
      duration,
      replayable: source.type !== "video",
      allowHistory,
    });
    retroRef.current = runner;
    setRetroGen((n) => n + 1);
    return () => {
      runner.destroy();
      canvas.remove();
      retroRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runnerKey]);

  // Image and clip sources draw from here. Video draws from onVideoFrame.
  useLayoutEffect(() => {
    const retro = retroRef.current;
    if (!retro || source.type === "video") return;
    let getSource: (i: number) => RetroSource;
    if (source.type === "image") {
      if (!image) return;
      getSource = () => ({ source: image, ...dims(image) });
    } else {
      if (!clipRunner) return;
      getSource = (i) => {
        clipRunner.renderFrame(i);
        return { source: clipRunner.canvas, srcW: clipRunner.canvas.width, srcH: clipRunner.canvas.height };
      };
    }
    retro.render(frame, getSource);
    firstDrawn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, retroGen, image, clipRunner]);

  const onVideoFrame = useCallback(
    (f: CanvasImageSource) => {
      lastVideo.current = f;
      const retro = retroRef.current;
      if (!retro) return;
      retro.render(frameRef.current, () => ({ source: f, ...dims(f) }));
      firstDrawn();
    },
    [firstDrawn],
  );

  // Re-draw the last decoded video frame after the runner is rebuilt (Studio edits).
  useLayoutEffect(() => {
    if (source.type === "video" && lastVideo.current && retroRef.current) onVideoFrame(lastVideo.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retroGen]);

  return (
    <AbsoluteFill className={className} style={style}>
      <div ref={boxRef} style={{ position: "absolute", inset: 0 }} />
      {source.type === "clip" ? <div ref={clipHook.hostRef} style={{ display: "none" }} /> : null}
      {source.type === "video" ? (
        <OffthreadVideo
          src={resolveSrc(source.src)}
          muted={source.muted}
          trimBefore={source.trimBefore}
          trimAfter={source.trimAfter}
          crossOrigin="anonymous"
          onVideoFrame={onVideoFrame}
          style={{ opacity: 0, position: "absolute", width: "100%", height: "100%" }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
