import { describe, expect, it } from 'vitest';

import { mountBenchmark } from '../../src/bench/benchmark-entry';
import { createTestContainer } from '../helpers/test-renderer';

describe('benchmark entry component harness', () => {
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

    benchmark.setRows([
      { id: 1, label: 'Row 1 !!!' },
      { id: 3, label: 'Row 3' },
      { id: 2, label: 'Row 2' },
    ]);

    const orderedKeys = Array.from(
      container.querySelectorAll('tr[data-key]')
    ).map((row) => row.getAttribute('data-key'));

    expect(orderedKeys).toEqual(['1', '3', '2']);
    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
    expect(container.querySelector('[data-key="3"]')).toBe(row3Before);

    cleanup();
  });
});
