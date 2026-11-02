import "./index.css";
import { MyComposition } from "./Composition";
import { PlotterClipComposition } from "./compositions/PlotterClip";
import { SketchClipComposition } from "./compositions/SketchClip";
import { SketchEffectComposition } from "./compositions/SketchEffect";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <PlotterClipComposition />
      <SketchClipComposition />
      <SketchEffectComposition />
    </>
  );
};
