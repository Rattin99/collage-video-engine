import { useLayoutEffect } from "react";
import { useCurrentFrame } from "remotion";
import { useClipRunner, type ClipOptions } from "./useClipRunner";

export type SketchClipProps = ClipOptions & {
  style?: React.CSSProperties;
  className?: string;
};

/**
 * A sketch from the Sketches clip library, drawn for the current frame.
 * The canvas is composition-sized and fills the box. Frames are deterministic, so parallel
 * tabs and any render order give identical pixels.
 *
 * @example
 * <SketchClip id="mesh" mode="breathe" transparent />
 */
export const SketchClip: React.FC<SketchClipProps> = ({ style, className, ...options }) => {
  const frame = useCurrentFrame();
  const { hostRef, runner, release } = useClipRunner(options);

  useLayoutEffect(() => {
    if (!runner) return;
    runner.renderFrame(frame);
    release();
  }, [runner, frame, release]);

  return <div ref={hostRef} className={className} style={{ position: "absolute", inset: 0, ...style }} />;
};
