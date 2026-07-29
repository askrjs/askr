import { describe, expect, it } from 'vite-plus/test';
import { defer, Resolve } from '../../../src/router/deferred';
import { createRouteRegistry, route } from '../../../src/router/route';
import { registerSSRStyle } from '../../../src';
import { renderRouteRequestToString, renderToString } from '../../../src/ssr';

function StyledBoundaryResult(): JSX.Element {
  registerSSRStyle('ak-style-deferred', '.ak-style-deferred{color:red}');
  return <div class="ak-style-deferred">done</div>;
}

describe('SSR style registrations', () => {
  it('should expose request-local styles to renderers', () => {
    const registry = createRouteRegistry(() => {
      route('/', () => {
        registerSSRStyle('ak-style-initial', '.ak-style-initial{color:blue}');
        return <div class="ak-style-initial">initial</div>;
      });
    });
    const rendererKey = 'doc' + 'ument';
    const html = renderToString({
      url: '/',
      registry,
      [rendererKey]: ({ appHtml, context }) =>
        `<html><head>${context.styles?.map((style) => `<style>${style.cssText}</style>`).join('')}</head><body>${appHtml}</body></html>`,
    });

    expect(html).toContain('.ak-style-initial{color:blue}');
  });

  it('should carry styles from deferred boundary renders into the patch', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => {
        const value = defer(Promise.resolve('done'));
        return (
          <Resolve value={value} pending={<div>pending</div>}>
            {() => <StyledBoundaryResult />}
          </Resolve>
        );
      });
    });

    const result = await renderRouteRequestToString({ url: '/', registry });

    expect(result.kind).toBe('render');
    if (result.kind !== 'render') return;
    expect(result.html).toContain('data-askr-deferred-style="true"');
    expect(result.html).toContain('.ak-style-deferred{color:red}');
    expect(result.html).toContain('data-askr-deferred-patch="d:0"');
  });
});
