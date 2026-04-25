export {};

declare global {
  interface Window {
    __askrPlaywright: {
      mountBenchmarkScenario(rows?: Array<{ id: number; label: string }>): void;
      mountInteractionScenario(): void;
      mountGuardedRouterScenario(): Promise<void>;
      setRows(rows: Array<{ id: number; label: string }>): void;
      runBrowserPerf(): Promise<{
        mountMs: number;
        updateMs: number;
        firstInteractionMs: number;
      }>;
    };
  }
}
