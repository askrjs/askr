import { describe, expect, it } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { createRoot } from '../../../src/core/dom/root';
import { jsx as typedJsx, type JSXElement } from '../../../src/jsx/jsx-runtime';

// `xmp`, `noembed` and `noframes` are not in the typed intrinsic elements.
const jsx = typedJsx as unknown as (
  type: unknown,
  props: Record<string, unknown> | null
) => JSXElement;

function parse(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

describe('SSR raw text elements the parser reads as RAWTEXT', () => {
  const text = 'a & b < c > d "q"';

  it.each(['xmp', 'noembed', 'noframes', 'iframe'])(
    'should emit <%s> text verbatim instead of entity-escaping it',
    (tag) => {
      const html = renderToStringSync(() =>
        jsx('section', { children: jsx(tag, { children: text }) })
      );
      expect(html).toContain(`<${tag}>${text}</${tag}>`);
      expect(parse(html).querySelector(tag)!.textContent).toBe(text);
    }
  );

  it('should not let text close the element early', () => {
    const html = renderToStringSync(() =>
      jsx('section', {
        children: jsx('xmp', {
          children: 'x </xmp><img src=y onerror=alert(1)> z',
        }),
      })
    );
    const fragment = parse(html);
    expect(fragment.querySelector('img')).toBeNull();
    expect(fragment.querySelector('xmp')).not.toBeNull();
  });

  it('should not let an end tag form across adjacent text children', () => {
    const html = renderToStringSync(() =>
      jsx('section', {
        children: jsx('xmp', {
          children: ['x <', '/xmp><img src=y onerror=alert(1)>'],
        }),
      })
    );
    const fragment = parse(html);
    expect(fragment.querySelector('img')).toBeNull();
    expect(fragment.querySelector('xmp')).not.toBeNull();
  });

  it('should keep escaping text in an element nested in xmp', () => {
    const html = renderToStringSync(() =>
      jsx('xmp', { children: jsx('b', { children: 'a < b' }) })
    );
    expect(html).toContain('a &lt; b');
  });

  it('should hydrate a server xmp text in place', () => {
    const html = renderToStringSync(() => (
      <section>{jsx('xmp', { children: text })}</section>
    ));
    const container = document.createElement('div');
    container.innerHTML = html;
    const node = container.querySelector('xmp')!.firstChild;
    const root = createRoot(container, { hydrate: true });
    root.render(<section>{jsx('xmp', { children: text })}</section>);
    expect(container.querySelector('xmp')!.firstChild === node).toBe(true);
    expect(container.querySelector('xmp')!.textContent).toBe(text);
    root.dispose();
  });
});
