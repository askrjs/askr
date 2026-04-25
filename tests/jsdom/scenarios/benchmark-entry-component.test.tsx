import { describe, expect, it } from 'vite-plus/test';

import {
  benchmarkMetadata,
  mountBenchmark,
} from '../../../src/bench/benchmark-entry';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('benchmark entry component harness', () => {
  it('should expose current local benchmark metadata', () => {
    expect(benchmarkMetadata.packageName).toBe('@askrjs/askr');
    expect(benchmarkMetadata.packageVersion).toBe('0.0.1');
    expect(benchmarkMetadata.buildLabel).toBe('0.0.1-local');
  });

  it('should preserve keyed row identity while updating selection and rows', () => {
    const { container, cleanup } = createTestContainer();

    const benchmark = mountBenchmark(container, [
      { id: 1, label: 'Row 1' },
      { id: 2, label: 'Row 2' },
      { id: 3, label: 'Row 3' },
    ]);

    const row1Before = container.querySelector('[data-key="1"]');
    const row2Before = container.querySelector('[data-key="2"]');
    const row3Before = container.querySelector('[data-key="3"]');

    expect(row1Before).not.toBeNull();
    expect(row2Before).not.toBeNull();
    expect(row3Before).not.toBeNull();

    benchmark.setSelected(2);

    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
    expect(container.querySelector('[data-key="3"]')).toBe(row3Before);
    expect((row2Before as HTMLElement).className).toBe('danger');

    benchmark.setRows([
      { id: 1, label: 'Row 1 !!!' },
      { id: 2, label: 'Row 2' },
      { id: 3, label: 'Row 3' },
    ]);

    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect(row1Before?.querySelector('td:nth-child(2) a')?.textContent).toBe(
      'Row 1 !!!'
    );

    const selectLink = row1Before?.querySelector(
      'td:nth-child(2) a'
    ) as HTMLAnchorElement | null;
    expect(selectLink).not.toBeNull();
    selectLink!.click();

    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect((row1Before as HTMLElement).className).toBe('danger');

    const removeLink = row1Before?.querySelector(
      'td:nth-child(3) a'
    ) as HTMLAnchorElement | null;
    expect(removeLink).not.toBeNull();
    removeLink!.click();

    expect(container.querySelector('[data-key="1"]')).toBeNull();
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
    expect(container.querySelector('[data-key="3"]')).toBe(row3Before);

    benchmark.setRows([
      { id: 3, label: 'Row 3' },
      { id: 2, label: 'Row 2' },
    ]);

    const orderedKeys = Array.from(
      container.querySelectorAll('tr[data-key]')
    ).map((row) => row.getAttribute('data-key'));

    expect(orderedKeys).toEqual(['3', '2']);
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
    expect(container.querySelector('[data-key="3"]')).toBe(row3Before);

    cleanup();
  });
});
