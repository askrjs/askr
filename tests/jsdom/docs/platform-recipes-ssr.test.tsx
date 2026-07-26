import { describe, expect, it, vi } from 'vite-plus/test';
import { renderToString, renderToStringSync } from '@askrjs/askr/ssr';
import {
  createSearchRegistry,
  createSearchRenderData,
  type SearchLoader,
} from '../../../examples/platform-recipes/browser-search';
import { LocalBoundaryRecipe } from '../../../examples/platform-recipes/error-boundaries';
import { createRoutedShellRegistry } from '../../../examples/platform-recipes/routed-shell';

describe('verified platform recipe server rendering', () => {
  it('should render active routed navigation without client lifecycle work', () => {
    const routeCommitted = vi.fn();
    const html = renderToString({
      registry: createRoutedShellRegistry(routeCommitted),
      url: '/settings',
    });

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('>Settings</a>');
    expect(routeCommitted).not.toHaveBeenCalled();
  });

  it('should render search from supplied data without touching browser globals', () => {
    const load: SearchLoader = vi.fn(() =>
      Promise.resolve([{ id: 'client-only', label: 'Client only' }])
    );
    const html = renderToString({
      registry: createSearchRegistry(load),
      url: '/search?q=platform',
      data: createSearchRenderData([{ id: 'static', label: 'Static result' }]),
    });

    expect(html).toContain('value="platform"');
    expect(html).toContain('Static result');
    expect(load).not.toHaveBeenCalled();
  });

  it('should render a local recovery boundary on the server', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToStringSync(LocalBoundaryRecipe);

    expect(html).toContain('Account overview');
    expect(html).toContain('Activity could not be loaded.');
  });
});
