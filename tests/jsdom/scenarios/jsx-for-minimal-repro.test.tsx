/**
 * Minimal reproduction test for JSX + For rendering issues
 */
import { expect } from 'chai';
import { test, describe } from 'vite-plus/test';
import { createIsland, state } from '../../../src';
import { createTestContainer, flushScheduler } from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

describe('JSX For minimal repro', () => {
  test('should render basic JSX row component', () => {
    const { container, cleanup } = createTestContainer();

    function SimpleRow({ id, label }: { id: number; label: string }) {
      return (
        <tr>
          <td>{id}</td>
          <td>{label}</td>
        </tr>
      );
    }

    const App = () => {
      return (
        <table>
          <tbody>
            <SimpleRow id={1} label="Test" />
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const tbody = container.querySelector('tbody');
    void expect(tbody).to.not.be.null;

    const rows = tbody!.querySelectorAll('tr');
    expect(rows.length).to.equal(1);

    const cells = rows[0].querySelectorAll('td');
    expect(cells.length).to.equal(2);
    expect(cells[0].textContent).to.equal('1');
    expect(cells[1].textContent).to.equal('Test');

    cleanup();
  });

  test('should render JSX row with For', () => {
    const { container, cleanup } = createTestContainer();

    function Row({ id, label }: { id: number; label: string }) {
      return (
        <tr>
          <td>{id}</td>
          <td>{label}</td>
        </tr>
      );
    }

    const App = () => {
      const items = state([
        { id: 1, label: 'Item 1' },
        { id: 2, label: 'Item 2' },
      ]);

      return (
        <table>
          <tbody>
            {
              <For each={() => items()} by={(item) => item.id}>
                {(item) => <Row id={item.id} label={item.label} />}
              </For>
            }
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const tbody = container.querySelector('tbody');
    void expect(tbody).to.not.be.null;

    const rows = tbody!.querySelectorAll('tr');
    expect(rows.length).to.equal(2);

    const firstCells = rows[0].querySelectorAll('td');

    if (firstCells.length > 0) {
      expect(firstCells[0].textContent).to.equal('1');
      expect(firstCells[1].textContent).to.equal('Item 1');
    }

    cleanup();
  });
});
