import { describe, expect, it } from 'vitest';
import { trustedBenchmarkFiles } from '../../benches/tools/registry';
import {
  classifyConfidence,
  createBaselineFile,
  enrichTrustedResults,
  parseVitestBenchOutput,
  renderTrustedReport,
  validateTrustedRunCoverage,
} from '../../benches/tools/report';

describe('benchmark registry', () => {
  it('defines trusted scenarios for every trusted file', () => {
    expect(trustedBenchmarkFiles.length).toBeGreaterThan(0);
    for (const file of trustedBenchmarkFiles) {
      expect(file.status).toBe('trusted');
      expect(file.scenarios?.length).toBeGreaterThan(0);
      expect(file.owner.length).toBeGreaterThan(0);
      expect(file.includedCost.length).toBeGreaterThan(0);
    }
  });
});

describe('benchmark output parsing', () => {
  it('parses vitest bench rows into structured results', () => {
    const output = `
 RUN  v4.0.18 D:/repos/askrjs/askr
 ✓ benches/foundations/compose-handlers.bench.ts > composeHandlers 10ms
     name                                       hz      min      max      mean    p75     p99    p995    p999    rme   samples
   · compose two simple handlers        10,810,321.84   0.0000   6.2108   0.0001  0.0001  0.0002  0.0002  0.0005  ±4.38%  5,405,162
`;

    const parsed = parseVitestBenchOutput(output);
    expect(parsed).toEqual([
      expect.objectContaining({
        file: 'benches/foundations/compose-handlers.bench.ts',
        name: 'compose two simple handlers',
        hz: 10810321.84,
        samples: 5405162,
        rme: 4.38,
      }),
    ]);
  });
});

describe('benchmark confidence', () => {
  it('classifies stable results as high confidence', () => {
    const { confidence, warnings } = classifyConfidence({
      file: 'x',
      name: 'stable',
      hz: 1000,
      min: 0.01,
      max: 0.25,
      mean: 0.02,
      p75: 0.02,
      p99: 0.03,
      p995: 0.03,
      p999: 0.04,
      rme: 4,
      samples: 500,
    });

    expect(confidence).toBe('high-confidence');
    expect(warnings).toEqual([]);
  });

  it('downgrades noisy results and surfaces warnings', () => {
    const { confidence, warnings } = classifyConfidence({
      file: 'x',
      name: 'noisy',
      hz: 100,
      min: 1,
      max: 120,
      mean: 2,
      p75: 2,
      p99: 15,
      p995: 20,
      p999: 40,
      rme: 42,
      samples: 12,
    });

    expect(confidence).toBe('invalid-for-decisions');
    expect(warnings).toContain('low sample count (12)');
    expect(warnings).toContain('high RME (42.00%)');
  });
});

describe('trusted benchmark reporting', () => {
  it('validates trusted coverage and renders baseline deltas', () => {
    const results = [
      {
        file: 'benches/foundations/compose-handlers.bench.ts',
        name: 'compose two simple handlers',
        hz: 100,
        min: 0.01,
        max: 0.02,
        mean: 0.01,
        p75: 0.01,
        p99: 0.02,
        p995: 0.02,
        p999: 0.02,
        rme: 3,
        samples: 200,
      },
    ];

    const baseline = createBaselineFile('trusted', results);
    baseline.results[
      'benches/foundations/compose-handlers.bench.ts::compose two simple handlers'
    ].hz = 80;

    const errors = validateTrustedRunCoverage(results);
    expect(errors).toContain(
      'Trusted benchmark result missing from run: benches/foundations/compose-refs.bench.ts::setRef with callback ref'
    );

    const enriched = enrichTrustedResults(results, baseline);
    const report = renderTrustedReport(enriched);
    expect(report).toContain('[foundations]');
    expect(report).toContain('+25.00% vs baseline');
    expect(report).toContain('compose two simple handlers');
  });
});
