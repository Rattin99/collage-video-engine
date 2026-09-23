import { random } from "remotion";

/**
 * Deterministic helpers on top of Remotion's seeded `random(seed)`.
 * Never use Math.random() — renders must be reproducible.
 */

export const randomInRange = (
  seed: string,
  min: number,
  max: number,
): number => min + random(seed) * (max - min);

export const randomSign = (seed: string): 1 | -1 =>
  random(seed) < 0.5 ? -1 : 1;

/** A landing rotation in degrees, magnitude between min and max, random sign. */
export const randomRotation = (
  seed: string,
  min = 2,
  max = 5,
): number =>
  randomSign(`${seed}-sign`) * randomInRange(`${seed}-mag`, min, max);
