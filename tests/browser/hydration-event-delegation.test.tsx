import { afterEach, expect, test } from 'vite-plus/test';
import { routeRegistryFromTable } from '../router-test-utils';
import { hydrateSPA } from '@askrjs/askr/boot';
import { renderToStringSync } from '@askrjs/askr/ssr';
import { state } from '@askrjs/askr';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

// Hydration needs the SPA execution model, so it lives apart from the island
// delegation scenarios in event-delegation.test.tsx.
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

test('should dispatch bubbling events target-first across hydrated and client-rendered nodes', async () => {
  const { container: root, cleanup } = createTestContainer();
  cleanups.push(cleanup);
  const calls: string[] = [];
  let showChild!: ReturnType<typeof state<boolean>>;

  function Page() {
    showChild = state(false);
    return (
      <section id="ancestor" onClick={() => calls.push('ancestor')}>
        <button id="hydrated" onClick={() => calls.push('hydrated')}>
          {'hydrated'}
        </button>
        {showChild() ? (
          <button
            id="client"
            onClick={(event: Event) => {
              calls.push('client');
              event.stopPropagation();
            }}
          >
            {'client'}
          </button>
        ) : null}
      </section>
    );
  }

  const routes = [{ path: '/', handler: Page }];
  window.history.replaceState({}, '', '/');
  root.innerHTML = renderToStringSync(() => Page());
  await hydrateSPA({ root, registry: routeRegistryFromTable(routes) });
  flushScheduler();

  root.querySelector<HTMLButtonElement>('#hydrated')!.click();
  expect(calls).toEqual(['hydrated', 'ancestor']);

  showChild.set(true);
  flushScheduler();
  calls.length = 0;

  root.querySelector<HTMLButtonElement>('#client')!.click();
  expect(calls).toEqual(['client']);
});
