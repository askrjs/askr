import { describe, expect, test } from 'vite-plus/test';
import { For, state } from '../../src';
import { createIsland } from '../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

class PropsProbe extends HTMLElement {
  items: unknown = undefined;
  config: unknown = undefined;
}

if (!customElements.get('x-props-probe')) {
  customElements.define('x-props-probe', PropsProbe);
}

function mount(component: () => unknown) {
  const { container, cleanup } = createTestContainer();
  createIsland({ root: container, component });
  flushScheduler();
  return { container, cleanup };
}

describe('DOM properties', () => {
  test('should set and clear video.muted, not only the muted attribute', () => {
    let setMuted!: (next: boolean) => void;

    function App() {
      const muted = state(true);
      setMuted = (next) => muted.set(next);
      return <video muted={muted()} />;
    }

    const { container, cleanup } = mount(App);
    try {
      const video = container.querySelector('video')!;
      expect(video.muted).toBe(true);
      expect(video.hasAttribute('muted')).toBe(true);

      setMuted(false);
      flushScheduler();
      expect(video.muted).toBe(false);
      expect(video.hasAttribute('muted')).toBe(false);

      setMuted(true);
      flushScheduler();
      expect(video.muted).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('should set muted on a statically rendered and a repeated video', () => {
    function Clip() {
      return <video muted />;
    }

    function App() {
      return (
        <div>
          <Clip />
          <Clip />
          <audio muted />
        </div>
      );
    }

    const { container, cleanup } = mount(App);
    try {
      const media = Array.from(
        container.querySelectorAll<HTMLMediaElement>('video, audio')
      );
      expect(media.map((element) => element.muted)).toEqual([true, true, true]);
    } finally {
      cleanup();
    }
  });

  test('should set input.indeterminate as a property without an attribute', () => {
    let setMixed!: (next: boolean) => void;

    function App() {
      const mixed = state(true);
      setMixed = (next) => mixed.set(next);
      return <input type="checkbox" indeterminate={mixed()} />;
    }

    const { container, cleanup } = mount(App);
    try {
      const input = container.querySelector('input')!;
      expect(input.indeterminate).toBe(true);
      expect(input.hasAttribute('indeterminate')).toBe(false);

      setMixed(false);
      flushScheduler();
      expect(input.indeterminate).toBe(false);

      setMixed(true);
      flushScheduler();
      expect(input.indeterminate).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('should drive indeterminate through a reactive prop binding', () => {
    let setMixed!: (next: boolean) => void;

    function App() {
      const mixed = state(true);
      setMixed = (next) => mixed.set(next);
      return <input type="checkbox" indeterminate={() => mixed()} />;
    }

    const { container, cleanup } = mount(App);
    try {
      const input = container.querySelector('input')!;
      expect(input.indeterminate).toBe(true);

      setMixed(false);
      flushScheduler();
      expect(input.indeterminate).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('should reset indeterminate when the prop is removed', () => {
    let setMixed!: (next: boolean) => void;

    function App() {
      const mixed = state(true);
      setMixed = (next) => mixed.set(next);
      const props: Record<string, unknown> = { type: 'checkbox' };
      if (mixed()) props.indeterminate = true;
      return <input {...props} />;
    }

    const { container, cleanup } = mount(App);
    try {
      const input = container.querySelector('input')!;
      expect(input.indeterminate).toBe(true);

      setMixed(false);
      flushScheduler();
      expect(input.indeterminate).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('should update indeterminate on keyed rows that are reordered', () => {
    type Row = { id: number; mixed: boolean };
    let setRows!: (next: Row[]) => void;

    function App() {
      const rows = state<Row[]>([
        { id: 1, mixed: true },
        { id: 2, mixed: false },
      ]);
      setRows = (next) => rows.set(next);
      return (
        <div>
          <For each={() => rows()} by={(row) => row.id}>
            {(row) => (
              <input
                type="checkbox"
                data-row={String(row.id)}
                indeterminate={row.mixed}
              />
            )}
          </For>
        </div>
      );
    }

    const { container, cleanup } = mount(App);
    try {
      const row = (id: number) =>
        container.querySelector<HTMLInputElement>(`[data-row="${id}"]`)!;
      expect(row(1).indeterminate).toBe(true);
      expect(row(2).indeterminate).toBe(false);

      setRows([
        { id: 2, mixed: true },
        { id: 1, mixed: false },
      ]);
      flushScheduler();
      expect(row(1).indeterminate).toBe(false);
      expect(row(2).indeterminate).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('should pass object and array props to custom elements as properties', () => {
    const items = [1, 2, 3];
    const config = { mode: 'compact' };
    let setConfig!: (next: { mode: string }) => void;

    function App() {
      const current = state(config);
      setConfig = (next) => current.set(next);
      return <x-props-probe items={items} config={current()} />;
    }

    const { container, cleanup } = mount(App);
    try {
      const probe = container.querySelector('x-props-probe') as PropsProbe;
      expect(probe.items).toBe(items);
      expect(probe.config).toBe(config);
      expect(probe.hasAttribute('items')).toBe(false);
      expect(probe.hasAttribute('config')).toBe(false);

      const next = { mode: 'wide' };
      setConfig(next);
      flushScheduler();
      expect(probe.config).toBe(next);
      expect(probe.items).toBe(items);
    } finally {
      cleanup();
    }
  });

  test('should assign prop: values verbatim and never write an attribute', () => {
    const payload = { id: 7 };
    let setStage!: (next: number) => void;

    function App() {
      const stage = state(0);
      setStage = (next) => stage.set(next);
      if (stage() === 2) return <x-props-probe />;
      return (
        <x-props-probe
          prop:config={stage() === 0 ? payload : false}
          prop:items="plain string"
        />
      );
    }

    const { container, cleanup } = mount(App);
    try {
      const probe = container.querySelector('x-props-probe') as PropsProbe;
      expect(probe.config).toBe(payload);
      expect(probe.items).toBe('plain string');
      expect(probe.attributes.length).toBe(0);

      setStage(1);
      flushScheduler();
      expect(probe.config).toBe(false);

      setStage(2);
      flushScheduler();
      expect(container.querySelector('x-props-probe')).toBe(probe);
      expect(probe.config).toBeUndefined();
      expect(probe.items).toBeUndefined();
      expect(probe.attributes.length).toBe(0);
    } finally {
      cleanup();
    }
  });

  test('should write attr: values as attributes even where a property is used', () => {
    function App() {
      return (
        <div>
          <x-props-probe attr:config="from-attribute" />
          <input type="checkbox" attr:indeterminate="" />
        </div>
      );
    }

    const { container, cleanup } = mount(App);
    try {
      const probe = container.querySelector('x-props-probe') as PropsProbe;
      expect(probe.getAttribute('config')).toBe('from-attribute');
      expect(probe.config).toBeUndefined();
      const input = container.querySelector('input')!;
      expect(input.getAttribute('indeterminate')).toBe('');
      expect(input.indeterminate).toBe(false);
    } finally {
      cleanup();
    }
  });
  test('should keep attributes reflected by prop: values across re-renders', () => {
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
      const anchor = container.querySelector('a')!;
      expect(anchor.getAttribute('href')).toBe('https://example.com/docs');
      expect(anchor.getAttribute('title')).toBe('Docs');
      expect(anchor.hidden).toBe(true);
      expect(anchor.id).toBe('docs-link');
    } finally {
      cleanup();
    }
  });

  test('should block javascript: URL objects passed through prop:', () => {
    function App() {
      return (
        <div>
          <a prop:href={new URL('javascript:alert(1)')}>a</a>
          <iframe prop:src={new URL('javascript:alert(1)')} />
        </div>
      );
    }

    const { container, cleanup } = mount(App);
    try {
      expect(container.querySelector('a')!.href).not.toContain('javascript:');
      expect(container.querySelector('iframe')!.getAttribute('src')).toBeNull();
    } finally {
      cleanup();
    }
  });

  test('should remove the attribute when a custom element prop becomes an object', () => {
    let setObject!: (next: boolean) => void;
    const config = { mode: 'wide' };

    function App() {
      const asObject = state(false);
      setObject = (next) => asObject.set(next);
      return <x-props-probe config={asObject() ? config : 'compact'} />;
    }

    const { container, cleanup } = mount(App);
    try {
      const probe = container.querySelector('x-props-probe') as PropsProbe;
      expect(probe.getAttribute('config')).toBe('compact');
      setObject(true);
      flushScheduler();
      expect(probe.hasAttribute('config')).toBe(false);
      expect(probe.config).toBe(config);
    } finally {
      cleanup();
    }
  });

  test('should assign properties to a custom element defined after render', () => {
    const items = [1, 2];

    function App() {
      return <x-late-probe items={items} />;
    }

    const { container, cleanup } = mount(App);
    try {
      const probe = container.querySelector('x-late-probe') as HTMLElement & {
        items?: unknown;
      };
      // Not upgraded yet: the value lands as an own property, the same as
      // Lit's `.prop` bindings. Upgrading elements re-read it (see docs).
      expect(probe.items).toBe(items);
      class LateProbe extends HTMLElement {
        #items: unknown;
        constructor() {
          super();
          const pending = (this as { items?: unknown }).items;
          delete (this as { items?: unknown }).items;
          this.#items = pending;
        }
        get items(): unknown {
          return this.#items;
        }
        set items(value: unknown) {
          this.#items = value;
        }
      }
      customElements.define('x-late-probe', LateProbe);
      expect(probe).toBeInstanceOf(LateProbe);
      expect(probe.items).toBe(items);
    } finally {
      cleanup();
    }
  });
});
