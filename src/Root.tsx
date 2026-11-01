import "./index.css";
import { MyComposition } from "./Composition";
import { PlotterClipComposition } from "./compositions/PlotterClip";
import { SketchClipComposition } from "./compositions/SketchClip";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <PlotterClipComposition />
      <SketchClipComposition />
    </>
  );
};
