import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createSPA } from '../../../src/index';
import {
  route,
  getRoutes,
  clearRoutes,
  Link,
  navigate,
} from '../../../src/router';
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
    clearRoutes();
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

    await createSPA({ root: container, routes: getRoutes() });
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

    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    const link = container.querySelector('a') as HTMLAnchorElement | null;

    expect(link?.getAttribute('data-link-kind')).toBe('primary');
    expect(link?.getAttribute('aria-current')).toBe('page');
    expect(link?.getAttribute('title')).toBe('Go to About');
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

    await createSPA({ root: container, routes: getRoutes() });
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
});
