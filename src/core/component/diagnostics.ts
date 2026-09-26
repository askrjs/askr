/**
 * Development render diagnostics: a one-time warning per component instance
 * when a render takes longer than a threshold.
 */

import { logger } from '../../common/logger';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export interface RenderDiagnosticsOptions {
  /** Emit one warning per component instance when a render exceeds the threshold. */
  slowRenderWarnings?: boolean;
  /** Slow-render threshold in milliseconds. The default is 5. */
  slowRenderThresholdMs?: number;
}

let settings: Required<RenderDiagnosticsOptions> = {
  slowRenderWarnings: true,
  slowRenderThresholdMs: 5,
};

/** Configure render diagnostics; returns a function restoring the previous settings. */
export function configureRenderDiagnostics(
  options: RenderDiagnosticsOptions
): () => void {
  const threshold = options.slowRenderThresholdMs;
  if (
    threshold !== undefined &&
    (!Number.isFinite(threshold) || threshold < 0)
  ) {
    throw new TypeError(
      'configureRenderDiagnostics slowRenderThresholdMs must be a finite, non-negative number.'
    );
  }
  const previous = settings;
  settings = {
    slowRenderWarnings:
      options.slowRenderWarnings ?? previous.slowRenderWarnings,
    slowRenderThresholdMs: threshold ?? previous.slowRenderThresholdMs,
  };
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    settings = previous;
  };
}

const warned = new WeakSet<object>();

export function isTimingRenders(): boolean {
  return __ASKR_DEVELOPMENT_BUILD__ && settings.slowRenderWarnings;
}

export function reportRenderTime(
  instance: object,
  name: string,
  milliseconds: number
): void {
  if (milliseconds <= settings.slowRenderThresholdMs || warned.has(instance)) {
    return;
  }
  warned.add(instance);
  logger.warn(
    `[askr] Slow render detected in ${name}: ${milliseconds}ms. ` +
      'Consider optimizing component performance.'
  );
}
