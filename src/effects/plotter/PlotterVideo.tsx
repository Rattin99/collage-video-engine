import { useCallback, useLayoutEffect, useRef } from "react";
import { AbsoluteFill, OffthreadVideo, type VolumeProp } from "remotion";
import { usePlotterCanvas, type PlotterCommonProps } from "./usePlotterCanvas";

export type PlotterVideoProps = PlotterCommonProps & {
  /** `staticFile("assets/video/x.mp4")` or a CORS-enabled URL. */
  src: string;
  muted?: boolean;
  volume?: VolumeProp;
  playbackRate?: number;
  /** Frames to cut from the start / end of the source (Remotion trim props). */
  trimBefore?: number;
  trimAfter?: number;
};

/**
 * A video redrawn as pen-plotter ink, frame by frame. The source plays invisibly through
 * OffthreadVideo (so audio, trimming and frame-accurate renders all work as usual) and
 * each decoded frame is re-hatched onto a canvas.
 *
 * @example
 * <PlotterVideo src={staticFile("assets/video/crowd.mp4")} preset="daVinciSepia" boil={2} />
 */
export const PlotterVideo: React.FC<PlotterVideoProps> = ({
  src,
  muted,
  volume,
  playbackRate,
  trimBefore,
  trimAfter,
  ...props
}) => {
  const { canvasRef, draw, canvasStyle, deps } = usePlotterCanvas(props);
  const lastFrame = useRef<CanvasImageSource | null>(null);

  const onVideoFrame = useCallback(
    (frame: CanvasImageSource) => {
      lastFrame.current = frame;
      draw(frame, true);
    },
    [draw],
  );

  // Re-hatch the last decoded frame when props change without a new video frame
  // (e.g. tweaking params in the Studio while paused).
  useLayoutEffect(() => {
    if (lastFrame.current) draw(lastFrame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, ...deps]);

  return (
    <AbsoluteFill className={props.className}>
      <OffthreadVideo
        src={src}
        muted={muted}
        volume={volume}
        playbackRate={playbackRate}
        trimBefore={trimBefore}
        trimAfter={trimAfter}
        crossOrigin="anonymous"
        onVideoFrame={onVideoFrame}
        style={{ opacity: 0, position: "absolute", width: "100%", height: "100%" }}
      />
      <canvas ref={canvasRef} style={{ ...canvasStyle, position: "absolute", inset: 0 }} />
    </AbsoluteFill>
  );
};
