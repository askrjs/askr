import { afterEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
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
      expect(fragment.querySelector('style')!.textContent).toContain(
        '<\\/' + closer.slice(2)
      );
    }
  );

  it('should keep dangerouslySetInnerHTML verbatim inside a <script>', () => {
    const html = renderToStringSync(() => (
      <script dangerouslySetInnerHTML={{ __html: 'a < b && c > d' }} />
    ));

    expect(html).toContain('<script>a < b && c > d</script>');
  });

  it('should reject element children inside a raw text element', () => {
    expect(() =>
      renderToStringSync(() => (
        <style>
          <b>nope</b>
        </style>
      ))
    ).toThrow(/<style> children must be text/);
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
