import { describe, expect, it } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { state } from '../../../src/runtime/reactivity/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('unsafe URL-bearing attributes beyond href', () => {
  it.each(['javascript:alert(1)', 'data:text/html,phish'])(
    'should omit an unsafe formAction on a client-rendered button (%s)',
    (unsafe) => {
      const { container, cleanup } = createTestContainer();
      try {
        createIsland({
          root: container,
          component: () => (
            <button formAction={unsafe} type="submit">
              go
            </button>
          ),
        });
        flushScheduler();
        expect(
          container.querySelector('button')?.hasAttribute('formaction')
        ).toBe(false);

        const html = renderToStringSync(
          () => (
            <button formAction={unsafe} type="submit">
              go
            </button>
          ),
          {}
        );
        expect(html).not.toContain('formaction');
      } finally {
        cleanup();
      }
    }
  );

  it.each(['javascript:alert(1)', 'data:text/html,phish'])(
    'should omit an unsafe action on a client-rendered form (%s)',
    (unsafe) => {
      const { container, cleanup } = createTestContainer();
      try {
        createIsland({
          root: container,
          component: () => <form action={unsafe}>go</form>,
        });
        flushScheduler();
        expect(container.querySelector('form')?.hasAttribute('action')).toBe(
          false
        );

        const html = renderToStringSync(
          () => <form action={unsafe}>go</form>,
          {}
        );
        expect(html).not.toContain(' action');
      } finally {
        cleanup();
      }
    }
  );

  it('should omit an unsafe xlink:href on a client-rendered SVG <use> element', () => {
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => (
          <svg>
            <use {...{ 'xlink:href': 'javascript:alert(1)' }} />
          </svg>
        ),
      });
      flushScheduler();
      expect(container.querySelector('use')?.hasAttribute('xlink:href')).toBe(
        false
      );

      const html = renderToStringSync(
        () => (
          <svg>
            <use {...{ 'xlink:href': 'javascript:alert(1)' }} />
          </svg>
        ),
        {}
      );
      expect(html).not.toContain('xlink:href');
    } finally {
      cleanup();
    }
  });

  it('should preserve safe formAction and xlink:href values', () => {
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => (
          <div>
            <button formAction="/submit" type="submit">
              go
            </button>
            <svg>
              <use {...{ 'xlink:href': '#icon' }} />
            </svg>
          </div>
        ),
      });
      flushScheduler();
      expect(
        container.querySelector('button')?.getAttribute('formaction')
      ).toBe('/submit');
      expect(container.querySelector('use')?.getAttribute('xlink:href')).toBe(
        '#icon'
      );
    } finally {
      cleanup();
    }
  });

  it.each([
    ['iframe', 'src', 'javascript:alert(1)'],
    ['iframe', 'src', ' JaVa\nScRiPt:alert(1)'],
    ['embed', 'src', 'vbscript:msgbox(1)'],
    ['object', 'data', 'javascript:alert(1)'],
  ])(
    'should omit a script-scheme <%s %s> on client and server (%s)',
    (tag, attribute, unsafe) => {
      const { container, cleanup } = createTestContainer();
      const Tag = tag as 'iframe';
      const props = { [attribute]: unsafe };
      try {
        createIsland({
          root: container,
          component: () => <Tag {...props} />,
        });
        flushScheduler();
        expect(container.querySelector(tag)?.hasAttribute(attribute)).toBe(
          false
        );

        const html = renderToStringSync(() => <Tag {...props} />, {});
        expect(html).not.toContain(`${attribute}=`);
      } finally {
        cleanup();
      }
    }
  );

  it('should remove a src that becomes script-scheme after an update', () => {
    const { container, cleanup } = createTestContainer();
    let setSrc!: (value: string) => void;
    try {
      createIsland({
        root: container,
        component: () => {
          const [src, set] = state('https://example.com/embed');
          setSrc = set;
          return <iframe src={src()} />;
        },
      });
      flushScheduler();
      expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://example.com/embed'
      );

      setSrc('javascript:alert(1)');
      flushScheduler();
      expect(container.querySelector('iframe')?.hasAttribute('src')).toBe(
        false
      );
    } finally {
      cleanup();
    }
  });

  it.each([
    '/images/logo.png',
    'https://example.com/a.png',
    'data:image/png;base64,iVBORw0KGgo=',
    'blob:https://example.com/0f1c2d',
  ])('should preserve resource URLs that cannot run script (%s)', (safe) => {
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => <img src={safe} alt="" />,
      });
      flushScheduler();
      expect(container.querySelector('img')?.getAttribute('src')).toBe(safe);

      const html = renderToStringSync(() => <img src={safe} alt="" />, {});
      expect(html).toContain('src="');
    } finally {
      cleanup();
    }
  });
});
