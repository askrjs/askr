import { describe, expect, it } from 'vite-plus/test';

describe('public entrypoint resolution', () => {
  it('should resolve the remaining documented package subpaths', async () => {
    const [
      boot,
      components,
      control,
      data,
      fx,
      resources,
      router,
      ssr,
      ssg,
      jsxDevRuntime,
    ] = await Promise.all([
      import('@askrjs/askr/boot'),
      import('@askrjs/askr/components'),
      import('@askrjs/askr/control'),
      import('@askrjs/askr/data'),
      import('@askrjs/askr/fx'),
      import('@askrjs/askr/resources'),
      import('@askrjs/askr/router'),
      import('@askrjs/askr/ssr'),
      import('@askrjs/askr/ssg'),
      import('@askrjs/askr/jsx-dev-runtime'),
    ]);

    expect(typeof boot.createIsland).toBe('function');
    expect(typeof boot.createSPA).toBe('function');
    expect(typeof boot.hydrateSPA).toBe('function');
    expect(typeof boot.cleanupApp).toBe('function');
    expect(typeof boot.hasApp).toBe('function');

    expect(typeof components.ErrorBoundary).toBe('function');

    expect(typeof control.For).toBe('function');
    expect(typeof control.Show).toBe('function');
    expect(typeof control.Case).toBe('function');
    expect(typeof control.Match).toBe('function');

    expect(typeof data.createQuery).toBe('function');
    expect(typeof data.createMutation).toBe('function');
    expect(typeof data.invalidate).toBe('function');

    expect(typeof fx.debounce).toBe('function');
    expect(typeof fx.throttle).toBe('function');
    expect(typeof fx.once).toBe('function');
    expect(typeof fx.retry).toBe('function');
    expect(typeof fx.scheduleEventHandler).toBe('function');

    expect(typeof resources.resource).toBe('function');
    expect(typeof resources.on).toBe('function');
    expect(typeof resources.timer).toBe('function');
    expect(typeof resources.task).toBe('function');
    expect(typeof resources.stream).toBe('function');
    expect(typeof resources.capture).toBe('function');

    expect(typeof router.route).toBe('function');
    expect(typeof router.page).toBe('function');
    expect(typeof router.navigate).toBe('function');
    expect(typeof router.Link).toBe('function');
    expect(typeof router.Outlet).toBe('function');
    expect(typeof router.requireAuth).toBe('function');

    expect(typeof ssr.renderToString).toBe('function');
    expect(typeof ssr.renderToStringSync).toBe('function');
    expect(typeof ssr.renderToStream).toBe('function');
    expect(typeof ssr.resolveRequest).toBe('function');

    expect(typeof ssg.createStaticGen).toBe('function');

    expect(typeof jsxDevRuntime.jsxDEV).toBe('function');
    expect(!!jsxDevRuntime.Fragment).toBe(true);
  }, 20_000);
});
