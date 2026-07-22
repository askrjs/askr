import { afterEach, describe, expect, it } from 'vite-plus/test';
import { For, state } from '../../../src';
import { cleanupApp, createIsland } from '../../../src/boot';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

describe('component fragment structure', () => {
  let root: HTMLElement | undefined;

  afterEach(() => {
    if (root) {
      cleanupApp(root);
      root.remove();
      root = undefined;
    }
  });

  it('should keep component-returned keyed rows structurally transparent', async () => {
    let reorder!: () => void;
    let updateAndRemove!: () => void;

    function Rows() {
      const [rows, setRows] = state([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
      reorder = () => setRows([rows()[1]!, rows()[0]!]);
      updateAndRemove = () => setRows([{ id: 2, name: 'Bob' }]);

      return (
        <For each={rows} by={(row) => row.id}>
          {(row) => (
            <tr data-row={row.id}>
              <td>{row.name}</td>
            </tr>
          )}
        </For>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <table>
          <tbody>
            <Rows />
          </tbody>
        </table>
      ),
    });

    const tbody = root.querySelector('tbody')!;
    expect(Array.from(tbody.children).map((child) => child.tagName)).toEqual([
      'TR',
      'TR',
    ]);

    reorder();
    flushScheduler();
    expect(
      Array.from(tbody.querySelectorAll(':scope > tr')).map((row) =>
        row.getAttribute('data-row')
      )
    ).toEqual(['2', '1']);

    updateAndRemove();
    flushScheduler();
    expect(tbody.querySelectorAll(':scope > tr')).toHaveLength(1);
    expect(tbody.querySelector(':scope > tr')?.textContent).toBe('Bob');
  });

  it('should keep component-returned options structurally transparent', () => {
    function Options() {
      return (
        <For each={['alpha', 'beta']} by={(value) => value}>
          {(value) => <option value={value}>{value}</option>}
        </For>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <select>
          <Options />
        </select>
      ),
    });

    expect(
      Array.from(root.querySelector('select')!.children).map(
        (child) => child.tagName
      )
    ).toEqual(['OPTION', 'OPTION']);
  });
});
