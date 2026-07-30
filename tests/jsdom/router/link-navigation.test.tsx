import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { route, Link, navigate } from '../../../src/router';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('Link component navigation', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    resetRouteState();
    // Reset URL to root for each test
    window.history.pushState({}, '', '/');
  });

  afterEach(() => cleanup());

  it('should navigate and update view when Link is clicked', async () => {
    route('/', () => (
      <div>
        <h1 data-testid="title">Home</h1>
        <Link href="/about">Go to About</Link>
      </div>
    ));

    route('/about', () => (
      <div>
        <h1 data-testid="title">About</h1>
        <Link href="/">Go to Home</Link>
      </div>
    ));

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    // Verify initial state
    const title = container.querySelector('[data-testid="title"]');
    expect(title?.textContent).toBe('Home');

    // Find and click the link
    const link = container.querySelector('a');
    expect(link).not.toBeNull();

    // Simulate a left-click
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link!.dispatchEvent(clickEvent);

    // Wait for microtask to process
    await Promise.resolve();
    await Promise.resolve(); // Double resolve for good measure

    // Check that view updated
    const newTitle = container.querySelector('[data-testid="title"]');
    expect(newTitle?.textContent).toBe('About');
  });

  it('should run consumer onPress then onClick before internal navigation', async () => {
    const calls: string[] = [];
    route('/', () => (
      <Link
        href="/about"
        onPress={() => calls.push('press')}
        onClick={() => calls.push('click')}
      >
        About
      </Link>
    ));
    route('/about', () => <div>{'About'}</div>);
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    (container.querySelector('a') as HTMLAnchorElement).click();
    await Promise.resolve();

    expect(calls).toEqual(['press', 'click']);
    expect(window.location.pathname).toBe('/about');
  });

  it('should let a consumer activation handler cancel navigation', async () => {
    route('/', () => (
      <Link href="/about" onClick={(event) => event.preventDefault()}>
        About
      </Link>
    ));
    route('/about', () => <div>{'About'}</div>);
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    (container.querySelector('a') as HTMLAnchorElement).click();
    await Promise.resolve();

    expect(window.location.pathname).toBe('/');
  });

  it('should let onPress cancel same-origin navigation', async () => {
    route('/', () => (
      <Link href="/about" onPress={(event) => event.preventDefault()}>
        About
      </Link>
    ));
    route('/about', () => <div>{'About'}</div>);
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    (container.querySelector('a') as HTMLAnchorElement).click();
    await Promise.resolve();

    expect(window.location.pathname).toBe('/');
  });

  it('should preserve browser downloads given a same-origin download link when it is clicked', async () => {
    route('/', () => <Link href="/files/report.pdf" download="report.pdf">Download</Link>);
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    container.querySelector('a')!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(window.location.pathname).toBe('/');
  });

  it('should invoke a consumer ref given an anchor Link when it mounts', async () => {
    let captured: HTMLAnchorElement | null = null;
    route('/', () => <Link href="/about" ref={(node: HTMLAnchorElement | null) => { captured = node; }}>About</Link>);
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    expect(captured).toBe(container.querySelector('a'));
  });

  it('should preserve custom anchor attributes', async () => {
    route('/', () => (
      <div>
        <Link
          href="/about"
          data-link-kind="primary"
          aria-current="page"
          title="Go to About"
        >
          Go to About
        </Link>
      </div>
    ));

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const link = container.querySelector('a') as HTMLAnchorElement | null;

    expect(link?.getAttribute('data-link-kind')).toBe('primary');
    expect(link?.getAttribute('aria-current')).toBe('page');
    expect(link?.getAttribute('title')).toBe('Go to About');
  });

  it('should ignore imperative DOM node children', async () => {
    const imperativeChild = document.createElement('span');
    imperativeChild.id = 'imperative-link-child';
    imperativeChild.textContent = 'Imperative child';

    route('/', () => (
      <div>
        <Link href="/about">{imperativeChild as unknown as string}</Link>
      </div>
    ));

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe('');
    expect(container.querySelector('#imperative-link-child')).toBeNull();
  });

  it('should navigate via navigate() in onClick handler', async () => {
    route('/', () => (
      <div>
        <h1 data-testid="title">Home</h1>
        <button data-testid="nav-btn" onClick={() => navigate('/about')}>
          Go to About
        </button>
      </div>
    ));

    route('/about', () => (
      <div>
        <h1 data-testid="title">About</h1>
      </div>
    ));

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    // Verify initial state
    expect(container.querySelector('[data-testid="title"]')?.textContent).toBe(
      'Home'
    );

    // Click the button
    const btn = container.querySelector(
      '[data-testid="nav-btn"]'
    ) as HTMLButtonElement;
    btn.click();

    // Wait for microtask
    await Promise.resolve();
    await Promise.resolve();

    // Check that view updated
    expect(container.querySelector('[data-testid="title"]')?.textContent).toBe(
      'About'
    );
  });

  it('should not intercept external links without an explicit target', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    route('/', () => (
      <div>
        <Link href="https://example.com/docs">External Docs</Link>
      </div>
    ));

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const link = container.querySelector('a');
    expect(link).not.toBeNull();

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    const dispatchResult = link!.dispatchEvent(clickEvent);

    expect(dispatchResult).toBe(true);
    expect(clickEvent.defaultPrevented).toBe(false);
    expect(pushStateSpy).not.toHaveBeenCalled();

    pushStateSpy.mockRestore();
  });
});
