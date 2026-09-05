const originalScrollTo = globalThis.window?.scrollTo;

if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: () => {},
    });
  } catch {
    try {
      window.scrollTo = () => {};
    } catch {
      // Ignore environments where the property cannot be replaced.
    }
  }
}

void originalScrollTo;

declare const __ASKR_BENCH_PRECISE_CLOCK__: boolean;

if (
  typeof __ASKR_BENCH_PRECISE_CLOCK__ !== 'undefined' &&
  __ASKR_BENCH_PRECISE_CLOCK__
) {
  let previous = performance.now();
  let clockStepMs = Infinity;
  for (let index = 0; index < 10_000; index += 1) {
    const current = performance.now();
    const step = current - previous;
    if (step > 0 && step < clockStepMs) clockStepMs = step;
    previous = current;
  }

  const clockEvidence = {
    crossOriginIsolated: globalThis.crossOriginIsolated,
    clockStepMs,
  };
  if (!clockEvidence.crossOriginIsolated || clockStepMs > 0.01) {
    throw new Error(
      `High-resolution benchmark clock preflight failed: ${JSON.stringify(clockEvidence)}`
    );
  }
  console.info('Benchmark clock preflight:', JSON.stringify(clockEvidence));
}
