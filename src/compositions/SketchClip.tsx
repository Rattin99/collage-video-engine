import { AbsoluteFill, Composition, type CalculateMetadataFunction } from "remotion";
import { RetroLayer, SketchClip, type RetroSourceProp } from "../effects/sketch";
import { getClip } from "sketches/clips";
import { FPS, HEIGHT, WIDTH } from "../motion/rules";

/**
 * Sketch clip generator: a motion sketch from the Sketches clip library, optionally put through Retro FX.
 *
 *   npm run render:final-h264 -- src/index.ts sketch-clip out/mesh.mp4 --props=props.json
 *
 * All props are JSON so they can come from --props, a props file, or the Studio panel.
 */
export type SketchClipCompositionProps = {
  /** Runnable clip id from Sketches (mesh, mouth, spacetime, ...). Not needed when retro.source is set. */
  id?: string;
  mode?: string;
  /** Defaults to the id. */
  seed?: string;
  /** Clip params (see the clip's definition in Sketches artworks/<id>/clip.js). */
  params?: Record<string, unknown>;
  /** No background, for overlays. Render with render:alpha. */
  transparent?: boolean;
  /** Integer loops per clip length, for looping modes. */
  cycles?: number;
  revealSeconds?: number;
  boilRate?: number;
  /** Clip length. Defaults to the clip's own default duration. */
  durationInSeconds?: number;
  /** Output size, defaults to motion/rules (1920×1080). Use 1080×1920 for Shorts. */
  width?: number;
  height?: number;
  /**
   * Run the result through Retro FX. `preset` is a key of PRESETS in Sketches artworks/retro-fx/params.js
   * (e.g. "Mac Atkinson"). By default the clip is the source; `source` swaps in an image or video from public/.
   * `allowHistory` keeps video error-diffusion stability, and needs --concurrency=1.
   */
  retro?: {
    preset?: string;
    params?: Record<string, unknown>;
    seed?: string;
    source?: Exclude<RetroSourceProp, { type: "clip" }>;
    allowHistory?: boolean;
  };
};

const calculateMetadata: CalculateMetadataFunction<SketchClipCompositionProps> = ({ props }) => {
  const seconds = props.durationInSeconds ?? (props.id ? getClip(props.id)?.defaultDuration : undefined) ?? 6;
  return {
    durationInFrames: Math.max(1, Math.round(seconds * FPS)),
    width: props.width ?? WIDTH,
    height: props.height ?? HEIGHT,
  };
};

export const SketchClipScene: React.FC<SketchClipCompositionProps> = (props) => {
  const { id, retro } = props;
  const clip = {
    id: id ?? "mesh",
    mode: props.mode,
    seed: props.seed,
    params: props.params,
    transparent: props.transparent,
    cycles: props.cycles,
    revealSeconds: props.revealSeconds,
    boilRate: props.boilRate,
  };
  return (
    <AbsoluteFill>
      {retro ? (
        <RetroLayer
          source={retro.source ?? { type: "clip", ...clip }}
          preset={retro.preset}
          params={retro.params}
          seed={retro.seed}
          allowHistory={retro.allowHistory}
        />
      ) : (
        <SketchClip {...clip} />
      )}
    </AbsoluteFill>
  );
};

export const SketchClipComposition: React.FC = () => (
  <Composition
    id="sketch-clip"
    component={SketchClipScene}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    durationInFrames={FPS * 6}
    calculateMetadata={calculateMetadata}
    defaultProps={{
      id: "mesh",
      mode: "breathe",
      transparent: false,
    }}
  />
);
