import { afterEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA, hasApp } from '../../../src/boot';
import { createRouteRegistry, route } from '../../../src/router';

describe('boot root resolution', () => {
  afterEach(() => {
    cleanupApp('#app');
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
  });

  it('should resolve the documented hash-prefixed root given SPA boot', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const registry = createRouteRegistry(() => {
      route('/', () => <main>Northstar</main>);
    });

    await createSPA({ root: '#app', registry });

    expect(document.getElementById('app')?.textContent).toBe('Northstar');
    expect(hasApp('#app')).toBe(true);
  });
});
