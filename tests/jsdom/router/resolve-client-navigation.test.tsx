import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createSPA } from '../../../src/boot';
import { navigate } from '../../../src/router/navigate';
import { route } from '../../../src/router/route';
import { defer, Resolve, routeData } from '../../../src/router';
import type { Deferred } from '../../../src/router';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { currentRouteRegistry, resetRouteState } from '../../router-test-utils';

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    flushScheduler();
  }
}

describe('Resolve after client navigation', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
  });

  afterEach(() => {
    cleanup();
  });

  it('should render deferred loader data once its promise settles', async () => {
    let fulfil!: (value: string) => void;
    const message = new Promise<string>((resolve) => {
      fulfil = resolve;
    });

    route('/', () => <p>home</p>);
    route(
      '/deferred',
      () => {
        const data = routeData<{ message: Deferred<string> }>();
        return (
          <Resolve value={data.message} pending={<p>pending</p>}>
            {(value) => <p>{value}</p>}
          </Resolve>
        );
      },
      { loader: () => ({ message: defer(message) }) }
    );

    await createSPA({ root: container, registry: currentRouteRegistry() });
    await settle();
    expect(container.textContent).toBe('home');

    await navigate('/deferred');
    await settle();
    expect(container.textContent).toBe('pending');

    fulfil('ready');
    await settle();
    expect(container.textContent).toBe('ready');
  });

  it('should render the rejected fallback once the deferred promise rejects', async () => {
    let fail!: (error: Error) => void;
    const message = new Promise<string>((_resolve, reject) => {
      fail = reject;
    });

    route('/', () => <p>home</p>);
    route(
      '/deferred',
      () => {
        const data = routeData<{ message: Deferred<string> }>();
        return (
          <Resolve
            value={data.message}
            pending={<p>pending</p>}
            rejected={(error) => <p>failed: {String(error)}</p>}
          >
            {(value) => <p>{value}</p>}
          </Resolve>
        );
      },
      { loader: () => ({ message: defer(message) }) }
    );

    await createSPA({ root: container, registry: currentRouteRegistry() });
    await settle();
    await navigate('/deferred');
    await settle();
    expect(container.textContent).toBe('pending');

    fail(new Error('demo rejection'));
    await settle();
    expect(container.textContent).toBe('failed: Error: demo rejection');
  });
});
