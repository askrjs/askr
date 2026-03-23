import { expect, it } from 'vitest';

// This test simulates an SSR-like environment by temporarily removing
// `document` and `window` from globalThis and dynamically importing the
// renderer modules to ensure they don't throw at module-eval time.
it('should import renderer modules safely in SSR when document/window are missing', async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const savedDoc = g.document as unknown;
  const savedWindow = g.window as unknown;
  try {
    delete (g as Record<string, unknown>).document;
    delete (g as Record<string, unknown>).window;

    // Dynamically import the modules under test; these should not throw just
    // because `document` or `window` are undefined (module-eval must be safe).
    // Use import() so the module is evaluated under the altered globals.
    await Promise.all([
      import('../../src/renderer/dom'),
      import('../../src/renderer/evaluate'),
      import('../../src/renderer/fastpath'),
      import('../../src/renderer/reconcile'),
    ]);

    // If we reached here, imports did not throw.
    expect(true).toBe(true);
  } finally {
    if (savedDoc !== undefined)
      (g as Record<string, unknown>).document = savedDoc;
    if (savedWindow !== undefined)
      (g as Record<string, unknown>).window = savedWindow;
  }
});
