import { afterEach, expect, it } from 'vite-plus/test';
import { state } from '@askrjs/askr';
import { cleanupApp, hydrateSPA } from '@askrjs/askr/boot';
import {
  createRouteRegistry,
  currentRoute,
  group,
  Outlet,
  page,
  route,
} from '@askrjs/askr/router';
import { renderRouteRequestToString } from '@askrjs/askr/ssr';
import { isRoutePathActive } from '../../../src/router/activity';
import { flushScheduler } from '../../../test-utils/render/test-renderer';
import { resetRouteState } from '../../router-test-utils';

afterEach(resetRouteState);
it('should reconstruct declaration ancestry from the owning registry during hydration without serializing it', async () => {
  const registry = createRouteRegistry(
    () => {
      group(
        {
          appMeta: {
            label: 'Parent',
            privateMarker: 'not-automatically-transported',
          },
        },
        () => {
          page(
            '/items',
            () => <Outlet />,
            { appMeta: { label: 'Items' } },
            () => {
              route('{id}', () => {
                const active = currentRoute<
                  { id: string },
                  unknown,
                  { label: string }
                >();
                const count = state(0);
                return (
                  <button
                    data-parent-active={String(isRoutePathActive('/items'))}
                    onClick={() => count.set((value) => value + 1)}
                  >{`${active.params.id}|${active.matches.map((entry) => entry.appMeta?.label ?? 'Leaf').join('/')}|${count()}`}</button>
                );
              });
            }
          );
        }
      );
    },
    { basePath: '/app' }
  );
  const rendered = await renderRouteRequestToString({
    url: '/app/items/42',
    registry,
  });
  if (rendered.kind !== 'render') throw new Error('expected render');
  expect(rendered.html).not.toContain('not-automatically-transported');
  const root = document.body.appendChild(document.createElement('div'));
  root.innerHTML = rendered.html;
  const button = root.querySelector('button')!;
  window.history.replaceState({}, '', '/app/items/42');
  try {
    await hydrateSPA({ root, registry, hydrate: { verifyMarkup: true } });
    expect(root.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('42|Parent/Items/Leaf|0');
    expect(button.dataset.parentActive).toBe('false');
    button.click();
    flushScheduler();
    expect(root.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('42|Parent/Items/Leaf|1');
  } finally {
    cleanupApp(root);
    root.remove();
  }
});
