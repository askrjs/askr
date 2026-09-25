import { afterEach, describe, expect, it } from 'vite-plus/test';
import { parseFragment } from 'parse5';
import { state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
import { For, Show } from '../../../src/control';
import { ErrorBoundary } from '../../../src/components/error-boundary';
import {
  Portal,
  _resetDefaultPortal,
  definePortal,
} from '../../../src/foundations/structures/portal';
import { jsx } from '../../../src/jsx/jsx-runtime';
import { renderToString, renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

/** Parse SSR markup the way a browser would and return the fragment. */
function parse(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

describe('SSR raw text elements (<script>, <style>)', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('should emit <style> text verbatim instead of entity-escaping it', () => {
    const css = 'ul > li + li { content: "a & b"; }';
    const html = renderToStringSync(() => <style>{css}</style>);

    expect(html).toContain(`<style>${css}</style>`);
    expect(parse(html).querySelector('style')!.textContent).toBe(css);
  });

  it('should emit <script> text verbatim instead of entity-escaping it', () => {
    const js = 'if (a < b && c > d) { run("x & y"); }';
    const html = renderToStringSync(() => <script type="module">{js}</script>);

    expect(html).toContain(`<script type="module">${js}</script>`);
    expect(parse(html).querySelector('script')!.textContent).toBe(js);
  });

  it('should concatenate multiple text and number children verbatim', () => {
    const html = renderToStringSync(() => (
      <style>
        {'a > b { z-index: '}
        {3}
        {'; }'}
      </style>
    ));

    expect(parse(html).querySelector('style')!.textContent).toBe(
      'a > b { z-index: 3; }'
    );
  });

  it('should render raw text through component and fragment children', () => {
    const Rule = (props: { selector: string }) => `${props.selector} > b {}`;
    const html = renderToStringSync(() => (
      <style>
        <>
          <Rule selector="a" />
        </>
      </style>
    ));

    expect(parse(html).querySelector('style')!.textContent).toBe('a > b {}');
  });

  it('should emit raw text through the route renderer too', () => {
    const App = () => (
      <main>
        <style>{'a > b {}'}</style>
      </main>
    );
    const html = renderToString({
      url: '/',
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
    });

    expect(html).toContain('<style>a > b {}</style>');
  });

  it.each(['</script>', '</SCRIPT>', '</ScRiPt >', '</script\n>'])(
    'should not let %j break out of a <script>',
    (closer) => {
      const payload = `var s = "${closer}<img src=x onerror=alert(1)>";`;
      const html = renderToStringSync(() => (
        <div>
          <script>{payload}</script>
        </div>
      ));
      const fragment = parse(html);

      expect(fragment.querySelectorAll('script')).toHaveLength(1);
      expect(fragment.querySelector('img')).toBeNull();
      expect(html.toLowerCase()).not.toContain('</script>"');
      // The closing sequence is neutralized with a JS-equivalent escape.
      expect(fragment.querySelector('script')!.textContent).toContain(
        '<\\/' + closer.slice(2)
      );
    }
  );

  it('should not let a split closing sequence across children break out of a <script>', () => {
    const html = renderToStringSync(() => (
      <div>
        <script>
          {'var s = "</scr'}
          {'ipt><img src=x onerror=alert(1)>";'}
        </script>
      </div>
    ));
    const fragment = parse(html);

    expect(fragment.querySelectorAll('script')).toHaveLength(1);
    expect(fragment.querySelector('img')).toBeNull();
  });

  it('should neutralize <!-- and <script inside a <script> so the parser cannot enter the double-escaped state', () => {
    const payload = 'var s = "<!--<script>";';
    const html = renderToStringSync(() => (
      <div>
        <script>{payload}</script>
        <p id="after">after</p>
      </div>
    ));
    const fragment = parse(html);
    const script = fragment.querySelector('script')!;

    // Without neutralization the parser swallows everything after the
    // script into its text, including the trailing <p>.
    expect(fragment.querySelector('#after')?.textContent).toBe('after');
    expect(script.textContent).not.toContain('<!--');
    expect(script.textContent!.toLowerCase()).not.toContain('<script');
    // The escapes are string-literal equivalents of the original text.
    expect(new Function(`${script.textContent}; return s;`)()).toBe(
      '<!--<script>'
    );
  });

  it('should keep escaped script strings equal to the original value', () => {
    const payload = 'var s = "</script><!--<SCRIPT>";';
    const html = renderToStringSync(() => <script>{payload}</script>);
    const script = parse(html).querySelector('script')!;

    expect(new Function(`${script.textContent}; return s;`)()).toBe(
      '</script><!--<SCRIPT>'
    );
  });

  it.each(['</style>', '</STYLE>', '</StYlE >'])(
    'should not let %j break out of a <style>',
    (closer) => {
      const payload = `a::after { content: "${closer}<img src=x onerror=alert(1)>"; }`;
      const html = renderToStringSync(() => (
        <div>
          <style>{payload}</style>
        </div>
      ));
      const fragment = parse(html);

      expect(fragment.querySelectorAll('style')).toHaveLength(1);
      expect(fragment.querySelector('img')).toBeNull();
      // Every `<` is a CSS escape, equal to `<` inside the CSS string.
      expect(fragment.querySelector('style')!.textContent).toContain(
        '\\3c ' + closer.slice(1)
      );
    }
  );

  it('should keep dangerouslySetInnerHTML verbatim inside a <script>', () => {
    const html = renderToStringSync(() => (
      <script dangerouslySetInnerHTML={{ __html: 'a < b && c > d' }} />
    ));

    expect(html).toContain('<script>a < b && c > d</script>');
  });

  it('should keep JSON script content valid when neutralizing breakout sequences', () => {
    const data = { html: '</script><!--<SCRIPT>', ok: 'a > b & c' };
    const html = renderToStringSync(() => (
      <div>
        <script type="application/json">{JSON.stringify(data)}</script>
        <script type="importmap">{JSON.stringify({ imports: data })}</script>
      </div>
    ));
    const scripts = parse(html).querySelectorAll('script');

    expect(scripts).toHaveLength(2);
    expect(JSON.parse(scripts[0].textContent!)).toEqual(data);
    expect(JSON.parse(scripts[1].textContent!)).toEqual({ imports: data });
  });

  it('should reject element children inside a raw text element with a readable message', () => {
    expect(() =>
      renderToStringSync(() => (
        <style>
          <b>nope</b>
        </style>
      ))
    ).toThrow(
      'SSR: <style> children must be text, but received an element <b>.'
    );
  });

  it('should collect raw text through Show and For boundaries', () => {
    const html = renderToStringSync(() => (
      <div>
        <style>
          <Show when={true} fallback={'hidden'}>
            {'a > b {}'}
          </Show>
          <Show when={false}>{'never'}</Show>
        </style>
        <script>
          <For each={['a < b', 'c > d']} by={(value) => value}>
            {(value) => `${value};`}
          </For>
        </script>
      </div>
    ));
    const fragment = parse(html);

    expect(fragment.querySelector('style')!.textContent).toBe('a > b {}');
    expect(fragment.querySelector('script')!.textContent).toBe('a < b;c > d;');
  });

  it('should render an ErrorBoundary fallback as raw text', () => {
    const Boom = (): string => {
      throw new Error('boom');
    };
    const html = renderToStringSync(() => (
      <style>
        <ErrorBoundary fallback={() => 'a > b {}'}>
          <Boom />
        </ErrorBoundary>
      </style>
    ));

    expect(parse(html).querySelector('style')!.textContent).toBe('a > b {}');
  });

  it('should treat function and state children like the ordinary text path', () => {
    function App() {
      const css = state('a > b {}');
      const read = () => 'c > d {}';
      return (
        <main>
          <style>
            {read}
            {css}
          </style>
          <p>
            {read}
            {css}
          </p>
        </main>
      );
    }

    const html = renderToStringSync(() => <App />);
    const fragment = parse(html);

    expect(fragment.querySelector('style')!.textContent).toBe(
      fragment.querySelector('p')!.textContent
    );
  });

  it('should hydrate server <style>/<script> text in place because it matches the client text', async () => {
    const css = 'ul > li + li { color: red; }';
    const js = 'window.__raw = 1 < 2 && 3 > 2;';
    let bump!: () => void;

    function App() {
      const label = state('ready');
      bump = () => label.set('updated');
      return (
        <div data-app-root={'true'}>
          <style>{css}</style>
          <script type="application/json">{js}</script>
          <span data-app-label={'true'}>{label()}</span>
        </div>
      );
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    container.innerHTML = renderToStringSync(() => <App />);

    const serverStyle = container.querySelector('style')!;
    const serverScript = container.querySelector('script')!;
    const serverLabel = container.querySelector('[data-app-label]')!;
    // What the client renderer would create as the text node's data.
    expect(serverStyle.textContent).toBe(css);
    expect(serverScript.textContent).toBe(js);

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
    });

    expect(container.querySelector('style')).toBe(serverStyle);
    expect(container.querySelector('script')).toBe(serverScript);
    expect(container.querySelector('[data-app-label]')).toBe(serverLabel);

    bump();
    flushScheduler();

    expect(serverLabel.textContent).toBe('updated');
    expect(serverStyle.textContent).toBe(css);
    expect(serverScript.textContent).toBe(js);
  });
});

describe('SSR <script>/<style> in foreign content (SVG, MathML)', () => {
  const payload = '<img src=x onerror=alert(1)>';

  afterEach(() => {
    _resetDefaultPortal();
  });

  function expectInert(html: string, text: string): void {
    const fragment = parse(html);
    expect(fragment.querySelector('img')).toBeNull();
    expect(
      fragment.querySelector('svg style, svg script, math style')!.textContent
    ).toBe(text);
  }

  it.each([
    [
      'svg style',
      () => (
        <svg>
          <style>{payload}</style>
        </svg>
      ),
    ],
    [
      'svg script',
      () => (
        <svg>
          <script>{payload}</script>
        </svg>
      ),
    ],
    [
      'math style',
      () => (
        <math>
          <style>{payload}</style>
        </math>
      ),
    ],
    [
      'nested svg style',
      () => (
        <svg>
          <g>
            <style>{payload}</style>
          </g>
        </svg>
      ),
    ],
    [
      'upper-case SVG',
      () => jsx('SVG', { children: jsx('style', { children: payload }) }),
    ],
  ])('should keep %s text entity-escaped', (_name, render) => {
    const html = renderToStringSync(render as () => never);

    expect(html).toContain('>&lt;img src=x onerror=alert(1)&gt;</');
    expectInert(html, payload);
  });

  it('should round-trip entity text inside foreign <style> as before', () => {
    const html = renderToStringSync(() => (
      <svg>
        <style>{'a &lt; b > c'}</style>
      </svg>
    ));

    expect(html).toBe('<svg><style>a &amp;lt; b &gt; c</style></svg>');
    expectInert(html, 'a &lt; b > c');
  });

  it('should keep mglyph and non-HTML annotation-xml children in MathML', () => {
    const html = renderToStringSync(() => (
      <math>
        <mi>
          <mglyph>
            <style>{payload}</style>
          </mglyph>
        </mi>
        <annotation-xml encoding="application/mathml+xml">
          <style>{payload}</style>
        </annotation-xml>
      </math>
    ));

    const fragment = parse(html);
    expect(fragment.querySelector('img')).toBeNull();
    for (const style of Array.from(fragment.querySelectorAll('style'))) {
      expect(style.textContent).toBe(payload);
    }
  });

  it.each([
    [
      'svg foreignObject',
      () => (
        <svg>
          <foreignObject>
            <style>{'a > b {}'}</style>
          </foreignObject>
        </svg>
      ),
    ],
    [
      'svg desc',
      () => (
        <svg>
          <desc>
            <style>{'a > b {}'}</style>
          </desc>
        </svg>
      ),
    ],
    [
      'math annotation-xml text/html',
      () => (
        <math>
          <annotation-xml encoding="TEXT/HTML">
            <style>{'a > b {}'}</style>
          </annotation-xml>
        </math>
      ),
    ],
    [
      'math mtext',
      () => (
        <math>
          <mtext>
            <style>{'a > b {}'}</style>
          </mtext>
        </math>
      ),
    ],
    [
      'svg inside annotation-xml, then foreignObject',
      () => (
        <math>
          <annotation-xml>
            <svg>
              <foreignObject>
                <style>{'a > b {}'}</style>
              </foreignObject>
            </svg>
          </annotation-xml>
        </math>
      ),
    ],
  ])(
    'should write raw text inside the HTML integration point %s',
    (_name, render) => {
      const html = renderToStringSync(render as () => never);

      expect(html).toContain('<style>a > b {}</style>');
      const style = parse(html).querySelector('style')!;
      expect(style.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
      expect(style.textContent).toBe('a > b {}');
    }
  );

  it('should return to HTML after leaving foreign content', () => {
    const html = renderToStringSync(() => (
      <div>
        <svg>
          <style>{payload}</style>
        </svg>
        <style>{'a > b {}'}</style>
      </div>
    ));

    expect(html).toContain('<style>a > b {}</style>');
    expect(parse(html).querySelector('img')).toBeNull();
  });

  it('should escape portal content rendered at a host inside SVG', () => {
    const SvgPortal = definePortal();
    const Writer = () =>
      SvgPortal.render({ children: <style>{payload}</style> });
    const html = renderToStringSync(() => (
      <main>
        <svg>
          <SvgPortal />
        </svg>
        <Writer />
      </main>
    ));

    expectInert(html, payload);
  });

  it('should write raw portal content at an HTML host', () => {
    const html = renderToStringSync(() => (
      <main>
        <svg>
          <Portal>
            <style>{'a > b {}'}</style>
          </Portal>
        </svg>
      </main>
    ));

    expect(html).toContain('<style>a > b {}</style>');
  });
});

type Parse5Node = {
  nodeName: string;
  childNodes?: Parse5Node[];
  content?: Parse5Node;
};

/**
 * Element names a spec-conformant parser (parse5) builds from the markup.
 * Scripting is enabled by default, as in a browser; jsdom parses with it
 * disabled, which reads `<noscript>` content as markup rather than raw text.
 */
function parsedElementNames(html: string, scriptingEnabled = true): string[] {
  const names: string[] = [];
  const visit = (node: Parse5Node): void => {
    if (!node.nodeName.startsWith('#')) names.push(node.nodeName);
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(parseFragment(html, { scriptingEnabled }) as Parse5Node);
  return names;
}

/** Assert no payload element is built, with scripting enabled and disabled. */
function expectNoInjectedElements(html: string): void {
  for (const scriptingEnabled of [true, false]) {
    const names = parsedElementNames(html, scriptingEnabled);
    expect(names).not.toContain('img');
    expect(names).not.toContain('input');
  }
}

describe('SSR <script>/<style> under text-content ancestors', () => {
  const ancestors = [
    'noscript',
    'iframe',
    'xmp',
    'noembed',
    'noframes',
    'textarea',
    'title',
    'plaintext',
  ];
  const cases = ancestors.flatMap((ancestor) =>
    ['style', 'script'].flatMap((inner) =>
      [
        `</${ancestor}><img src=x onerror=alert(1)>`,
        `</${ancestor.toUpperCase()}><img src=x onerror=alert(1)>`,
        `</${inner}></${ancestor}><img src=x onerror=alert(1)>`,
      ].map((payload) => [ancestor, inner, payload] as const)
    )
  );

  it.each(cases)(
    'should build no element from text inside <%s><%s> (%j)',
    (ancestor, inner, payload) => {
      const html = renderToStringSync(() =>
        jsx('div', {
          children: [
            jsx(ancestor, { children: jsx(inner, { children: payload }) }),
            jsx('p', { children: 'after' }),
          ],
        })
      );

      expectNoInjectedElements(html);
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  );

  it('should still write raw text once the text-content ancestor has closed', () => {
    const html = renderToStringSync(() => (
      <div>
        <noscript>
          <style>{'a > b {}'}</style>
        </noscript>
        <style>{'a > b {}'}</style>
      </div>
    ));

    expect(html).toContain(
      '<noscript><style>a &gt; b {}</style></noscript><style>a > b {}</style>'
    );
  });

  it('should neutralize every closing-tag opener in raw text', () => {
    const html = renderToStringSync(() => (
      <div>
        <style>{'a</b></noscript></DIV>'}</style>
        <script>{'var s = "</p></noscript>";'}</script>
      </div>
    ));

    expect(html).toContain('<style>a\\3c /b>\\3c /noscript>\\3c /DIV></style>');
    expect(html).toContain('<script>var s = "<\\/p><\\/noscript>";</script>');
    expect(parsedElementNames(html)).toEqual(['div', 'style', 'script']);
  });

  it.each([
    ['svg', 'style'],
    ['svg', 'script'],
    ['math', 'style'],
    ['math', 'script'],
  ])(
    'should build no element from text inside <%s><%s> (parse5)',
    (foreign, inner) => {
      const html = renderToStringSync(() =>
        jsx(foreign, {
          children: jsx(inner, {
            children: `</${inner}></${foreign}><img src=x onerror=alert(1)>`,
          }),
        })
      );

      expectNoInjectedElements(html);
    }
  );

  it('should resolve the annotation-xml encoding like the parser: first attribute, any case', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const render = (attrs: Record<string, string>) =>
      renderToStringSync(() =>
        jsx('math', {
          children: jsx('annotation-xml', {
            ...attrs,
            children: jsx('style', { children: payload }),
          }),
        })
      );

    const mathFirst = render({
      ENCODING: 'application/mathml+xml',
      encoding: 'text/html',
    });
    expectNoInjectedElements(mathFirst);
    expect(mathFirst).toContain('&lt;img');

    const htmlFirst = render({
      ENCODING: 'Text/HTML',
      encoding: 'application/mathml+xml',
    });
    expect(htmlFirst).toContain(
      '<style>\\3c img src=x onerror=alert(1)></style>'
    );
  });
});

describe('SSR <script>/<style> inside <select>', () => {
  const wrappers: Array<[string, (child: unknown) => unknown]> = [
    ['select', (child) => jsx('select', { children: child })],
    [
      'select > option',
      (child) =>
        jsx('select', { children: jsx('option', { children: child }) }),
    ],
    [
      'select > optgroup',
      (child) =>
        jsx('select', { children: jsx('optgroup', { children: child }) }),
    ],
    [
      'select > optgroup > option',
      (child) =>
        jsx('select', {
          children: jsx('optgroup', {
            children: jsx('option', { children: child }),
          }),
        }),
    ],
    [
      'table > tbody > tr > td > select',
      (child) =>
        jsx('table', {
          children: jsx('tbody', {
            children: jsx('tr', {
              children: jsx('td', {
                children: jsx('select', { children: child }),
              }),
            }),
          }),
        }),
    ],
  ];
  const payloads = [
    '<input><img src=x onerror=alert(1)>',
    '</select><img src=x onerror=alert(1)>',
    '</style></select><input><img src=x onerror=alert(1)>',
    '</script></select><input><img src=x onerror=alert(1)>',
  ];
  const cases = wrappers.flatMap(([name, wrap]) =>
    ['style', 'script'].flatMap((inner) =>
      payloads.map((payload) => [name, inner, payload, wrap] as const)
    )
  );

  it.each(cases)(
    'should build no element from text inside %s > %s (%j)',
    (_name, inner, payload, wrap) => {
      const html = renderToStringSync(
        () =>
          jsx('div', {
            children: [
              wrap(jsx(inner, { children: payload })),
              jsx('p', { children: 'after' }),
            ],
          }) as never
      );

      expectNoInjectedElements(html);
    }
  );

  it('should keep <style> escaped in <select> but return to raw text in <template>', () => {
    const html = renderToStringSync(() => (
      <div>
        <select>
          <style>{'a > b {}'}</style>
          <script>{'1 > 0'}</script>
          <template>
            <style>{'c > d {}'}</style>
          </template>
        </select>
        <style>{'e > f {}'}</style>
      </div>
    ));

    expect(html).toContain('<select><style>a &gt; b {}</style>');
    expect(html).toContain('<script>1 > 0</script>');
    expect(html).toContain('<template><style>c > d {}</style></template>');
    expect(html).toContain('</select><style>e > f {}</style>');
  });
});

describe('SSR <style> CSS escaping of <', () => {
  it('should write every < in CSS as a CSS escape equal to < inside strings', () => {
    const css = 'a::after { content: "<b> < c"; background: url("x<y.png"); }';
    const html = renderToStringSync(() => <style>{css}</style>);

    expect(html).toBe(
      '<style>a::after { content: "\\3c b> \\3c  c"; background: url("x\\3c y.png"); }</style>'
    );
    expectNoInjectedElements(html);
  });
});
