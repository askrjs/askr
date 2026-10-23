import { describe, it, expect, afterEach } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('review round three: hydration', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('should keep an application data-key attribute through hydration', async () => {
    const Page = () => (
      <ul>
        <li data-key="a">a</li>
      </ul>
    );
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    mounted.container.innerHTML = renderToStringSync(Page);
    expect(
      mounted.container.querySelector('li')!.getAttribute('data-key')
    ).toBe('a');
    await hydrateSPA({
      root: mounted.container,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
      hydrate: { verifyMarkup: false },
    });
    expect(
      mounted.container.querySelector('li')!.getAttribute('data-key')
    ).toBe('a');
  });
});
