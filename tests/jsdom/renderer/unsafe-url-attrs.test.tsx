import { describe, expect, it } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
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
});
