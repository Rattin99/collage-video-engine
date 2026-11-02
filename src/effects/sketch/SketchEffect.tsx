import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, OffthreadVideo, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { getEffect, listEffects } from "sketches/effects";
import { createEffectRunner, type EffectRunner } from "sketches/effects/runtime";

export type EffectSourceProp =
  | { type: "image"; src: string }
  | { type: "video"; src: string; muted?: boolean; trimBefore?: number; trimAfter?: number };

export type SketchEffectProps = {
  /** An effect id from the Sketches effect library, e.g. "patchwork" or "halftone-dots". */
  id: string;
  mode?: string;
  /** Defaults to the effect id. */
  seed?: string | number;
  params?: Record<string, unknown>;
  /** Integer loops per duration, for modes that loop. */
  cycles?: number;
  /** Boil re-rolls per second, for modes that boil. */
  boilRate?: number;
  /** Seconds. Defaults to the length of the enclosing Sequence or composition. */
  duration?: number;
  /** The picture to apply the effect to. Omitted: the library's built-in test pattern. */
  source?: EffectSourceProp;
  fit?: "cover" | "contain";
  style?: React.CSSProperties;
  className?: string;
};

const resolveSrc = (src: string) =>
  /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src.replace(/^\/?(public\/)?/, ""));

/** Throws a clear error unless `id` names an effect. */
export const assertEffect = (id: string) => {
  const effect = getEffect(id);
  if (effect) return effect;
  throw new Error(`SketchEffect: "${id}" is not a known effect. Ids: ${listEffects().map((e) => e.id).join(", ")}.`);
};

/**
 * An effect from the Sketches effect library applied to an image or a video, drawn for the current frame.
 * Frames are deterministic, so parallel tabs and any render order give identical pixels.
 *
 * @example
 * <SketchEffect id="patchwork" mode="both" source={{ type: "image", src: "art/horses.jpg" }} />
 */
export const SketchEffect: React.FC<SketchEffectProps> = ({
  id,
  mode,
  seed,
  params,
  cycles,
  boilRate,
  duration,
  source,
  fit,
  style,
  className,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const effect = assertEffect(id);
  const seconds = duration ?? durationInFrames / fps;

  const boxRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef<number | null>(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const lastVideo = useRef<CanvasImageSource | null>(null);
  const [runner, setRunner] = useState<EffectRunner | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const release = useCallback(() => {
    if (heldRef.current !== null) {
      continueRender(heldRef.current);
      heldRef.current = null;
    }
  }, []);

  // Image source: decoded once.
  const imageSrc = source?.type === "image" ? source.src : null;
  useLayoutEffect(() => {
    if (imageSrc === null) {
      setImage(null);
      return;
    }
    let cancelled = false;
    const h = delayRender(`SketchEffect image ${imageSrc}`, { timeoutInMilliseconds: 60000 });
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setImage(img);
      continueRender(h);
    };
    img.onerror = () => {
      continueRender(h);
      throw new Error(`SketchEffect: could not load image "${imageSrc}"`);
    };
    img.src = resolveSrc(imageSrc);
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  const ready = imageSrc === null || image !== null;
  const key = JSON.stringify({ id, mode, seed: seed ?? id, params, cycles, boilRate, seconds, width, height, fps, fit, imageSrc });

  // One runner per option set. It owns a canvas, destroyed on unmount.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !ready) return;
    let cancelled = false;
    let made: EffectRunner | null = null;
    heldRef.current = delayRender(`SketchEffect "${id}" setup`, { timeoutInMilliseconds: 120000 });
    createEffectRunner(effect, null, {
      width,
      height,
      fps,
      duration: seconds,
      seed: seed ?? id,
      mode,
      params,
      cycles,
      boilRate,
      fit,
      input: image,
    })
      .then((r) => {
        if (cancelled) {
          r.destroy();
          return;
        }
        made = r;
        Object.assign(r.canvas.style, { width: "100%", height: "100%", display: "block" });
        box.appendChild(r.canvas);
        setRunner(r);
      })
      .catch((err) => {
        release();
        // Surface setup failures as render errors instead of a silent timeout.
        setRunner(() => {
          throw err;
        });
      });
    return () => {
      cancelled = true;
      made?.canvas.remove();
      made?.destroy();
      setRunner(null);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  // Image and test-pattern sources draw from here. Video draws from onVideoFrame.
  useLayoutEffect(() => {
    if (!runner || source?.type === "video") return;
    runner.renderFrame(frame);
    release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, runner]);

  const onVideoFrame = useCallback(
    (f: CanvasImageSource) => {
      lastVideo.current = f;
      if (!runner) return;
      runner.renderFrame(frameRef.current, f);
      release();
    },
    [runner, release],
  );

  // Re-draw the last decoded video frame after the runner is rebuilt (Studio edits).
  useLayoutEffect(() => {
    if (source?.type === "video" && lastVideo.current && runner) onVideoFrame(lastVideo.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner]);

  return (
    <AbsoluteFill className={className} style={style}>
      <div ref={boxRef} style={{ position: "absolute", inset: 0 }} />
      {source?.type === "video" ? (
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
