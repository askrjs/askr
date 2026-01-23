import { describe, it, expect } from 'vitest';
import { createIsland } from '../../src/boot';
import { state } from '../../src/runtime/state';
import { For } from '../../src/for';

// Lightweight mount helper used by other tests
function mountToDOM(fn: () => unknown) {
  const root = document.createElement('div');
  root.id = 'root-test-robust';
  document.body.appendChild(root);
  createIsland({ root: 'root-test-robust', component: fn as any });
  return root;
}

describe('event handler flush guarantees - robust', () => {
  it('should apply DOM class synchronously after click repeatedly', () => {
    function App() {
      const selected = state<number | null>(null);
      const data = state(
        Array.from({ length: 2 }, (_, i) => ({
          id: i + 1,
          label: String(i + 1),
        }))
      );

      const select = (id: number) => {
        selected.set(id);
      };

      return (
        <table>
          <tbody>
            {For(
              () => data(),
              (item) => (
                <tr class={selected() === item.id ? 'danger' : ''}>
                  <td class="col-md-1">{item.id}</td>
                  <td>
                    <a id={`link-${item.id}`} onClick={() => select(item.id)}>
                      {item.label}
                    </a>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      );
    }

    mountToDOM(App);

    const a2 = document.getElementById('link-2') as HTMLAnchorElement;

    // Dispatch multiple clicks to surface intermittent failures
    for (let i = 0; i < 50; i++) {
      a2.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
      const row2 = document.querySelector(
        'tbody>tr:nth-of-type(2)'
      ) as HTMLElement;
      expect(row2.className).toBe('danger');
    }
  });
});
