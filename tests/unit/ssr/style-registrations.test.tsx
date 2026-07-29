import { describe, expect, it } from 'vite-plus/test';
import { defer, Resolve } from '../../../src/router/deferred';
import { createRouteRegistry, route } from '../../../src/router/route';
import { getRenderContext, renderRouteRequestToString } from '../../../src/ssr';

function StyledBoundaryResult(): JSX.Element {
  getRenderContext()?.ssrStyles.set('ak-style-deferred', {
    id: 'ak-style-deferred',
    cssText: '.ak-style-deferred{color:red}',
  });
  return <div class="ak-style-deferred">done</div>;
}

describe('SSR style registrations', () => {
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
