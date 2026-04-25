export {};

declare global {
  interface Window {
    __askrPlaywright: {
      getBenchmarkMetadata(): {
        packageName: string;
        packageVersion: string;
        buildLabel: string;
      };
      mountBenchmarkScenario(rows?: Array<{ id: number; label: string }>): void;
      mountInteractionScenario(): void;
      mountGuardedRouterScenario(): Promise<void>;
      profileBenchmarkOperations(): {
        metadata: {
          packageName: string;
          packageVersion: string;
          buildLabel: string;
        };
        operations: Record<
          string,
          {
            durationMs: number;
            benchMetrics: {
              itemsCreated: number;
              itemsReused: number;
              itemsRemoved: number;
              itemsMoved: number;
              rowFactoryInvocations: number;
              keyLookups: number;
              keyHits: number;
              keyMisses: number;
              domInserts: number;
              domRemoves: number;
              domMoves: number;
              domAttrSets: number;
              domTextSets: number;
              domNodesCreated: number;
              listenerBindings: number;
              reactivePropsMounted: number;
              replaceChildrenCommits: number;
              bulkClearCommits: number;
              reconcilePhaseMs: number;
              domCommitPhaseMs: number;
              fastLaneName: string | null;
            };
            perfMetrics: {
              selectorInvalidations: number;
              selectorCandidateReads: number;
              reactivePropReevaluations: number;
              skippedDomPropWrites: number;
              classListPatchOps: number;
              delegatedAncestorHops: number;
              hydrationBoundaryActivations: number;
              ssrTagCacheHits: number;
              lastSchedulerTaskCountPerFlush: number;
              maxSchedulerTaskCountPerFlush: number;
              schedulerFlushCount: number;
              schedulerTaskExecutions: number;
              ssgWorkerCount: number;
              ssgRenderTimeMs: number;
              ssgWorkerRenderTimeMs: number;
              ssgWriteTimeMs: number;
            } | null;
          }
        >;
      };
      setRows(rows: Array<{ id: number; label: string }>): void;
      runBrowserPerf(): Promise<{
        mountMs: number;
        updateMs: number;
        firstInteractionMs: number;
      }>;
    };
  }
}
