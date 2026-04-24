import { expect } from 'chai';
import { test, describe } from 'vite-plus/test';
import { createIsland } from '../../src';
import { createTestContainer } from '../helpers/test-renderer';
import { For } from '../../src/for';

describe('For component with table elements', () => {
  test('should render table rows (tr) elements correctly with For', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const rows = [
        { id: 1, label: 'Row 1' },
        { id: 2, label: 'Row 2' },
        { id: 3, label: 'Row 3' },
      ];

      return (
        <table>
          <tbody>
            {
              <For each={() => rows} by={(row) => row.id}>
                {(row) => (
                  <tr key={row.id}>
                    <td>{String(row.id)}</td>
                    <td>{row.label}</td>
                  </tr>
                )}
              </For>
            }
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: Component });

    // Check that rows were rendered
    const tbody = container.querySelector('tbody');
    if (!tbody) throw new Error('tbody not found');

    const rows = tbody.querySelectorAll('tr');
    expect(rows.length).to.equal(3);

    // Check first row content
    const firstRow = rows[0];
    const cells = firstRow.querySelectorAll('td');
    expect(cells.length).to.equal(2);
    expect(cells[0].textContent).to.equal('1');
    expect(cells[1].textContent).to.equal('Row 1');

    cleanup();
  });
});
