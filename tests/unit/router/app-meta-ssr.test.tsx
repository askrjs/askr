import { describe, expect, it } from 'vite-plus/test';
import {
  createRouteRegistry,
  currentRoute,
  group,
  Outlet,
  page,
  route,
} from '@askrjs/askr/router';
import { renderRouteRequestToString } from '@askrjs/askr/ssr';

interface AppMeta {
  label?: string;
  marker?: string;
}

describe('request-owned application route metadata', () => {
  it('should preserve each registry through reverse-order concurrent loader resolution without hydration transport', async () => {
    const releases = new Map<string, () => void>();
    const build = (label: string) =>
      createRouteRegistry(() => {
        group(
          { appMeta: { label, marker: 'not-transported-app-meta' } },
          () => {
            page(
              '/items',
              () => <Outlet />,
              { appMeta: { label: 'Items' } },
              () => {
                route(
                  '{id}',
                  () => {
                    const active = currentRoute<
                      { id: string },
                      unknown,
                      AppMeta
                    >();
                    return (
                      <p>{`${active.params.id}|${active.matches.map((entry) => entry.appMeta?.label ?? 'leaf').join('/')}`}</p>
                    );
                  },
                  {
                    loader: () =>
                      new Promise((resolve) =>
                        releases.set(label, () => resolve({ ready: label }))
                      ),
                    meta: { title: `${label} head` },
                  }
                );
              }
            );
          }
        );
      });
    const first = renderRouteRequestToString({
      url: '/items/42',
      registry: build('First'),
    });
    const second = renderRouteRequestToString({
      url: '/items/42',
      registry: build('Second'),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect([...releases.keys()]).toEqual(['First', 'Second']);
    releases.get('Second')!();
    const secondResult = await second;
    releases.get('First')!();
    const firstResult = await first;
    for (const [result, label] of [
      [firstResult, 'First'],
      [secondResult, 'Second'],
    ] as const) {
      expect(result.kind).toBe('render');
      if (result.kind !== 'render') throw new Error('expected render');
      expect(result.html).toContain(`42|${label}/Items/leaf`);
      expect(result.html).not.toContain('not-transported-app-meta');
      expect(result.html).not.toContain('appMeta');
      expect(result.record?.options.meta).toEqual({
        title: `${label} head`,
      });
    }
  });
});
