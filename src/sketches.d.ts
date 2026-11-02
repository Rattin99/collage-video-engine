// Types for the plain-JS Sketches package (file:../Sketches). Only the parts the adapter uses.

declare module "sketches/clips" {
  export type ClipMode = {
    id: string;
    label: string;
    description: string;
    loops: boolean;
    boil: boolean;
    reveal: boolean;
  };
  export type ClipParamSpec = { default: unknown; min?: number; max?: number; step?: number; label?: string; type?: string };
  export type Clip = {
    id: string;
    name: string;
    description: string;
    tags: string[];
    kind: "time" | "step" | "still" | "tool" | "pending";
    runnable: boolean;
    defaultDuration?: number;
    modes?: ClipMode[];
    params?: Record<string, ClipParamSpec>;
  };
  export const CLIPS: Clip[];
  export function getClip(id: string): Clip | undefined;
  export function listClips(filter?: { runnable?: boolean }): Clip[];
}

declare module "sketches/clips/runtime" {
  import type { Clip } from "sketches/clips";
  export type ClipRunnerOptions = {
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
    seed?: string | number;
    mode?: string;
    params?: Record<string, unknown>;
    transparent?: boolean;
    cycles?: number;
    revealSeconds?: number | null;
    boilRate?: number;
  };
  export type ClipRunner = {
    renderFrame(frame: number): void;
    canvas: HTMLCanvasElement;
    totalFrames: number;
    destroy(): void;
  };
  export function hashSeed(seed: string | number): number;
  export function createClipRunner(clip: Clip, host: HTMLElement, options?: ClipRunnerOptions): Promise<ClipRunner>;
}

declare module "sketches/clips/retro" {
  export type RetroSource = { source: CanvasImageSource; srcW: number; srcH: number };
  export type RetroRunnerOptions = {
    params?: Record<string, unknown>;
    preset?: string;
    seed?: string | number;
    fps?: number;
    duration?: number;
    replayable?: boolean;
    allowHistory?: boolean;
  };
  export type RetroRunner = {
    params: Record<string, unknown>;
    render(frame: number, getSource: (i: number) => RetroSource): void;
    destroy(): void;
  };
  export function isHistoryDependent(params: Record<string, unknown>): boolean;
  export function createRetroRunner(canvas: HTMLCanvasElement, options?: RetroRunnerOptions): RetroRunner;
}

declare module "sketches/effects" {
  export type EffectMode = {
    id: string;
    label: string;
    description: string;
    loops: boolean;
    boil: boolean;
    reveal: boolean;
    still: boolean;
  };
  export type EffectParamSpec = { default: unknown; min?: number; max?: number; step?: number; label?: string; type?: string };
  export type Effect = {
    id: string;
    name: string;
    description: string;
    tags: string[];
    kind: "effect";
    defaultDuration: number;
    alpha: "keep" | "moves";
    modes: EffectMode[];
    liveMode: string;
    params: Record<string, EffectParamSpec>;
  };
  export const EFFECTS: Effect[];
  export function getEffect(id: string): Effect | undefined;
  export function listEffects(): Effect[];
}

declare module "sketches/effects/runtime" {
  import type { Effect } from "sketches/effects";
  export type EffectRunnerOptions = {
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
    seed?: string | number;
    mode?: string;
    params?: Record<string, unknown>;
    cycles?: number;
    boilRate?: number;
    input?: string | CanvasImageSource | null;
    fit?: "cover" | "contain";
  };
  export type EffectRunner = {
    renderFrame(frame: number, input?: CanvasImageSource): void;
    setInput(input: CanvasImageSource | null): void;
    canvas: HTMLCanvasElement;
    totalFrames: number;
    destroy(): void;
  };
  export function createEffectRunner(effect: Effect, host: HTMLElement | null, options?: EffectRunnerOptions): Promise<EffectRunner>;
}

declare module "sketches/retro-presets" {
  export const PRESETS: Record<string, Record<string, unknown>>;
}
