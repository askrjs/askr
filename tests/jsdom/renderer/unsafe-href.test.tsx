import { describe, expect, it } from 'vite-plus/test';
import { Link } from '../../../src/components/link';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('unsafe href schemes', () => {
  it.each([
    'javascript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,phish',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('should reject unsafe Link href %s', (href) => {
    expect(() => Link({ href, children: 'unsafe' })).toThrow(
      'unsafe URL scheme'
    );
  });

  it('should omit unsafe intrinsic anchor hrefs in client and SSR output', () => {
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => <a href="javascript:alert(1)">unsafe</a>,
      });
      flushScheduler();
      expect(container.querySelector('a')?.hasAttribute('href')).toBe(false);

      const html = renderToStringSync(
        () => <a href="data:text/html,phish">unsafe</a>,
        {}
      );
      expect(html).toBe('<a>unsafe</a>');
    } finally {
      cleanup();
    }
  });

  it('should reject case-insensitive intrinsic href attribute names', () => {
    const unsafeProps = { HREF: 'javascript:alert(1)' };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => <a {...unsafeProps}>unsafe</a>,
      });
      flushScheduler();
      expect(container.querySelector('a')?.hasAttribute('href')).toBe(false);

      const html = renderToStringSync(
        () => <a {...unsafeProps}>unsafe</a>,
        {}
      );
      expect(html).toBe('<a>unsafe</a>');
    } finally {
      cleanup();
    }
  });

  it('should preserve relative, web, mail, and telephone hrefs', () => {
    for (const href of [
      '/docs',
      '#section',
      'https://example.test/docs',
      'mailto:hello@example.test',
      'tel:+15551234567',
    ]) {
      expect(() => Link({ href, children: 'safe' })).not.toThrow();
    }
  });
});
