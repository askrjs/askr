import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../../src/control';
import { derive } from '../../../../src/runtime/reactivity/derive';
import { state } from '../../../../src/runtime/reactivity/state';
import { createIsland } from '../../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';
import { getCapturedFrameworkWarnings } from '../../../setup-env';

describe('dynamic derived unused warning regression', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should not warn when current list shape temporarily skips a previously used sort state', () => {
    function App() {
      const rows = state(['Northwind', 'Acme']);
      const descending = state(false);
      const sortedRows = derive(() =>
        rows()
          .slice()
          .sort((left, right) =>
            descending() ? right.localeCompare(left) : left.localeCompare(right)
          )
      );

      return (
        <main>
          <button type="button" onClick={() => rows.set(['Northwind'])}>
            Filter
          </button>
          <ul>
            <For each={() => sortedRows()} by={(row) => row}>
              {(row) => <li>{row}</li>}
            </For>
          </ul>
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(getCapturedFrameworkWarnings().join('\n')).not.toContain(
      'Unused state variable detected'
    );
  });
});
