import { expect, test } from 'vite-plus/test';
import {
  createRouteRegistry,
  currentRoute,
  group,
  matchRoute,
  route,
} from '@askrjs/askr/router';
import { renderRouteRequestToString } from '@askrjs/askr/ssr';

test('should retain packed leaf matching and leaf matching and registry-owned application metadata during SSR', async () => {
  const registry = createRouteRegistry(() => {
    group({ appMeta: { label: 'Parent', hidden: 'not-in-payload' } }, () => {
      route(
        '/items/{id}',
        () => {
          const active = currentRoute<
            { id: string },
            unknown,
            { label?: string }
          >();
          return (
            <p>{`${active.params.id}|${active.matches.map((entry) => entry.appMeta?.label).join('/')}`}</p>
          );
        },
        { appMeta: { label: 'Leaf' } }
      );
    });
  });
  expect(
    matchRoute<{ label: string }>('/items/42', { registry })?.appMeta?.label
  ).toBe('Leaf');
  const rendered = await renderRouteRequestToString({
    url: '/items/42',
    registry,
  });
  expect(rendered).toMatchObject({
    kind: 'render',
    html: '<p>42|Parent/Leaf</p>',
  });
});
