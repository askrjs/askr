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
      // Back-compat: surface important diag keys on globalThis for tests
      // and existing dev invariants that read top-level globals. Also
      // mirror with a `__ASKR_` prefix to match legacy top-level keys.
      const root = globalThis as unknown as Record<string, unknown>;
        try {
        // Consolidate diagnostics under a single namespace to avoid
        // polluting the top-level global scope. Keep a namespaced view for
        // both production and dev so tools can inspect `globalThis.__ASKR__`.
        const ns = (root as Record<string, unknown> & { __ASKR__?: Record<string, unknown> }).__ASKR__ || ((root as Record<string, unknown> & { __ASKR__?: Record<string, unknown> }).__ASKR__ = {});
        try {
          ns[key] = value;
        } catch (e) {
          void e;
        }

        // For backward compatibility during development, mirror legacy
        // top-level keys so existing dev invariants and tests still work.
        if (process.env.NODE_ENV !== 'production') {
          try {
            (root as Record<string, unknown>)[key] = value;
          } catch (e) {
            void e;
          }
          try {
            const stripped = key.replace(/^_+/, '');
            const topKey = `__ASKR_${stripped}`;
            (root as Record<string, unknown>)[topKey] = value;
          } catch (e) {
            void e;
          }
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
      // Mirror counter into namespace
      const root = globalThis as unknown as Record<string, unknown> & { __ASKR__?: Record<string, unknown> };
      const ns = root.__ASKR__ || (root.__ASKR__ = {});
      try {
        const nsPrev = typeof ns[key] === 'number' ? (ns[key] as number) : 0;
        ns[key] = nsPrev + 1;
      } catch (e) {
        void e;
      }

      // Back-compat: update legacy top-level counters only in development
      if (process.env.NODE_ENV !== 'production') {
        try {
          const topPrev = typeof root[key] === 'number' ? (root[key] as number) : 0;
          (root as Record<string, unknown>)[key] = topPrev + 1;
        } catch (e) {
          void e;
        }
        try {
          const stripped = key.replace(/^_+/, '');
          const topKey = `__ASKR_${stripped}`;
          const topPrev2 = typeof root[topKey] === 'number' ? (root[topKey] as number) : 0;
          (root as Record<string, unknown>)[topKey] = topPrev2 + 1;
        } catch (e) {
          void e;
        }
      }
    } catch (e) {
      void e;
    }
  } catch (e) {
    void e;
  }
}
