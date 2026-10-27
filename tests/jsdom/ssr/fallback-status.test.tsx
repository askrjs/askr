import { describe, expect, it } from 'vite-plus/test';
import { renderRouteRequestToString } from '../../../src/ssr';
import { createRouteRegistry, fallback, route } from '../../../src/router';

/**
 * A host serving an SSR result must be able to send 404 for a miss that a
 * fallback rendered, without reading the private route record.
 */
describe('SSR fallback status', () => {
  const registry = createRouteRegistry(() => {
    route('/', () => <main>home</main>);
    fallback(() => <main>missing</main>);
  });

  it('should report status 404 for a fallback render', async () => {
    const result = await renderRouteRequestToString({ url: '/nope', registry });
    expect(result.kind).toBe('render');
    if (result.kind !== 'render') return;
    expect(result.status).toBe(404);
    expect(Object.keys(result)).toContain('status');
    expect(result.html).toContain('missing');
  });

  it('should report no status for a matched route', async () => {
    const result = await renderRouteRequestToString({ url: '/', registry });
    expect(result.kind).toBe('render');
    if (result.kind !== 'render') return;
    expect(result.status).toBeUndefined();
    expect(Object.keys(result)).not.toContain('status');
  });
});
