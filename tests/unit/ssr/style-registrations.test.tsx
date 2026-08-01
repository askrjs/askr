import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vite-plus/test';
import { defer, Resolve } from '../../../src/router/deferred';
import { createRouteRegistry, route } from '../../../src/router/route';
import { definePortal } from '../../../src/foundations/structures/portal';
import { registerSSRStyle } from '../../../src';
import { createStaticGen } from '../../../src/ssg';
import {
  renderRouteRequestToString,
  renderToString,
  renderToStringSync,
} from '../../../src/ssr';

const rendererKey = 'doc' + 'ument';

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
    const html = renderToString({
      url: '/',
      registry,
      [rendererKey]: ({ appHtml, context }) =>
        `<html><head>${context.styles?.map((style) => `<style>${style.cssText}</style>`).join('')}</head><body>${appHtml}</body></html>`,
    });

    expect(html).toContain('.ak-style-initial{color:blue}');
  });

  it('should warn given registered styles when the renderer drops them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const registry = createRouteRegistry(() => {
      route('/', () => {
        registerSSRStyle('ak-style-dropped', '.ak-style-dropped{color:red}');
        return <div class="ak-style-dropped">dropped</div>;
      });
    });

    try {
      const html = renderToString({
        url: '/',
        registry,
        [rendererKey]: ({ appHtml }) =>
          `<html><head></head><body>${appHtml}</body></html>`,
      });

      expect(html).toContain('ak-style-dropped');
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /dropped 1 registered SSR style.*ak-style-dropped.*styleRegistrationValidation.*off/i
        )
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('should accept represented styles and explicit omission', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const registry = createRouteRegistry(() => {
      route('/', () => {
        registerSSRStyle('ak-style-handled', '.ak-style-handled{color:green}');
        return <div class="ak-style-handled">handled</div>;
      });
    });

    try {
      const represented = renderToString({
        url: '/',
        registry,
        [rendererKey]: ({ appHtml, context }) =>
          `<html><head><style>${context.styles?.map((style) => style.cssText).join('\n')}</style></head><body>${appHtml}</body></html>`,
      });
      const intentionallyOmitted = renderToString({
        url: '/',
        registry,
        styleRegistrationValidation: 'off',
        [rendererKey]: ({ appHtml }) => `<html><body>${appHtml}</body></html>`,
      });

      expect(represented).toContain('.ak-style-handled{color:green}');
      expect(intentionallyOmitted).not.toContain(
        '.ak-style-handled{color:green}'
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('should fail deterministically given strict validation when registered styles are dropped', () => {
    const registry = createRouteRegistry(() => {
      route('/', () => {
        registerSSRStyle('ak-style-strict', '.ak-style-strict{color:purple}');
        return <div class="ak-style-strict">strict</div>;
      });
    });

    expect(() =>
      renderToString({
        url: '/',
        registry,
        styleRegistrationValidation: 'error',
        [rendererKey]: ({ appHtml }) => `<html><body>${appHtml}</body></html>`,
      })
    ).toThrow(/dropped 1 registered SSR style.*ak-style-strict/i);
  });

  it('should keep strict SSG validation request-local under concurrency', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'askr-style-validation-'));
    const registry = createRouteRegistry(() => {
      route('/represented', () => {
        registerSSRStyle(
          'ak-style-represented',
          '.ak-style-represented{color:green}'
        );
        return <div class="ak-style-represented">represented</div>;
      });
      route('/dropped', () => {
        registerSSRStyle('ak-style-dropped', '.ak-style-dropped{color:red}');
        return <div class="ak-style-dropped">dropped</div>;
      });
    });

    try {
      const result = await createStaticGen({
        registry,
        outputDir,
        concurrency: 2,
        styleRegistrationValidation: 'error',
        [rendererKey]: ({ appHtml, context }) =>
          context.pathname === '/represented'
            ? `<html><head><style>${context.styles?.map((style) => style.cssText).join('\n')}</style></head><body>${appHtml}</body></html>`
            : `<html><body>${appHtml}</body></html>`,
      }).generate();

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(
        result.routes.find((entry) => entry.path === '/represented')
      ).toMatchObject({
        status: 'success',
      });
      expect(
        result.routes.find((entry) => entry.path === '/dropped')
      ).toMatchObject({
        status: 'error',
        error: expect.stringMatching(/ak-style-dropped/),
      });
      expect(
        result.routes.find((entry) => entry.path === '/dropped')?.error
      ).not.toContain('ak-style-represented');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('should capture styles registered while resolving portals', () => {
    const OverlayPortal = definePortal();
    const StyledPortal = () => {
      registerSSRStyle('ak-style-portal', '.ak-style-portal{color:red}');
      return <div class="ak-style-portal">portal</div>;
    };
    const PortalWriter = () =>
      OverlayPortal.render({
        children: <StyledPortal />,
      });
    const styles: string[] = [];
    const html = renderToStringSync(
      () => (
        <main>
          <PortalWriter />
          <OverlayPortal />
        </main>
      ),
      {},
      {
        onContext: (context) =>
          styles.push(
            ...context.ssrStyles.values().map((style) => style.cssText)
          ),
      }
    );

    expect(html).toContain('ak-style-portal');
    expect(styles).toEqual(['.ak-style-portal{color:red}']);
  });

  it('should escape style raw-text terminators before exposing CSS', () => {
    const rendererKey = 'doc' + 'ument';
    const html = renderToString({
      url: '/',
      registry: createRouteRegistry(() => {
        route('/', () => {
          registerSSRStyle(
            'ak-style-safe',
            '</style><script>alert(1)</script>'
          );
          return <div>safe</div>;
        });
      }),
      [rendererKey]: ({ appHtml, context }) =>
        `<style>${context.styles?.[0]?.cssText}</style>${appHtml}`,
    });

    expect(html).toContain('<\\/style><script>alert(1)</script>');
    expect(html).not.toContain('</style><script>alert(1)</script>');
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
