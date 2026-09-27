import { describe, expect, it } from 'vite-plus/test';

import {
  benchmarkMetadata,
  mountBenchmark,
} from '../../../src/bench/benchmark-entry';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

// Mirror the exact env precedence used by src/bench/benchmark-entry.tsx. The
// jsdom vitest config (createNodeEnvDefine) injects ASKR_PACKAGE_* from
// package.json into both source and test modules, so deriving the expected
// values the same way keeps this test version-agnostic instead of hardcoding a
// literal that goes stale on every version bump.
const expectedPackageName =
  process.env.ASKR_PACKAGE_NAME ||
  process.env.npm_package_name ||
  '@askrjs/askr';
const expectedPackageVersion =
  process.env.ASKR_PACKAGE_VERSION ||
  process.env.npm_package_version ||
  '0.0.0';
const expectedBuildLabel =
  process.env.ASKR_BENCHMARK_BUILD_LABEL || `${expectedPackageVersion}-local`;

describe('benchmark entry component harness', () => {
  it('should expose current local benchmark metadata', () => {
    expect(benchmarkMetadata.packageName).toBe(expectedPackageName);
    expect(benchmarkMetadata.packageVersion).toBe(expectedPackageVersion);
    expect(benchmarkMetadata.buildLabel).toBe(expectedBuildLabel);
  });

  it('should preserve keyed row identity while updating selection and rows', () => {
    const { container, cleanup } = createTestContainer();

    const benchmark = mountBenchmark(container, [
      { id: 1, label: 'Row 1' },
      { id: 2, label: 'Row 2' },
      { id: 3, label: 'Row 3' },
    ]);

    const rowById = (id: number) =>
      Array.from(container.querySelectorAll('tbody tr')).find(
        (row) => row.querySelector('td')?.textContent === String(id)
      ) ?? null;

    const row1Before = rowById(1);
    const row2Before = rowById(2);
    const row3Before = rowById(3);

    expect(row1Before).not.toBeNull();
    expect(row2Before).not.toBeNull();
    expect(row3Before).not.toBeNull();

    benchmark.setSelected(2);

    expect(rowById(1)).toBe(row1Before);
    expect(rowById(2)).toBe(row2Before);
    expect(rowById(3)).toBe(row3Before);
    expect((row2Before as HTMLElement).className).toBe('danger');

    benchmark.setRows([
      { id: 1, label: 'Row 1 !!!' },
      { id: 2, label: 'Row 2' },
      { id: 3, label: 'Row 3' },
    ]);

    expect(rowById(1)).toBe(row1Before);
    expect(row1Before?.querySelector('td:nth-child(2) a')?.textContent).toBe(
      'Row 1 !!!'
    );

    const selectLink = row1Before?.querySelector(
      'td:nth-child(2) a'
    ) as HTMLAnchorElement | null;
    expect(selectLink).not.toBeNull();
    selectLink!.click();

    expect(rowById(1)).toBe(row1Before);
    expect((row1Before as HTMLElement).className).toBe('danger');

    const removeLink = row1Before?.querySelector(
      'td:nth-child(3) a'
    ) as HTMLAnchorElement | null;
    expect(removeLink).not.toBeNull();
    removeLink!.click();

    expect(rowById(1)).toBeNull();
    expect(rowById(2)).toBe(row2Before);
    expect(rowById(3)).toBe(row3Before);

    benchmark.setRows([
      { id: 3, label: 'Row 3' },
      { id: 2, label: 'Row 2' },
    ]);

    const orderedKeys = Array.from(container.querySelectorAll('tbody tr')).map(
      (row) => row.querySelector('td')?.textContent
    );

    expect(orderedKeys).toEqual(['3', '2']);
    expect(rowById(2)).toBe(row2Before);
    expect(rowById(3)).toBe(row3Before);

    cleanup();
  });
});
