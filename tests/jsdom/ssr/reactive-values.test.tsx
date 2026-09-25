import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import type { JSXElement } from '../../../src/jsx/types';
import { routeRegistryFromTable } from '../../router-test-utils';
import { cleanupApp, createSPA, hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import { derive, state, type State } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Page = () => JSXElement;

async function renderOnClient(Component: Page): Promise<string> {
  const { container, cleanup } = createTestContainer();
  try {
    await createSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
    });
    flushScheduler();
    return normalizeHtml(container.innerHTML);
  } finally {
    cleanupApp(container);
    cleanup();
  }
}

function normalizeHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html.replace(/<!--[\s\S]*?-->/g, '');
  return template.innerHTML;
}

function renderOnServer(Component: Page): string {
  return normalizeHtml(renderToStringSync(Component));
}

describe('SSR reactive values', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
  });

  async function hydrate(Component: Page): Promise<void> {
    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
      hydrate: { verifyMarkup: true },
    });
  }

  const cases: Array<[string, Page, string]> = [
    [
      'a function child',
      () => {
        const label = state('a<b & c');
        return <p>{() => label()}</p>;
      },
      '<p>a&lt;b &amp; c</p>',
    ],
    [
      'a state cell child',
      () => {
        const count = state(3);
        return <p>{count}</p>;
      },
      '<p>3</p>',
    ],
    [
      'a derived child',
      () => {
        const count = state(3);
        const doubled = derive(() => count() * 2);
        return <p>{doubled}</p>;
      },
      '<p>6</p>',
    ],
    [
      'a function child between static text',
      () => {
        const count = state(3);
        return <p>x {() => count()} y</p>;
      },
      '<p>x 3 y</p>',
    ],
    [
      'a function child returning elements',
      () => {
        const count = state(3);
        return (
          <div>
            <b>1</b>
            {() => <span>{count()}</span>}
            {() => [<i>a</i>, <i>b</i>]}
          </div>
        );
      },
      '<div><b>1</b><span>3</span><i>a</i><i>b</i></div>',
    ],
    [
      'function and state cell props',
      () => {
        const title = state('say "hi" <now>');
        const hidden = state(false);
        return (
          <p
            title={() => title()}
            class={() => 'lead'}
            data-count={state(2)}
            hidden={hidden}
          >
            {'z'}
          </p>
        );
      },
      '<p title="say &quot;hi&quot; &lt;now&gt;" class="lead" data-count="2">z</p>',
    ],
  ];

  it.each(cases)(
    'should render %s on the server as the client does',
    async (_name, Component, expected) => {
      expect(renderToStringSync(Component)).toContain(expected);
      expect(renderOnServer(Component)).toBe(normalizeHtml(expected));
      expect(await renderOnClient(Component)).toBe(normalizeHtml(expected));
    }
  );

  it.each(cases)(
    'should hydrate %s with verified markup',
    async (_name, Component, expected) => {
      container.innerHTML = renderToStringSync(Component);
      const serverRoot = container.firstElementChild;
      const serverText = container.textContent;
      await hydrate(Component);
      expect(container.firstElementChild).toBe(serverRoot);
      expect(container.textContent).toBe(serverText);
      expect(normalizeHtml(container.innerHTML)).toBe(normalizeHtml(expected));
    }
  );

  it('should keep hydrated function children and props reactive', async () => {
    let label!: State<string>;
    const Component = () => {
      label = state('before');
      return <p title={() => label()}>{() => label()}</p>;
    };

    container.innerHTML = renderToStringSync(Component);
    await hydrate(Component);
    label.set('after');
    flushScheduler();

    const p = container.querySelector('p')!;
    expect(p.textContent).toBe('after');
    expect(p.getAttribute('title')).toBe('after');
  });

  it('should evaluate each function child and prop once on the server', () => {
    let childReads = 0;
    let propReads = 0;
    const html = renderToStringSync(() => (
      <p
        title={() => {
          propReads += 1;
          return 't';
        }}
        style={() => ({ color: 'red' })}
      >
        {() => {
          childReads += 1;
          return 'c';
        }}
      </p>
    ));

    expect(html).toContain('<p title="t" style="color:red;">c</p>');
    expect(childReads).toBe(1);
    expect(propReads).toBe(1);
  });

  it('should render function children of raw text elements', () => {
    const css = '.a > .b { color: red }';
    const html = renderToStringSync(() => <style>{() => css}</style>);

    expect(html).toContain(`<style>${css}</style>`);
  });
});
