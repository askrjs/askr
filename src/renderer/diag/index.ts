type DiagMap = Record<string, unknown>;

function getDiagMap(): DiagMap {
  try {
    const root = globalThis as unknown as Record<string, unknown> & {
      __ASKR_DIAG?: DiagMap;
    };
    if (!root.__ASKR_DIAG) root.__ASKR_DIAG = {} as DiagMap;
    return root.__ASKR_DIAG!;
  } catch (e) {
    void e;
    return {} as DiagMap;
  }
}

export function __ASKR_set(key: string, value: unknown): void {
  try {
    const g = getDiagMap();
    (g as DiagMap)[key] = value;
    try {
      // Consolidate diagnostics under a single namespace to avoid
      // polluting the top-level global scope. Expose a namespaced view on
      // `globalThis.__ASKR__` so tools and tests can inspect diagnostic keys.
      const root = globalThis as unknown as Record<string, unknown> & {
        __ASKR__?: Record<string, unknown>;
      };
      try {
        const ns = root.__ASKR__ || (root.__ASKR__ = {});
        try {
          ns[key] = value;
        } catch (e) {
          void e;
        }
      } catch (e) {
        void e;
      }
    } catch (e) {
      void e;
    }
  } catch (e) {
    void e;
  }
}

export function __ASKR_incCounter(key: string): void {
  try {
    const g = getDiagMap();
    const prev = typeof g[key] === 'number' ? (g[key] as number) : 0;
    const next = prev + 1;
    (g as DiagMap)[key] = next;
    try {
      // Mirror counter into namespaced diagnostics
      const root = globalThis as unknown as Record<string, unknown> & {
        __ASKR__?: Record<string, unknown>;
      };
      const ns = root.__ASKR__ || (root.__ASKR__ = {});
      try {
        const nsPrev = typeof ns[key] === 'number' ? (ns[key] as number) : 0;
        ns[key] = nsPrev + 1;
      } catch (e) {
        void e;
      }
    } catch (e) {
      void e;
    }
  } catch (e) {
    void e;
  }
}
