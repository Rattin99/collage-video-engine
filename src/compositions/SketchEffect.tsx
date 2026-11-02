import { AbsoluteFill, Composition, type CalculateMetadataFunction } from "remotion";
import { SketchEffect, type EffectSourceProp } from "../effects/sketch";
import { getEffect } from "sketches/effects";
import { FPS, HEIGHT, WIDTH } from "../motion/rules";

/**
 * Sketch effect generator: an effect from the Sketches effect library (Patchwork, halftone, dither ...)
 * applied to an image or a video from public/.
 *
 *   npx remotion still src/index.ts sketch-effect out/patchwork.png --props=props.json --frame=60
 *   npm run render:final-h264 -- src/index.ts sketch-effect out/patchwork.mp4 --props=props.json
 *
 * All props are JSON so they can come from --props, a props file, or the Studio panel.
 */
export type SketchEffectCompositionProps = {
  /** Effect id from Sketches (patchwork, halftone-dots, dither-1bit, ...). */
  id?: string;
  mode?: string;
  /** Defaults to the id. */
  seed?: string;
  /** Effect params (see the effect's definition in Sketches artworks/<id>/effect.js). */
  params?: Record<string, unknown>;
  cycles?: number;
  boilRate?: number;
  /** Length. Defaults to the effect's own default duration. */
  durationInSeconds?: number;
  /** Output size, defaults to motion/rules (1920×1080). Use 1080×1920 for Shorts. */
  width?: number;
  height?: number;
  /** Picture to apply the effect to, from public/ or a URL. Omitted: the built-in test pattern. */
  source?: EffectSourceProp;
  fit?: "cover" | "contain";
};

const calculateMetadata: CalculateMetadataFunction<SketchEffectCompositionProps> = ({ props }) => {
  const seconds = props.durationInSeconds ?? (props.id ? getEffect(props.id)?.defaultDuration : undefined) ?? 6;
  return {
    durationInFrames: Math.max(1, Math.round(seconds * FPS)),
    width: props.width ?? WIDTH,
    height: props.height ?? HEIGHT,
  };
};

export const SketchEffectScene: React.FC<SketchEffectCompositionProps> = ({ id, durationInSeconds, ...rest }) => (
  <AbsoluteFill>
    <SketchEffect id={id ?? "patchwork"} duration={durationInSeconds} {...rest} />
  </AbsoluteFill>
);

export const SketchEffectComposition: React.FC = () => (
  <Composition
    id="sketch-effect"
    component={SketchEffectScene}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    durationInFrames={FPS * 8}
    calculateMetadata={calculateMetadata}
    defaultProps={{
      id: "patchwork",
      mode: "both",
    }}
  />
);
