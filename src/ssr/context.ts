import type { Props } from '../shared/types';
import { SSRDataMissingError } from './errors';

export type SSRData = Record<string, unknown>;

export type SSRContext = {
  url: string;
  seed: number;
  data?: SSRData;
  params?: Record<string, string>;
  signal?: AbortSignal;
};

// Optional: scoped access for sink-based streaming SSR (sync and stack-scoped)
let current: SSRContext | null = null;

export function getSSRContext(): SSRContext | null {
  return current;
}

export function withSSRContext<T>(ctx: SSRContext, fn: () => T): T {
  const prev = current;
  current = ctx;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

// --- Render-only context (compatibility from previous ssrContext.ts) ---------
// Deterministic seeded RNG used only inside the render context
export class SeededRNG {
  private seed: number;

  constructor(seed = 12345) {
    this.seed = seed | 0;
  }

  reset(seed = 12345) {
    this.seed = seed | 0;
  }

  // Simple LCG, stable and deterministic
  random(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

/** Context passed through a single render pass */
export type RenderContext = {
  seed: number;
  rng: SeededRNG;
};

/** Create a RenderContext from a seed */
export function createRenderContext(seed = 12345): RenderContext {
  const rng = new SeededRNG(seed);
  return { seed, rng };
}

// Lightweight module-level current context for SSR detection (render-only)
let currentSSRContext: RenderContext | null = null;

export function getCurrentSSRContext(): RenderContext | null {
  return currentSSRContext;
}

export function runWithSSRContext<T>(ctx: RenderContext, fn: () => T): T {
  const prev = currentSSRContext;
  currentSSRContext = ctx;
  try {
    return fn();
  } finally {
    currentSSRContext = prev;
  }
}

export { SSRDataMissingError };

// Deterministic RNG (explicitly used by components via ctx if desired)
export function makeSeededRandom(seed: number) {
  // LCG
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Helper: merge params into props for route handlers if needed
export function mergeRouteProps(
  props: Props | undefined,
  params?: Record<string, string>
): Props {
  if (!params) return (props ?? {}) as Props;
  return { ...(props ?? {}), ...params } as Props;
}
