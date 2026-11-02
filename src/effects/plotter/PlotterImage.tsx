import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDelayRender } from "remotion";
import { usePlotterCanvas, type PlotterCommonProps } from "./usePlotterCanvas";

export type PlotterImageProps = PlotterCommonProps & {
  /** `staticFile("assets/images/x.jpg")` or a CORS-enabled URL. */
  src: string;
};

/**
 * A still image redrawn as pen-plotter ink. With `boil` > 0 the strokes re-jitter every
 * N frames so the drawing feels alive; animate `reveal` 0→1 to plot it on.
 *
 * @example
 * <PlotterImage src={staticFile("assets/images/nietzsche.jpg")} preset="collage" seed="ep01" />
 */
export const PlotterImage: React.FC<PlotterImageProps> = ({ src, ...props }) => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`PlotterImage: loading ${src}`));
  const released = useRef(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const { canvasRef, draw, canvasStyle, deps } = usePlotterCanvas(props);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      setImg(image);
    };
    image.onerror = () => {
      if (!cancelled) cancelRender(new Error(`PlotterImage: could not load ${src}`));
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, cancelRender]);

  useLayoutEffect(() => {
    if (!img) return;
    draw(img);
    if (!released.current) {
      released.current = true;
      continueRender(handle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, draw, continueRender, handle, ...deps]);

  return <canvas ref={canvasRef} className={props.className} style={canvasStyle} />;
};
