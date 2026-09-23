/**
 * Art-direction constants. Change values here, not at call sites —
 * a "too busy" or "too mechanical" note should be fixable in this
 * file alone.
 */

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// At most this many layers may be animating at the same time.
export const MAX_MOVING_LAYERS = 3;

// Minimum stillness after any entrance finishes (a slow camera drift counts as still).
export const HOLD_SECONDS = 1.5;
export const HOLD_FRAMES = HOLD_SECONDS * FPS;

// Landing rotation applied to entrances, degrees, magnitude only (sign is randomized).
export const ENTRANCE_ROTATION_MIN_DEG = 2;
export const ENTRANCE_ROTATION_MAX_DEG = 5;

// Spring config for entrances: slight overshoot, never linear.
export const ENTRANCE_SPRING = {
  damping: 12,
  mass: 0.5,
  stiffness: 100,
};

// Slow push-in / pan range for Camera, as a fraction of scale over a scene.
export const CAMERA_SCALE_MIN = 1.03;
export const CAMERA_SCALE_MAX = 1.06;

export const PALETTE = {
  paper: "#EDE4D3",
  ink: "#2B2622",
  sepia: "#8B6F47",
  accent: "#B5502D",
} as const;

export const FONTS = {
  quote: "serif",
  label: "monospace",
  annotation: "cursive",
} as const;
