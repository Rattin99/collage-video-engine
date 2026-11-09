import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
import {
  AbsoluteFill,
  Composition,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { PlotterImage, PlotterVideo, type PlotterParams, type PlotterPreset } from "../effects/plotter";
import { FPS, HEIGHT, WIDTH } from "../motion/rules";

/**
 * One-off clip generator: any image or video in, pen-plotter ink clip out.
 *
 *   npm run render:final-h264 -- src/index.ts plotter-clip out/nietzsche.mp4 \
 *     --props='{"src":"assets/images/nietzsche.jpg","preset":"collage","drawOnSeconds":2.5}'
 *
 * All props are JSON so they can come from --props, a props file, or the Studio panel.
 */
export type PlotterClipProps = {
  /** Path under public/ (e.g. "assets/video/crowd.mp4") or a full URL. */
  src: string;
  /** "auto" picks by file extension. */
  kind?: "auto" | "image" | "video";
  preset?: PlotterPreset;
  params?: Partial<PlotterParams>;
  seed?: string;
  /** Redraw strokes every N frames (0 = static). */
  boil?: number;
  /** Plot the drawing on over this many seconds at the start (0 = off). */
  drawOnSeconds?: number;
  /** Clip length. Images default to 6s, videos to the source length. */
  durationInSeconds?: number;
  /** Output size, defaults to motion/rules (1920×1080). Use 1080×1920 for Shorts. */
  width?: number;
  height?: number;
  muted?: boolean;
};

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;

const resolveSrc = (src: string) =>
  /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src.replace(/^\/?(public\/)?/, ""));

const isVideo = (p: PlotterClipProps) =>
  p.kind === "video" || ((p.kind ?? "auto") === "auto" && VIDEO_EXT.test(p.src.split("?")[0]));

const calculateMetadata: CalculateMetadataFunction<PlotterClipProps> = async ({ props }) => {
  let seconds = props.durationInSeconds ?? 6;
  if (isVideo(props) && props.durationInSeconds === undefined) {
    const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(resolveSrc(props.src)) });
    try {
      seconds = await input.computeDuration();
    } finally {
      input.dispose();
    }
  }
  return {
    durationInFrames: Math.max(1, Math.round(seconds * FPS)),
    width: props.width ?? WIDTH,
    height: props.height ?? HEIGHT,
  };
};

export const PlotterClip: React.FC<PlotterClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drawOnFrames = (props.drawOnSeconds ?? 0) * fps;
  const reveal =
    drawOnFrames > 0
      ? interpolate(frame, [0, drawOnFrames], [0, 1], {
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        })
      : 1;
  const common = {
    preset: props.preset,
    params: props.params,
    seed: props.seed ?? props.src,
    boil: props.boil,
    reveal,
  };
  const src = resolveSrc(props.src);

  return (
    <AbsoluteFill>
      {isVideo(props) ? (
        <PlotterVideo src={src} muted={props.muted} {...common} />
      ) : (
        <PlotterImage src={src} {...common} />
      )}
    </AbsoluteFill>
  );
};

export const PlotterClipComposition: React.FC = () => (
  <Composition
    id="plotter-clip"
    component={PlotterClip}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    durationInFrames={FPS * 6}
    calculateMetadata={calculateMetadata}
    defaultProps={{
      src: "assets/images/nietzsche.jpg",
      kind: "auto",
      preset: "collage",
      params: { fit: "contain", margin: 40 },
      seed: "plotter-demo",
      boil: 2,
      drawOnSeconds: 2.5,
    }}
  />
);
