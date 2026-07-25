import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import { Show } from '@askrjs/askr/control';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('SSR anchored range markers', () => {
  it('should emit deterministic markers and hydrate multi-node control output', async () => {
    const { container, cleanup } = createTestContainer();
    const Component = () => (
      <main>
        <Show when={true}>
          <span id="range-a">A</span>
          <span id="range-b">B</span>
        </Show>
      </main>
    );

    try {
      const html = renderToStringSync(Component);
      expect(html).toContain('<!--askr-range-start-->');
      expect(html).toContain('<!--askr-range-end-->');

      container.innerHTML = html;
      const serverRangeA = container.querySelector('#range-a');
      await expect(
        hydrateSPA({
          root: container,
          registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
        })
      ).resolves.not.toThrow();

      expect(container.querySelector('#range-a')?.textContent).toBe('A');
      expect(container.querySelector('#range-b')?.textContent).toBe('B');
      expect(container.querySelector('#range-a')).toBe(serverRangeA);
    } finally {
      cleanup();
    }
  });
});
