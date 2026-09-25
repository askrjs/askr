import { afterEach, describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { getActiveRenderContext } from '../../../src/common/render-context';
import { renderToString } from '../../../src/ssr';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

/**
 * `verifyMarkup` must compare the server HTML with what the client renderer
 * produces, not with a second server render: renderer-level differences
 * between SSR and the DOM renderer are exactly what it exists to report.
 */
describe('hydration markup verification parity', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  function setup(handler: () => unknown, html?: string) {
    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    const registry = routeRegistryFromTable([
      { path: '/', handler: handler as never },
    ]);
    container.innerHTML = html ?? renderToString({ url: '/', registry });
    return { container, registry };
  }

  it('should reject when the client renderer output diverges from the server HTML', async () => {
    // Renders one way under the SSR renderer and another under the DOM
    // renderer; a server-only re-render cannot see the difference.
    const Divergent = () => (
      <p>{getActiveRenderContext() ? 'server' : 'client'}</p>
    );
    const { container, registry } = setup(Divergent);
    expect(container.innerHTML).toBe('<p>server</p>');

    await expect(
      hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  });

  it('should reject a client divergence when hydration is deferred until idle', async () => {
    const Divergent = () => (
      <p>{getActiveRenderContext() ? 'server' : 'client'}</p>
    );
    const { container, registry } = setup(Divergent);

    await expect(
      hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true, deferUntilIdle: true },
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  });

  it('should reject when a function child renders content the server HTML lacks', async () => {
    const WithFunctionChild = () => <p>{() => 'client text'}</p>;
    const { container, registry } = setup(WithFunctionChild, '<p></p>');

    await expect(
      hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  });

  it('should treat the server and client serializations of a style object as equal', async () => {
    const Styled = () => (
      <p style={{ color: 'red', marginTop: 0, opacity: 0.5 }}>styled</p>
    );
    const { container, registry } = setup(Styled);

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    const style = (container.querySelector('p') as HTMLElement).style;
    expect(style.color).toBe('red');
    expect(style.marginTop).toBe('0px');
    expect(style.opacity).toBe('0.5');
  });

  it('should still reject a style value that differs from the client render', async () => {
    const Styled = () => <p style={{ color: 'red' }}>styled</p>;
    const { container, registry } = setup(
      Styled,
      '<p style="color: blue;">styled</p>'
    );

    await expect(
      hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  });
});
