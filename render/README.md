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
