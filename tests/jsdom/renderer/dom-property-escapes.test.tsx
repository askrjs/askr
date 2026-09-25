import { describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function mount(component: () => unknown) {
  const { container, cleanup } = createTestContainer();
  createIsland({ root: container, component });
  flushScheduler();
  return { container, cleanup };
}

describe('prop:/attr: escape hatches', () => {
  it('should keep the unsafe URL and inline handler guards for attr:', () => {
    function Page() {
      return (
        <a
          attr:href="javascript:alert(1)"
          attr:onclick="alert(1)"
          attr:title="kept"
        >
          link
        </a>
      );
    }

    expect(renderToStringSync(Page)).toBe('<a title="kept">link</a>');

    const { container, cleanup } = mount(Page);
    try {
      const anchor = container.querySelector('a')!;
      expect(anchor.hasAttribute('href')).toBe(false);
      expect(anchor.hasAttribute('onclick')).toBe(false);
      expect(anchor.getAttribute('title')).toBe('kept');
    } finally {
      cleanup();
    }
  });

  it('should keep the unsafe URL guard and refuse raw HTML for prop:', () => {
    function Page() {
      return (
        <div>
          <a prop:href="javascript:alert(1)">link</a>
          <div data-raw prop:innerHTML="<img src=x onerror=alert(1)>" />
        </div>
      );
    }

    expect(renderToStringSync(Page)).toBe(
      '<div><a>link</a><div data-raw="true"></div></div>'
    );

    const { container, cleanup } = mount(Page);
    try {
      expect(container.querySelector('a')!.href).toBe('');
      expect(container.querySelector('[data-raw]')!.innerHTML).toBe('');
    } finally {
      cleanup();
    }
  });
});

describe('prop: review regressions', () => {
  it('should keep attributes reflected by prop: values across parent re-renders', () => {
    let bump!: () => void;
    function App() {
      const count = state(0);
      bump = () => count.set((value) => value + 1);
      return (
        <div data-count={count()}>
          <a
            prop:href="https://example.com/docs"
            prop:title="Docs"
            prop:hidden={true}
            prop:id="docs-link"
            data-count={count()}
          >
            docs
          </a>
        </div>
      );
    }

    const { container, cleanup } = mount(App);
    try {
      bump();
      flushScheduler();
      bump();
      flushScheduler();
      const anchor = container.querySelector('a')!;
      expect(anchor.getAttribute('data-count')).toBe('2');
      expect(anchor.getAttribute('href')).toBe('https://example.com/docs');
      expect(anchor.title).toBe('Docs');
      expect(anchor.hidden).toBe(true);
      expect(anchor.id).toBe('docs-link');
    } finally {
      cleanup();
    }
  });

  it('should apply the URL guard to non-string prop: values', () => {
    let setUnsafe!: (next: boolean) => void;
    function App() {
      const unsafe = state(false);
      setUnsafe = (next) => unsafe.set(next);
      return (
        <div>
          <a data-case="url" prop:href={new URL('javascript:alert(1)')}>
            a
          </a>
          <a
            data-case="to-string"
            prop:href={{ toString: () => 'javascript:alert(1)' }}
          >
            b
          </a>
          <a data-case="reactive" prop:href={() => 'javascript:alert(1)'}>
            c
          </a>
          <iframe prop:src={new URL('javascript:alert(1)')} />
          <a
            data-case="switch"
            prop:href={
              unsafe() ? 'javascript:alert(1)' : 'https://example.com/safe'
            }
          >
            d
          </a>
        </div>
      );
    }

    const { container, cleanup } = mount(App);
    try {
      for (const name of ['url', 'to-string', 'reactive']) {
        const anchor = container.querySelector<HTMLAnchorElement>(
          `[data-case="${name}"]`
        )!;
        expect(anchor.href).not.toContain('javascript:');
        expect(anchor.hasAttribute('href')).toBe(false);
      }
      const iframe = container.querySelector('iframe')!;
      expect(iframe.getAttribute('src')).toBeNull();

      const switched = container.querySelector<HTMLAnchorElement>(
        '[data-case="switch"]'
      )!;
      expect(switched.href).toBe('https://example.com/safe');
      setUnsafe(true);
      flushScheduler();
      expect(switched.href).not.toContain('example.com');
      expect(switched.href).not.toContain('javascript:');
      expect(switched.hasAttribute('href')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should ignore prop:srcdoc and prototype-changing prop: names', () => {
    const hostile = { polluted: true };
    function App() {
      return (
        <div>
          <iframe prop:srcdoc="<script>alert(1)</script>" />
          <div
            data-proto
            {...{
              'prop:__proto__': hostile,
              'prop:constructor': hostile,
              'prop:prototype': hostile,
            }}
          />
        </div>
      );
    }

    const { container, cleanup } = mount(App);
    try {
      expect(container.querySelector('iframe')!.srcdoc).toBe('');
      const div = container.querySelector('[data-proto]')!;
      expect(Object.getPrototypeOf(div)).toBe(HTMLDivElement.prototype);
      expect(div.constructor).toBe(HTMLDivElement);
      expect(Object.prototype.hasOwnProperty.call(div, 'prototype')).toBe(
        false
      );
    } finally {
      cleanup();
    }
  });

  it('should reset removed text prop: values to empty, not "undefined"', () => {
    let setOn!: (next: boolean) => void;
    function App() {
      const on = state(true);
      setOn = (next) => on.set(next);
      const props: Record<string, unknown> = on()
        ? {
            'prop:value': 'typed',
            'prop:title': 'Tip',
            'prop:className': 'owned',
          }
        : {};
      return <input {...props} />;
    }

    const { container, cleanup } = mount(App);
    try {
      const input = container.querySelector('input')!;
      expect(input.value).toBe('typed');
      expect(input.title).toBe('Tip');
      expect(input.className).toBe('owned');
      setOn(false);
      flushScheduler();
      expect(input.value).toBe('');
      expect(input.title).toBe('');
      expect(input.className).toBe('');
      expect(input.hasAttribute('title')).toBe(false);
      expect(input.hasAttribute('class')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should roll back property writes when a render fails', () => {
    let step!: State<number>;
    function Child({ step }: { step: number }) {
      if (step === 1) throw new Error('child failed');
      return <span>{step}</span>;
    }
    function App() {
      step = state(0);
      const s = step();
      return (
        <div>
          <input
            type="checkbox"
            indeterminate={s !== 0}
            prop:value={`v${s}`}
            prop:customState={s}
          />
          <Child step={s} />
        </div>
      );
    }
    const { container, cleanup } = mount(App);
    try {
      const input = container.querySelector('input')! as HTMLInputElement &
        Record<string, unknown>;
      expect(() => {
        step.set(1);
        flushScheduler();
      }).toThrow('child failed');
      expect(input.indeterminate).toBe(false);
      expect(input.value).toBe('v0');
      expect(input.customState).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('should render attr: object values the same way in SSR and the DOM', () => {
    function Page() {
      return <div attr:style={{ color: 'red' }} attr:data-x="1" />;
    }
    const html = renderToStringSync(Page);
    const { container, cleanup } = mount(Page);
    try {
      const div = container.querySelector('div')!;
      const probe = document.createElement('template');
      probe.innerHTML = html;
      const server = probe.content.querySelector('div')!;
      expect(div.getAttribute('style')).toBe(server.getAttribute('style'));
      expect(div.getAttribute('style')).toBeNull();
      expect(div.getAttribute('data-x')).toBe('1');
    } finally {
      cleanup();
    }
  });

  it('should explain read-only prop: names', () => {
    function App() {
      return <div prop:tagName="SPAN" />;
    }
    const { container, cleanup } = createTestContainer();
    try {
      expect(() => {
        createIsland({ root: container, component: App });
        flushScheduler();
      }).toThrow(/prop:tagName.*read-only/);
    } finally {
      cleanup();
    }
  });
});
