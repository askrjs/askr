import { resetRouteState } from '../../router-test-utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { createDataRuntime, disposeDataRuntime } from '../../../src/data';
import {
  createRouteRegistry,
  lazy,
  Link,
  route,
  routeData,
} from '../../../src/router';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

async function settle(): Promise<void> {
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
}

function click(element: Element): void {
  element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  );
}

describe('Link navigation options', () => {
  let { container, cleanup } = createTestContainer();
  let dataRuntime = createDataRuntime();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    dataRuntime = createDataRuntime();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    disposeDataRuntime(dataRuntime);
    vi.restoreAllMocks();
  });

  it('should replace the history entry when replace is set', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => (
        <Link href="/b" replace>
          to b
        </Link>
      ));
      route('/b', () => <p>b</p>);
    });
    await createSPA({ root: container, registry, dataRuntime });
    const length = window.history.length;
    click(container.querySelector('a')!);
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    expect(window.history.length).toBe(length);
  });

  it('should store state on the destination entry', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => (
        <Link href="/b" state={{ from: 'home' }}>
          to b
        </Link>
      ));
      route('/b', () => <p>b</p>);
    });
    await createSPA({ root: container, registry, dataRuntime });
    click(container.querySelector('a')!);
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    expect(window.history.state.askrState).toEqual({ from: 'home' });
  });

  it('should scroll to the top by default and keep the offset with scroll preserve', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    const registry = createRouteRegistry(() => {
      route('/', () => (
        <div>
          <Link href="/top">top</Link>
          <Link href="/keep" scroll="preserve">
            keep
          </Link>
        </div>
      ));
      route('/top', () => <p>top page</p>);
      route('/keep', () => <p>keep page</p>);
    });
    await createSPA({ root: container, registry, dataRuntime });
    const [top, keep] = Array.from(container.querySelectorAll('a'));

    click(keep!);
    await vi.waitFor(() => expect(container.textContent).toBe('keep page'));
    expect(scrollTo).not.toHaveBeenCalled();

    window.history.replaceState({}, '', '/');
    scrollTo.mockClear();
    const second = createTestContainer();
    try {
      await createSPA({ root: second.container, registry, dataRuntime });
      click(second.container.querySelectorAll('a')[0]!);
      await vi.waitFor(() =>
        expect(second.container.textContent).toBe('top page')
      );
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    } finally {
      second.cleanup();
    }
    void top;
  });

  describe('prefetch', () => {
    function app(prefetch?: 'intent' | 'render' | 'none') {
      const chunk = vi.fn(async () => ({
        default: () => <p>{routeData<string>()}</p>,
      }));
      const loader = vi.fn(async () => 'loaded');
      const registry = createRouteRegistry(() => {
        route('/', () => (
          <Link href="/lazy" prefetch={prefetch}>
            go
          </Link>
        ));
        route('/lazy', lazy(chunk as never), { loader, staleTimeMs: 60_000 });
      });
      return { chunk, loader, registry };
    }

    it('should not prefetch by default or with prefetch none', async () => {
      const { chunk, loader, registry } = app();
      await createSPA({ root: container, registry, dataRuntime });
      const link = container.querySelector('a')!;
      link.dispatchEvent(new Event('pointerenter'));
      link.dispatchEvent(new Event('focus'));
      await settle();
      expect(chunk).not.toHaveBeenCalled();
      expect(loader).not.toHaveBeenCalled();
    });

    it('should preload the chunk and warm the loader cache on pointer intent', async () => {
      const { chunk, loader, registry } = app('intent');
      await createSPA({ root: container, registry, dataRuntime });
      expect(chunk).not.toHaveBeenCalled();

      container.querySelector('a')!.dispatchEvent(new Event('pointerenter'));
      await vi.waitFor(() => expect(chunk).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));

      click(container.querySelector('a')!);
      await vi.waitFor(() => expect(container.textContent).toBe('loaded'));
      // The warmed, still fresh entry served the navigation.
      expect(loader).toHaveBeenCalledTimes(1);
      expect(chunk).toHaveBeenCalledTimes(1);
    });

    it('should prefetch on keyboard focus for intent', async () => {
      const { chunk, registry } = app('intent');
      await createSPA({ root: container, registry, dataRuntime });
      container.querySelector('a')!.dispatchEvent(new Event('focus'));
      await vi.waitFor(() => expect(chunk).toHaveBeenCalledTimes(1));
    });

    it('should prefetch when the link renders with prefetch render', async () => {
      const { chunk, loader, registry } = app('render');
      await createSPA({ root: container, registry, dataRuntime });
      await vi.waitFor(() => expect(chunk).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    });

    it('should ignore hrefs no route renders', async () => {
      const registry = createRouteRegistry(() => {
        route('/', () => (
          <div>
            <Link href="/nowhere" prefetch="render">
              nowhere
            </Link>
            <Link href="https://example.com/x" prefetch="render">
              away
            </Link>
          </div>
        ));
      });
      await createSPA({ root: container, registry, dataRuntime });
      await settle();
      expect(container.querySelectorAll('a')).toHaveLength(2);
    });
  });
});
