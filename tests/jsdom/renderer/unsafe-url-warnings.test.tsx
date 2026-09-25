import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { logger } from '../../../src/common/logger';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function renderClientAnchor(href: string): boolean {
  const { container, cleanup } = createTestContainer();
  try {
    createIsland({
      root: container,
      component: () => <a href={href}>link</a>,
    });
    flushScheduler();
    return container.querySelector('a')?.hasAttribute('href') ?? false;
  } finally {
    cleanup();
  }
}

function renderServerAnchor(href: string): string {
  return renderToStringSync(() => <a href={href}>link</a>, {});
}

function warnings(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
}

describe('unsafe URL development warnings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['vscode://file/src/app.ts', 'slack://open?team=T1'])(
    'should omit custom scheme %s on client and SSR and warn in development',
    (href) => {
      const warn = vi.spyOn(logger, 'warn');
      const scheme = href.slice(0, href.indexOf(':') + 1);

      expect(renderClientAnchor(href)).toBe(false);
      expect(warnings(warn)).toContain(`"${scheme}"`);
      expect(warnings(warn)).toContain('href');
      warn.mockClear();

      expect(renderServerAnchor(href)).toBe('<a>link</a>');
      expect(warnings(warn)).toContain(`"${scheme}"`);
      expect(warnings(warn)).toContain('href');
    }
  );

  it.each([
    ['JAVASCRIPT:alert(1)', 'javascript:'],
    ['  javascript:alert(1)', 'javascript:'],
    ['java\tscript:alert(1)', 'javascript:'],
    ['java\nscript:alert(1)', 'javascript:'],
    ['\u0000javascript:alert(1)', 'javascript:'],
    ['\u0085javascript:alert(1)', 'javascript:'],
    ['VbScript:msgbox(1)', 'vbscript:'],
    ['data:text/html,<script>alert(1)</script>', 'data:'],
    ['file:///etc/passwd', 'file:'],
  ])(
    'should still omit adversarial href %j on client and SSR',
    (href, scheme) => {
      const warn = vi.spyOn(logger, 'warn');

      expect(renderClientAnchor(href)).toBe(false);
      expect(renderServerAnchor(href)).toBe('<a>link</a>');
      expect(warnings(warn)).toContain(`"${scheme}"`);
    }
  );

  it('should keep entity-looking text inert on both sides', () => {
    const warn = vi.spyOn(logger, 'warn');
    const href = 'javascript&colon;alert(1)';

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => <a href={href}>link</a>,
      });
      flushScheduler();
      // setAttribute does not decode entities: the browser sees a relative path.
      expect(container.querySelector('a')?.getAttribute('href')).toBe(href);
    } finally {
      cleanup();
    }
    expect(renderServerAnchor(href)).toBe(
      '<a href="javascript&amp;colon;alert(1)">link</a>'
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('should warn for a script URL in a resource attribute', () => {
    const warn = vi.spyOn(logger, 'warn');
    const html = renderToStringSync(
      () => <iframe src="javascript:alert(1)" />,
      {}
    );
    expect(html).not.toContain('src');
    expect(warnings(warn)).toContain('"javascript:"');
    expect(warnings(warn)).toContain('src');
  });

  it('should warn for custom schemes through the attr: and prop: escapes', () => {
    const warn = vi.spyOn(logger, 'warn');
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => (
          <div>
            <a data-case="attr" attr:href="vscode://file/a.ts">
              attr
            </a>
            <a data-case="prop" prop:href="slack://open">
              prop
            </a>
          </div>
        ),
      });
      flushScheduler();
      for (const link of container.querySelectorAll('a')) {
        expect(link.hasAttribute('href')).toBe(false);
      }
    } finally {
      cleanup();
    }
    expect(warnings(warn)).toContain('"vscode:"');
    expect(warnings(warn)).toContain('"slack:"');
  });

  it('should not warn for allowed or relative URLs', () => {
    const warn = vi.spyOn(logger, 'warn');
    for (const href of [
      '/docs',
      '#section',
      'https://example.test/docs',
      'mailto:hello@example.test',
      'tel:+15551234567',
      'sms:+15551234567',
    ]) {
      expect(renderClientAnchor(href)).toBe(true);
      expect(renderServerAnchor(href)).toContain('href=');
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('should strip custom schemes silently in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(renderClientAnchor('vscode://file/src/app.ts')).toBe(false);
      expect(renderServerAnchor('slack://open')).toBe('<a>link</a>');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
