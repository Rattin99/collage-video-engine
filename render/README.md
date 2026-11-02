# Render presets

Usage: `npm run <preset> -- <entry-point> <composition-id> <output-path>`

Example:

```bash
npm run render:final -- src/index.ts ep01-cold-open out/ep01-cold-open.mov
```

| Script | Use case |
|---|---|
| `render:preview` | Half-res, low concurrency, fast H.264. Quick checks while iterating. |
| `render:final` | Full-res ProRes 422 HQ. No alpha. Editor-ready. |
| `render:final-h264` | Full-res H.264 via NVENC (if available). Quick final for full-frame segments. |
| `render:alpha` | Full-res ProRes 4444 with alpha. Overlay segments. |
| `render:alpha-webm` | Full-res WebM VP9 with alpha. Alternative to ProRes 4444. |

All presets default to 1080p/30fps (set per composition in `src/compositions/`).
Start `--concurrency` low (2-4) — RAM, not the GPU, is the bottleneck on this machine.

## Ink / plotter clips (`plotter-clip`)

Turns any image or video under `public/` into a hand-drawn pen-plotter clip
(cross-hatching, engraving, wave lines). Effect code lives in `src/effects/plotter/`.

```bash
# still image -> 6s "living drawing" that plots itself on over 2.5s
npm run render:final-h264 -- src/index.ts plotter-clip out/nietzsche.mp4 --props='{"src":"assets/images/nietzsche.jpg","preset":"collage","drawOnSeconds":2.5}'

# video -> same length as the source, audio kept
npm run render:final-h264 -- src/index.ts plotter-clip out/crowd-ink.mp4 --props='{"src":"assets/video/crowd.mp4","preset":"daVinciSepia","drawOnSeconds":0}'

# ink only on transparent background, for overlay segments
npm run render:alpha -- src/index.ts plotter-clip out/ink-overlay.mov --props='{"src":"assets/images/nietzsche.jpg","params":{"transparentPaper":true}}'
```

Props: `src`, `preset` (`inkCrossHatch` `collage` `daVinciSepia` `engraving` `waveLines` `chalkboard`),
`params` (any field of `PlotterParams` in `src/effects/plotter/presets.ts`), `seed`, `boil`
(new strokes every N frames, 0 = static), `drawOnSeconds`, `durationInSeconds`, `width`/`height`
(e.g. 1080×1920 for Shorts), `muted`. On Windows `cmd`, put the JSON in a file and pass `--props=props.json`.

Inside your own compositions, use the components directly:

```tsx
import { PlotterImage, PlotterVideo } from "../effects/plotter";

<PlotterVideo src={staticFile("assets/video/crowd.mp4")} preset="collage" seed="ep01-crowd" />
<PlotterImage src={staticFile("assets/images/nietzsche.jpg")} preset="engraving" reveal={progress} />
```

Each frame is re-hatched in the browser, so it renders slower than a plain video layer (about 1-1.5 s per
frame per tab in testing). Keep `--concurrency` at 2-3.
For quick looks pass `resolutionScale={0.5}` to the component or use `render:preview`.

## Sketch clips and Retro FX (`sketch-clip`)

Motion sketches from the `Sketches` repo (`file:../Sketches` dependency, `npm install` links it), optionally put
through Retro FX. Components live in `src/effects/sketch/`: `<SketchClip>` and `<RetroLayer>`.
Runnable clip ids: `fire mouth spacetime recursive-squares samsara her arima tarkata mesh walker`
(the full list with modes and params is in `Sketches/docs/sketches.md`; an unknown or still/tool id throws and lists them).

On Windows PowerShell, inline JSON loses its quotes, so put props in a file (`mesh.json`) and pass `--props=mesh.json`.

```bash
# plain clip, 1080p
npm run render:final-h264 -- src/index.ts sketch-clip out/mesh.mp4 --props=mesh.json
#   mesh.json: {"id":"mesh","mode":"breathe","durationInSeconds":6}

# transparent overlay (ProRes 4444 with alpha)
npm run render:alpha -- src/index.ts sketch-clip out/mesh-overlay.mov --props=mesh-alpha.json
#   mesh-alpha.json: {"id":"mesh","mode":"shimmer","transparent":true}

# vertical, looping twice
#   {"id":"mouth","mode":"wave","cycles":2,"width":1080,"height":1920}

# clip through Retro FX (preset is a key of PRESETS in Sketches artworks/retro-fx/params.js)
#   {"id":"mesh","retro":{"preset":"Mac Atkinson","params":{"driftX":30}}}

# Retro FX on an image or video from public/
#   {"retro":{"preset":"Mac Atkinson","source":{"type":"image","src":"assets/images/nietzsche.jpg"}}}
#   {"retro":{"preset":"Mac Atkinson","source":{"type":"video","src":"assets/video/crowd.mp4"}}}
```

Props: `id`, `mode`, `seed` (defaults to the id), `params`, `transparent`, `cycles`, `revealSeconds`, `boilRate`,
`durationInSeconds` (defaults to the clip's own), `width`/`height`, `retro: { preset, params, seed, source, allowHistory }`.

In your own compositions:

```tsx
import { RetroLayer, SketchClip } from "../effects/sketch";

<SketchClip id="mesh" mode="breathe" transparent />
<RetroLayer source={{ type: "clip", id: "walker", mode: "trails" }} preset="Mac Atkinson" />
<RetroLayer source={{ type: "video", src: staticFile("assets/video/crowd.mp4") }} preset="Terminal ASCII" />
```

Notes:

- Frames are deterministic, so any `--concurrency` gives identical pixels for clips, and for Retro FX on images and clips
  (verified frame by frame). Step clips (`walker`, `fire`, `her`, `arima`) and Retro error diffusion (stability > 0, e.g. `Mac Atkinson`) replay
  from the last frame or from 0 when a tab jumps, so a late still costs more than an early one.
- Retro FX on a **video** cannot replay history, because frames come from the video decoder out of order. Error diffusion with
  stability > 0 is forced to stability 0 (a console warning appears once per tab). Pass `"allowHistory": true` and render with
  `--concurrency=1` to keep it. ASCII, ordered dither and stability 0 are order independent.
- Each `RetroLayer` owns one WebGL context, destroyed on unmount. Chrome allows about 16 live contexts per page, so keep few layers on screen at once.
- OffthreadVideo may log harmless `EncodingError: The source image cannot be decoded` warnings. Output is unaffected.
- Speed: roughly 0.3 s per 1080p frame for clips and Retro FX (includes startup on short renders).
