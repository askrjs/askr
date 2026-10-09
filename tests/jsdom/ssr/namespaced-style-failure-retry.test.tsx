import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

const xlink = 'http://www.w3.org/1999/xlink';

afterEach(() => vi.restoreAllMocks());

describe.each(['hydrate', 'update'] as const)(
  'namespaced style failure and retry (%s)',
  (mode) => {
    it.each([undefined, '#old'])(
      'should restore namespace and reflected values after a mutating style failure (href=%s)',
      (initialHref) => {
        const container = document.createElement('div');
        const original = () => (
          <svg>
            <use id="link" xlinkHref={initialHref} />
            <text
              id="label"
              className="old"
              style={{ color: 'red', padding: '2px' }}
            >
              label
            </text>
          </svg>
        );
        if (mode === 'hydrate') {
          container.innerHTML = `<svg><use id="link"${initialHref ? ` xlink:href="${initialHref}"` : ''}></use><text id="label" class="old" style="color: red; padding: 2px;">label</text></svg>`;
        }
        const root = createRoot(container, { hydrate: mode === 'hydrate' });
        if (mode === 'update') root.render(original());
        const link = container.querySelector('use')!;
        const label = container.querySelector('text')!;
        if (mode === 'update')
          label.style.setProperty('margin', '7px', 'important');
        const styleBefore = label.getAttribute('style');
        const setProperty = label.style.setProperty.bind(label.style);
        const failure = new Error('style write failed after mutation');
        let armed = true;
        const writer = vi
          .spyOn(label.style, 'setProperty')
          .mockImplementation((name, value, priority) => {
            setProperty(name, value, priority);
            if (name === 'color' && armed) {
              armed = false;
              throw failure;
            }
          });
        const destination = () => (
          <svg>
            <use id="link" xlinkHref="#new" />
            <text
              id="label"
              className="new"
              style={{ color: 'blue !important' }}
            >
              label
            </text>
          </svg>
        );
        try {
          expect(() => root.prepare(destination()).commit()).toThrow(failure);
          expect(link.getAttributeNS(xlink, 'href')).toBe(initialHref ?? null);
          expect(label.getAttribute('class')).toBe('old');
          expect(label.getAttribute('style')).toBe(styleBefore);
          expect(container.querySelector('use')).toBe(link);
          expect(container.querySelector('text')).toBe(label);
          writer.mockRestore();
          root.render(destination());
          expect(container.querySelector('use')).toBe(link);
          expect(container.querySelector('text')).toBe(label);
          expect(link.getAttributeNS(xlink, 'href')).toBe('#new');
          expect(label.getAttribute('class')).toBe('new');
          expect(label.style.color).toBe('blue');
          expect(label.style.getPropertyPriority('color')).toBe('important');
          expect(label.style.padding).toBe('');
          if (mode === 'update')
            expect(label.style.getPropertyValue('margin')).toBe('7px');
          root.render(destination());
          expect(container.querySelector('text')).toBe(label);
        } finally {
          root.dispose();
        }
      }
    );
  }
);
