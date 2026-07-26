import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { dispatch, renderRoute, type RenderResult } from '@askrjs/askr/testing';
import { createRoutedShellRegistry } from '../../../examples/platform-recipes/routed-shell';
import {
  createSearchRegistry,
  type SearchLoader,
} from '../../../examples/platform-recipes/browser-search';
import { createErrorBoundaryRegistry } from '../../../examples/platform-recipes/error-boundaries';

let mounted: RenderResult | undefined;

async function settle(result: RenderResult): Promise<void> {
  await Promise.resolve();
  result.flush();
  await Promise.resolve();
  result.flush();
}

afterEach(() => {
  mounted?.cleanup();
  mounted = undefined;
  document.title = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('verified platform recipes through the public harness', () => {
  it('should preserve a routed shell and update its active navigation', async () => {
    const routeCommitted = vi.fn();
    mounted = await renderRoute({
      registry: createRoutedShellRegistry(routeCommitted),
      url: '/dashboard',
    });

    const shell = mounted.root.querySelector('[data-recipe-shell]');
    const dashboard = mounted.root.querySelector(
      'a[href="/dashboard"]'
    ) as HTMLAnchorElement;
    const settings = mounted.root.querySelector(
      'a[href="/settings"]'
    ) as HTMLAnchorElement;

    expect(shell).not.toBeNull();
    expect(dashboard.getAttribute('aria-current')).toBe('page');
    expect(settings.hasAttribute('aria-current')).toBe(false);

    dispatch(settings, 'click');
    await settle(mounted);

    expect(window.location.pathname).toBe('/settings');
    expect(mounted.root.querySelector('[data-recipe-shell]')).toBe(shell);
    expect(settings.getAttribute('aria-current')).toBe('page');
    expect(dashboard.hasAttribute('aria-current')).toBe(false);
    expect(routeCommitted).toHaveBeenCalledWith('/settings');
  });

  it('should update route-driven search and clean up browser work', async () => {
    const signals: AbortSignal[] = [];
    const load: SearchLoader = vi.fn(async (query, signal) => {
      signals.push(signal);
      return query ? [{ id: query, label: `Result: ${query}` }] : [];
    });

    mounted = await renderRoute({
      registry: createSearchRegistry(load),
      url: '/search',
    });
    await settle(mounted);

    expect(mounted.root.textContent).toContain('No results found.');

    const input = mounted.root.querySelector('input') as HTMLInputElement;
    input.value = '  platform  ';
    dispatch(input, 'input');
    await settle(mounted);

    expect(window.location.search).toBe('?q=platform');
    expect(input.value).toBe('platform');
    expect(mounted.root.textContent).toContain('Result: platform');

    dispatch(window, 'keydown', { ctrlKey: true, key: 'k' });
    mounted.flush();
    expect(
      mounted.root.querySelector('[role="dialog"]')?.getAttribute('aria-label')
    ).toBe('Command palette');

    mounted.cleanup();
    mounted = undefined;
    expect(signals.at(-1)?.aborted).toBe(true);
  });

  it('should expose search failure, retry, and empty states', async () => {
    let attempts = 0;
    const load: SearchLoader = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('offline');
      }
      return [];
    });

    mounted = await renderRoute({
      registry: createSearchRegistry(load),
      url: '/search?q=missing',
    });
    await settle(mounted);

    expect(mounted.root.querySelector('[role="alert"]')?.textContent).toContain(
      'Search is unavailable.'
    );

    dispatch(mounted.root.querySelector('button')!, 'click');
    await settle(mounted);

    expect(attempts).toBe(2);
    expect(mounted.root.textContent).toContain('No results found.');
  });

  it('should retain route-level recovery navigation after a route failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mounted = await renderRoute({
      registry: createErrorBoundaryRegistry(),
      url: '/broken',
    });

    expect(mounted.root.querySelector('[role="alert"]')?.textContent).toContain(
      'This page could not be displayed.'
    );
    expect(mounted.root.querySelector('a[href="/"]')?.textContent).toBe(
      'Return home'
    );
  });
});
