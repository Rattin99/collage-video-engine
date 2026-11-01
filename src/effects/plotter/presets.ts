import { PALETTE } from "../../motion/rules";

/**
 * Every knob of the ink look. "px" values are relative to a 1200px-long frame and
 * scale with the output size, so a preset looks the same at 1080p and 4K.
 */
export type PlotterParams = {
  /** Plotting style */
  style: "crosshatch" | "hatch" | "waves";
  /** Gap between hatch lines (px) */
  spacing: number;
  /** 1-4 hatch directions, each switching on at a darker tone */
  layers: number;
  /** Rotation of all hatch directions (deg) */
  angle: number;
  /** Average dash length (px) */
  strokeLength: number;
  /** Random pen-lift gap between dashes on the same line (px) */
  strokeGap: number;

  /** Pen width (px) */
  thickness: number;
  /** 0-1, random thin/thick strokes */
  pressure: number;
  /** Smooth sideways drift along each stroke (px) */
  wobble: number;
  inkColor: string;
  inkOpacity: number;
  paperColor: string;
  /** Draw ink only, on a transparent background (for alpha / overlay renders) */
  transparentPaper: boolean;
  /** 0-1 paper texture */
  grain: number;
  /** 0-1 darkened, aged edges */
  vignette: number;

  /** 0-3 tilt/offset/bow per dash */
  roughness: number;
  /** Dashes run past their ends (px) */
  overshoot: number;
  /** Soft ink halo under strokes (px) */
  bleed: number;

  /** Waviness of hatch lines (px); main control in "waves" style */
  waveAmp: number;
  waveFreq: number;
  /** Lower = more ink. Scales every layer's darkness threshold */
  darkThreshold: number;
  contrast: number;
  /** -0.5..0.5 */
  brightness: number;
  /** Blur before hatching so noise doesn't shatter strokes (px) */
  smoothing: number;
  /** Ink the light areas instead of the dark ones (chalkboard looks) */
  invert: boolean;

  /** How the source fits the frame */
  fit: "contain" | "cover";
  /** Paper border around the source (px) */
  margin: number;
};

export const DEFAULT_PARAMS: PlotterParams = {
  style: "crosshatch",
  spacing: 6,
  layers: 4,
  angle: 0,
  strokeLength: 22,
  strokeGap: 2.5,
  thickness: 1.3,
  pressure: 0.35,
  wobble: 0.8,
  inkColor: "#000064",
  inkOpacity: 0.8,
  paperColor: "#f5f0e8",
  transparentPaper: false,
  grain: 0.2,
  vignette: 0,
  roughness: 1,
  overshoot: 4,
  bleed: 1.5,
  waveAmp: 7,
  waveFreq: 0.06,
  darkThreshold: 0.9,
  contrast: 1.1,
  brightness: 0,
  smoothing: 2,
  invert: false,
  fit: "cover",
  margin: 0,
};

export const PRESETS = {
  /** The brik.space-style navy ballpoint cross-hatch */
  inkCrossHatch: {},
  /** Uses the channel palette from motion/rules.ts */
  collage: {
    inkColor: PALETTE.ink,
    paperColor: PALETTE.paper,
    inkOpacity: 0.85,
    grain: 0.35,
    vignette: 0.3,
    layers: 4,
    roughness: 1.15,
  },
  daVinciSepia: {
    angle: 45,
    layers: 3,
    spacing: 5,
    strokeLength: 22,
    strokeGap: 4,
    thickness: 1.1,
    pressure: 0.5,
    wobble: 1,
    inkColor: "#5a2e12",
    inkOpacity: 0.75,
    paperColor: "#e9d8b4",
    grain: 0.5,
    vignette: 0.6,
    roughness: 1.3,
    overshoot: 5,
    bleed: 2,
    darkThreshold: 0.85,
    contrast: 1.2,
  },
  engraving: {
    style: "hatch",
    angle: -30,
    layers: 4,
    spacing: 4.5,
    strokeLength: 140,
    strokeGap: 1,
    thickness: 1,
    pressure: 0.2,
    wobble: 0.25,
    inkColor: "#16120e",
    inkOpacity: 0.9,
    paperColor: "#f1e9d8",
    grain: 0.3,
    vignette: 0.25,
    roughness: 0.2,
    overshoot: 1,
    bleed: 0.6,
    waveAmp: 4,
    waveFreq: 0.03,
    darkThreshold: 0.95,
    contrast: 1.25,
  },
  waveLines: {
    style: "waves",
    spacing: 6,
    thickness: 1.2,
    pressure: 0.2,
    wobble: 0.4,
    inkColor: "#111111",
    inkOpacity: 0.9,
    paperColor: "#f4f1ea",
    roughness: 0.3,
    bleed: 0.8,
    waveAmp: 8,
    waveFreq: 0.09,
    darkThreshold: 0.95,
    contrast: 1.2,
  },
  chalkboard: {
    inkColor: "#f2efe6",
    inkOpacity: 0.75,
    paperColor: "#1d201f",
    grain: 0.45,
    vignette: 0.4,
    roughness: 1.4,
    overshoot: 5,
    bleed: 1.2,
    invert: true,
    contrast: 1.15,
  },
} satisfies Record<string, Partial<PlotterParams>>;

export type PlotterPreset = keyof typeof PRESETS;

export const resolveParams = (
  preset: PlotterPreset = "inkCrossHatch",
  overrides: Partial<PlotterParams> = {},
): PlotterParams => ({
  ...DEFAULT_PARAMS,
  ...(PRESETS[preset] as Partial<PlotterParams>),
  ...overrides,
});
