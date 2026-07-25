import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, it, expect } from 'vite-plus/test';
import { createSPA } from '../../../src/boot';
import { navigate } from '../../../src/router/navigate';
import { state } from '../../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('nested component in SPA', () => {
  it('should work in createSPA with route components', async () => {
    const { container, cleanup } = createTestContainer();

    const Counter = () => {
      const count = state(0);
      return (
        <div class="counter">
          <button id="btn" onClick={() => count.set(count() + 1)}>
            {count()}
          </button>
        </div>
      );
    };

    await createSPA({
      root: container,
      registry: routeRegistryFromTable([
        { path: '/counter', handler: () => <Counter /> },
      ]),
    });
    flushScheduler();

    navigate('/counter');
    flushScheduler();

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    expect(btn.textContent?.trim()).to.equal('0');

    btn.click();
    flushScheduler();

    expect(btn.textContent?.trim()).to.equal('1');

    btn.click();
    flushScheduler();

    expect(btn.textContent?.trim()).to.equal('2');

    cleanup();
  });
});
