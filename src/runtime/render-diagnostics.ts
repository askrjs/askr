export interface RenderDiagnosticsOptions {
  /** Emit one warning per component instance when a render exceeds the threshold. */
  slowRenderWarnings?: boolean;
  /** Slow-render threshold in milliseconds. The default is 5. */
  slowRenderThresholdMs?: number;
}

type RenderDiagnosticsConfig = Required<RenderDiagnosticsOptions>;

const DEFAULT_RENDER_DIAGNOSTICS: RenderDiagnosticsConfig = {
  slowRenderWarnings: true,
  slowRenderThresholdMs: 5,
};

let renderDiagnostics = DEFAULT_RENDER_DIAGNOSTICS;

/**
 * Configure development render diagnostics and return a function that restores
 * the previous configuration. Component counters and timing remain enabled
 * when warning output is disabled.
 */
export function configureRenderDiagnostics(
  options: RenderDiagnosticsOptions
): () => void {
  if (
    options.slowRenderThresholdMs !== undefined &&
    (!Number.isFinite(options.slowRenderThresholdMs) ||
      options.slowRenderThresholdMs < 0)
  ) {
    throw new TypeError(
      'configureRenderDiagnostics slowRenderThresholdMs must be a finite, non-negative number.'
    );
  }

  const previous = renderDiagnostics;
  renderDiagnostics = {
    slowRenderWarnings:
      options.slowRenderWarnings ?? previous.slowRenderWarnings,
    slowRenderThresholdMs:
      options.slowRenderThresholdMs ?? previous.slowRenderThresholdMs,
  };

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (renderDiagnostics === previous) return;
    renderDiagnostics = previous;
  };
}

export function shouldWarnSlowRender(renderTimeMs: number): boolean {
  return (
    renderDiagnostics.slowRenderWarnings &&
    renderTimeMs > renderDiagnostics.slowRenderThresholdMs
  );
}
