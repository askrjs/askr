import { afterEach, expect, it } from 'vite-plus/test';
import { cleanupApp, hydrateSPA } from '@askrjs/askr/boot';
import {
  createRouteRegistry,
  group,
  layoutData,
  route,
  routeData,
} from '@askrjs/askr/router';
import { renderRouteRequestToString } from '@askrjs/askr/ssr';
import type { RenderableChild } from '../../../src/common/vnode';
import { resetRouteState } from '../../router-test-utils';

afterEach(resetRouteState);

it('should server render and hydrate group loader data read with layoutData', async () => {
  const loadUser = async () => ({ name: 'Ada' });
  const registry = createRouteRegistry(() => {
    group(
      {
        loader: loadUser,
        layout: ({ children }: { children?: RenderableChild }) => (
          <div>
            <h1>{layoutData(loadUser).name}</h1>
            {children}
          </div>
        ),
      },
      () => {
        route('/page', () => <p>{routeData<string>()}</p>, {
          loader: async () => 'leaf',
        });
      }
    );
  });
  const rendered = await renderRouteRequestToString({
    url: '/page',
    registry,
  });
  if (rendered.kind !== 'render') throw new Error('expected render');
  expect(rendered.html).toContain('<h1>Ada</h1>');
  expect(rendered.html).toContain('<p>leaf</p>');

  const root = document.body.appendChild(document.createElement('div'));
  root.innerHTML = rendered.html;
  window.history.replaceState({}, '', '/page');
  try {
    await hydrateSPA({ root, registry, hydrate: { verifyMarkup: true } });
    expect(root.querySelector('h1')?.textContent).toBe('Ada');
    expect(root.querySelector('p')?.textContent).toBe('leaf');
  } finally {
    cleanupApp(root);
    root.remove();
  }
});

it('should reject a group loader in synchronous server rendering', async () => {
  const { renderToString } = await import('@askrjs/askr/ssr');
  const registry = createRouteRegistry(() => {
    group({ loader: async () => 1 }, () => {
      route('/page', () => <p>page</p>);
    });
  });
  expect(() => renderToString({ url: '/page', registry } as never)).toThrow(
    /declares a loader/
  );
});
