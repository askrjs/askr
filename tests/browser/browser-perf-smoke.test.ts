import { expect, test } from 'vite-plus/test';
import { loadBrowserHarness } from './_helpers';

test.describe('browser performance smoke checks', () => {
  test('should expose current benchmark metadata in the browser bridge', async () => {
    const app = await loadBrowserHarness();
    app.mountBenchmarkScenario();

    const metadata = app.getBenchmarkMetadata();

    expect(metadata.packageName).toBe('@askrjs/askr');
    expect(metadata.packageVersion).toBe('0.0.36');
    expect(metadata.buildLabel).toBe('0.0.36-local');
  });

  test('should expose profiled benchmark operations with runtime metrics', async () => {
    const app = await loadBrowserHarness();
    app.mountBenchmarkScenario();

    const profile = app.profileBenchmarkOperations();

    expect(profile.metadata.buildLabel).toBe('0.0.36-local');
    expect(profile.operations.create1k.durationMs).toBeGreaterThanOrEqual(0);
    expect(profile.operations.create1k.benchMetrics.itemsCreated).toBe(1000);
    expect(profile.operations.update10th1k_x16.benchMetrics.fastLaneName).toBe(
      'NO_REORDER'
    );
    expect(profile.operations.swap1k.benchMetrics.fastLaneName).toBe('SWAP');
    expect(profile.operations.swap1k.benchMetrics.domMoves).toBe(2);
    expect(profile.operations.select.perfMetrics).not.toBeNull();
    expect(
      profile.operations.select.perfMetrics?.reactivePropReevaluations ?? 0
    ).toBeGreaterThan(0);
  });

  test('should collect coarse browser timing signals', async () => {
    const app = await loadBrowserHarness();
    app.mountBenchmarkScenario();

    const timings = await app.runBrowserPerf();

    expect(timings.mountMs).toBeGreaterThanOrEqual(0);
    expect(timings.updateMs).toBeGreaterThanOrEqual(0);
    expect(timings.firstInteractionMs).toBeGreaterThanOrEqual(0);
  });
});
