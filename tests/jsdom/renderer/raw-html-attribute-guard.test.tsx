import { describe, it, expect, afterEach } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * `srcdoc` is a raw HTML sink like `innerHTML`. `prop:srcdoc` is already
 * ignored; the attribute form and `attr:srcdoc` must agree with it on the
 * client and in SSR. `blob:` URLs are same-origin object URLs the app created
 * itself, so `href` keeps them (download links, generated files).
 */
describe('raw HTML attribute guard and blob hrefs', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  const markup = '<img src=x onerror=alert(1)>';

  it('should omit the srcdoc attribute on client-rendered iframes', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    createIsland({
      root: mounted.container,
      component: () => (
        <div>
          <iframe title="a" srcdoc={markup} />
          <iframe title="b" attr:srcdoc={markup} />
        </div>
      ),
    });
    flushScheduler();
    const frames = mounted.container.querySelectorAll('iframe');
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame.hasAttribute('srcdoc')).toBe(false);
    }
  });

  it('should omit the srcdoc attribute in SSR', () => {
    const html = renderToStringSync(() => (
      <div>
        <iframe title="a" srcdoc={markup} />
        <iframe title="b" attr:srcdoc={markup} />
      </div>
    ));
    expect(html).not.toContain('srcdoc');
    expect(html).not.toContain('onerror');
    expect(html).toContain('title="a"');
  });

  it('should preserve blob: hrefs on the client and in SSR', () => {
    const href = 'blob:https://example.com/0f1c2d3e';
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    createIsland({
      root: mounted.container,
      component: () => (
        <a href={href} download="report.csv">
          download
        </a>
      ),
    });
    flushScheduler();
    expect(mounted.container.querySelector('a')?.getAttribute('href')).toBe(
      href
    );
    const html = renderToStringSync(() => (
      <a href={href} download="report.csv">
        download
      </a>
    ));
    expect(html).toContain(`href="${href}"`);
  });
});
