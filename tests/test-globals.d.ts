declare global {
  var __BULK_RENDER_COUNT: number | undefined;
  // Legacy top-level diagnostic keys removed. Use the namespaced view `globalThis.__ASKR__` instead.
  var __ASKR__: Record<string, unknown> | undefined;
}

export {};
