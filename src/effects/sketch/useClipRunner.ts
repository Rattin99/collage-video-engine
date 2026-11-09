import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender, useVideoConfig } from "remotion";
import { getClip, listClips } from "sketches/clips";
import { createClipRunner, type ClipRunner } from "sketches/clips/runtime";

export type ClipOptions = {
  /** A runnable clip id from the Sketches clip library, e.g. "mesh". */
  id: string;
  mode?: string;
  /** Defaults to the clip id. */
  seed?: string | number;
  params?: Record<string, unknown>;
  transparent?: boolean;
  /** Integer loops per duration, for modes that loop. */
  cycles?: number;
  /** Seconds a reveal takes. Defaults to 0.8 * duration. */
  revealSeconds?: number;
  /** Boil re-rolls per second, for modes that boil. */
  boilRate?: number;
  /** Seconds. Defaults to the length of the enclosing Sequence or composition. */
  duration?: number;
};

/** Throws a clear error unless `id` names a runnable clip. */
export const assertRunnableClip = (id: string) => {
  const clip = getClip(id);
  if (clip?.runnable) return clip;
  const runnable = listClips({ runnable: true })
    .map((c) => c.id)
    .join(", ");
  const why = clip ? `is a "${clip.kind}" clip and cannot be rendered` : "is not a known clip";
  throw new Error(`SketchClip: "${id}" ${why}. Runnable ids: ${runnable}.`);
};

/**
 * Owns a p5-backed clip runner inside a host div. Creates it under delayRender, rebuilds it when
 * the serialised options or the composition size change, and destroys it on unmount.
 * Pass null to do nothing (hooks cannot be conditional). The caller draws frames, then calls
 * `release()` once the first frame is on screen.
 */
export const useClipRunner = (options: ClipOptions | null) => {
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const duration = options?.duration ?? durationInFrames / fps;
  const clip = options ? assertRunnableClip(options.id) : null;
  const resolved = options
    ? {
        id: options.id,
        mode: options.mode,
        seed: options.seed ?? options.id,
        params: options.params ?? {},
        transparent: !!options.transparent,
        cycles: options.cycles,
        revealSeconds: options.revealSeconds,
        boilRate: options.boilRate,
        duration,
        width,
        height,
        fps,
      }
    : null;
  const key = JSON.stringify(resolved);

  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<number | null>(null);
  const [runner, setRunner] = useState<ClipRunner | null>(null);

  const release = useCallback(() => {
    if (handleRef.current !== null) {
      continueRender(handleRef.current);
      handleRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !clip || !resolved) return;
    let cancelled = false;
    let made: ClipRunner | null = null;
    handleRef.current = delayRender(`SketchClip "${resolved.id}" setup`, { timeoutInMilliseconds: 120000 });
    createClipRunner(clip, host, resolved)
      .then((r) => {
        if (cancelled) {
          r.destroy();
          return;
        }
        made = r;
        Object.assign(r.canvas.style, { width: "100%", height: "100%", display: "block" });
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
      made?.destroy();
      setRunner(null);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { hostRef, runner, release, width, height, fps, duration };
};
