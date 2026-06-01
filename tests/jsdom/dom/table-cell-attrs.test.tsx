import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  captureSSRSnapshot,
} from '../../../test-utils/render/test-renderer';

describe('table cell attributes', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should apply typed table cell attributes in the DOM', () => {
    const Component = () => (
      <table>
        <thead>
          <tr>
            <th scope="col" abbr="User name">
              Name
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={2} rowSpan={1} headers="user-name">
              Ada
            </td>
          </tr>
        </tbody>
      </table>
    );

    createIsland({ root: container, component: Component });
    flushScheduler();

    const th = container.querySelector('th') as HTMLTableCellElement;
    const td = container.querySelector('td') as HTMLTableCellElement;

    expect(th.getAttribute('scope')).toBe('col');
    expect(th.getAttribute('abbr')).toBe('User name');
    expect(td.colSpan).toBe(2);
    expect(td.rowSpan).toBe(1);
    expect(td.getAttribute('headers')).toBe('user-name');
  });

  it('should serialize typed table cell attributes in SSR', async () => {
    const Component = () => (
      <table>
        <thead>
          <tr>
            <th scope="col" abbr="User name">
              Name
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={2} rowSpan={1} headers="user-name">
              Ada
            </td>
          </tr>
        </tbody>
      </table>
    );

    const html = await captureSSRSnapshot(Component);

    expect(html).toContain('scope="col"');
    expect(html).toContain('abbr="User name"');
    expect(html).toContain('colSpan="2"');
    expect(html).toContain('rowSpan="1"');
    expect(html).toContain('headers="user-name"');
  });
});
