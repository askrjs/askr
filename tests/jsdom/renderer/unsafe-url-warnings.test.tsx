import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { state } from '../../../src';
import { logger } from '../../../src/common/logger';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// Warnings are deduplicated per attribute and value for the module's
// lifetime, so every test uses URLs no other test in this file renders.

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
    'should omit custom scheme %s on client and SSR and warn once',
    (href) => {
      const warn = vi.spyOn(logger, 'warn');
      const scheme = href.slice(0, href.indexOf(':') + 1);

      expect(renderClientAnchor(href)).toBe(false);
      expect(renderServerAnchor(href)).toBe('<a>link</a>');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warnings(warn)).toContain(`"${scheme}"`);
      expect(warnings(warn)).toContain('href');
    }
  );

  it('should warn from an SSR-only render', () => {
    const warn = vi.spyOn(logger, 'warn');
    expect(renderServerAnchor('vscode://ssr-only')).toBe('<a>link</a>');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warnings(warn)).toContain('"vscode:"');
  });

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
      expect(warn).toHaveBeenCalledTimes(1);
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

  it('should warn once across re-renders of the owning component', () => {
    const warn = vi.spyOn(logger, 'warn');
    const { container, cleanup } = createTestContainer();
    let bump!: () => void;
    function Page() {
      const count = state(0);
      bump = () => count.set((value) => value + 1);
      return (
        <a href="vscode://rerender" data-n={count()}>
          link
        </a>
      );
    }
    try {
      createIsland({ root: container, component: Page });
      flushScheduler();
      for (let i = 0; i < 5; i++) {
        bump();
        flushScheduler();
      }
      const anchor = container.querySelector('a')!;
      expect(anchor.getAttribute('data-n')).toBe('5');
      expect(anchor.hasAttribute('href')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('should warn when an update replaces a safe URL with a blocked one', () => {
    const warn = vi.spyOn(logger, 'warn');
    const { container, cleanup } = createTestContainer();
    let setHref!: (href: string) => void;
    function Page() {
      const href = state('/safe-before-update');
      setHref = (next) => href.set(next);
      return <a href={href()}>link</a>;
    }
    try {
      createIsland({ root: container, component: Page });
      flushScheduler();
      const anchor = container.querySelector('a')!;
      expect(anchor.getAttribute('href')).toBe('/safe-before-update');
      expect(warn).not.toHaveBeenCalled();

      setHref('slack://after-update');
      flushScheduler();
      expect(anchor.hasAttribute('href')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warnings(warn)).toContain('"slack:"');
    } finally {
      cleanup();
    }
  });

  it('should warn for a script URL in a resource attribute', () => {
    const warn = vi.spyOn(logger, 'warn');
    const html = renderToStringSync(
      () => <iframe src="javascript:alert('frame')" />,
      {}
    );
    expect(html).not.toContain('src');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warnings(warn)).toContain('"javascript:"');
    expect(warnings(warn)).toContain('src');
  });

  it('should warn for custom schemes through the client attr: and prop: escapes', () => {
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
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warnings(warn)).toContain('"vscode:"');
    expect(warnings(warn)).toContain('"slack:"');
  });

  it('should warn for a custom scheme through the SSR attr: escape', () => {
    const warn = vi.spyOn(logger, 'warn');
    const html = renderToStringSync(
      () => <a attr:href="vscode://ssr-attr">link</a>,
      {}
    );
    expect(html).toBe('<a>link</a>');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warnings(warn)).toContain('"vscode:"');
  });

  it.each([
    ['action', () => <form action="vscode://form-action">go</form>],
    [
      'formaction',
      () => (
        <button formAction="slack://form-action" type="submit">
          go
        </button>
      ),
    ],
    [
      'xlink:href',
      () => (
        <svg>
          <use xlinkHref="vscode://xlink" />
        </svg>
      ),
    ],
  ])('should warn for a blocked %s on client and SSR', (name, Component) => {
    const warn = vi.spyOn(logger, 'warn');

    const html = renderToStringSync(Component, {});
    expect(html).not.toContain(`${name}=`);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warnings(warn)).toContain(`${name}=`);
    warn.mockClear();

    // Same attribute and value: already reported by the SSR render above.
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: Component });
      flushScheduler();
      expect(container.innerHTML).not.toContain(`${name}=`);
    } finally {
      cleanup();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('should replace bidi and line separator controls in the warning preview', () => {
    const warn = vi.spyOn(logger, 'warn');
    expect(
      renderServerAnchor('vscode://a\u202Eb\u2066c\u2069d\u2028e\u2029f')
    ).toBe('<a>link</a>');
    const message = warnings(warn);
    expect(message).toContain('vscode://a?b?c?d?e?f');
    expect(message).not.toMatch(/[\u202A-\u202E\u2066-\u2069\u2028\u2029]/);
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
      expect(renderClientAnchor('vscode://production')).toBe(false);
      expect(renderServerAnchor('slack://production')).toBe('<a>link</a>');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe('trusted custom-scheme links', () => {
  it('should keep an href a ref sets when the element has no href prop', () => {
    const { container, cleanup } = createTestContainer();
    let bump!: () => void;
    function Page() {
      const count = state(0);
      bump = () => count.set((value) => value + 1);
      return (
        <a
          data-n={count()}
          ref={(el: HTMLAnchorElement | null) =>
            el?.setAttribute('href', 'vscode://file/trusted.ts')
          }
        >
          open
        </a>
      );
    }
    try {
      createIsland({ root: container, component: Page });
      flushScheduler();
      const anchor = container.querySelector('a')!;
      expect(anchor.getAttribute('href')).toBe('vscode://file/trusted.ts');

      for (let i = 0; i < 3; i++) {
        bump();
        flushScheduler();
      }
      expect(anchor.getAttribute('data-n')).toBe('3');
      expect(anchor.getAttribute('href')).toBe('vscode://file/trusted.ts');
    } finally {
      cleanup();
    }
  });
});
