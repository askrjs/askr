import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { For, Show, state } from '../../../src';
import { cleanupApp, createIsland } from '../../../src/boot';
import { captureRangeFocus } from '../../../src/renderer/component-fragment-range';
import { getCurrentComponentInstance } from '../../../src/runtime/component';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

describe('component fragment structure', () => {
  let root: HTMLElement | undefined;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (root) {
      cleanupApp(root);
      root.remove();
      root = undefined;
    }
  });

  it('should preserve node identity and lifecycle cleanup given transparent scalar, array, Fragment, and component-result transitions when the result shape changes', () => {
    let setShape!: (shape: 'scalar' | 'array' | 'fragment' | 'empty') => void;
    let setLabel!: (label: string) => void;
    const cleanupCalls: string[] = [];
    const Body = () => {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected component instance');
      if (!instance.ownership.mounted) {
        (instance.ownership.cleanups ??= []).push(() =>
          cleanupCalls.push('body')
        );
      }
      const shape = state<'scalar' | 'array' | 'fragment' | 'empty'>('array');
      const label = state('stable');
      setShape = shape.set;
      setLabel = label.set;
      const stable = (
        <button key="stable" data-stable="true">
          {label()}
        </button>
      );
      if (shape() === 'empty') return null;
      if (shape() === 'array') {
        return [stable, <span key="tail">array</span>];
      }
      if (shape() === 'fragment') {
        return (
          <>
            {stable}
            <span key="tail">fragment</span>
          </>
        );
      }
      return [stable, 'scalar'];
    };

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <main>
          <Body />
        </main>
      ),
    });
    flushScheduler();
    const stableNode = root.querySelector('[data-stable]');

    setLabel('updated');
    flushScheduler();
    expect(root.querySelector('[data-stable]')).toBe(stableNode);
    expect(stableNode?.textContent).toBe('updated');

    setShape('fragment');
    flushScheduler();
    expect(root.querySelectorAll('[data-stable]')).toHaveLength(1);
    expect(cleanupCalls).toEqual([]);

    setShape('scalar');
    flushScheduler();
    expect(root.querySelectorAll('[data-stable]')).toHaveLength(1);
    expect(cleanupCalls).toEqual([]);

    setShape('empty');
    flushScheduler();
    expect(root.querySelector('[data-stable]')).toBeNull();
    expect(cleanupCalls).toEqual([]);

    cleanupApp(root);
    expect(cleanupCalls).toEqual(['body']);
    root.remove();
    root = undefined;
  });

  it('should remove a transparent component range given a state transition to null', () => {
    let hide!: (value: boolean) => void;
    const Row = () => <button data-row="true">row</button>;
    const Body = () => {
      const visible = state(true);
      hide = visible.set;
      return visible() ? [<Row key="row" />, <em key="tail">tail</em>] : null;
    };

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <main>
          <Body />
          <span data-after="true" />
        </main>
      ),
    });
    flushScheduler();
    hide(false);
    flushScheduler();

    expect(root.querySelector('[data-row]')).toBeNull();
    expect(root.querySelector('em')).toBeNull();
    expect(root.querySelector('[data-after]')).not.toBeNull();
  });

  it('should keep plain component Fragment siblings structurally transparent across updates', () => {
    let update!: () => void;
    let remove!: () => void;

    function Navigation() {
      const revision = state('before');
      update = () => revision.set('after');
      return (
        <>
          <section data-navigation={revision()}>{revision()}</section>
          <div data-links={'true'}>Links</div>
        </>
      );
    }

    function App() {
      const showNavigation = state(true);
      remove = () => showNavigation.set(false);
      return (
        <article id="component-fragment-frame" data-frame={'true'}>
          {showNavigation() ? <Navigation /> : null}
          <main>Content</main>
        </article>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: App,
    });

    const frame = root.querySelector('[data-frame]')!;
    const navigation = frame.querySelector('[data-navigation]')!;
    const links = frame.querySelector('[data-links]')!;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true });
    expect(Array.from(frame.children, (child) => child.tagName)).toEqual([
      'SECTION',
      'DIV',
      'MAIN',
    ]);

    update();
    flushScheduler();

    expect(Array.from(frame.children, (child) => child.tagName)).toEqual([
      'SECTION',
      'DIV',
      'MAIN',
    ]);
    expect(frame.querySelector(':scope > [data-navigation]')?.textContent).toBe(
      'after'
    );
    expect(root.querySelector('[data-frame]')).toBe(frame);
    expect(
      observer
        .takeRecords()
        .flatMap((record) => Array.from(record.addedNodes))
        .filter(
          (node): node is Element =>
            node instanceof Element && node.id === 'component-fragment-frame'
        )
    ).toEqual([]);
    observer.disconnect();

    remove();
    flushScheduler();

    expect(Array.from(frame.children, (child) => child.tagName)).toEqual([
      'MAIN',
    ]);
    expect(
      Array.from(frame.childNodes, (child) => child.textContent).filter(
        (text) => text === 'askr-range-start' || text === 'askr-range-end'
      )
    ).toEqual([]);
    expect(navigation.isConnected).toBe(false);
    expect(links.isConnected).toBe(false);
  });

  it('should not scan a component Fragment range when focus is outside its parent', () => {
    root = document.createElement('div');
    document.body.appendChild(root);
    const start = document.createComment('askr-range-start');
    const end = document.createComment('askr-range-end');
    root.appendChild(start);
    for (let index = 0; index < 128; index++) {
      root.appendChild(document.createElement('span'));
    }
    root.appendChild(end);

    const nextSibling = Object.getOwnPropertyDescriptor(
      Node.prototype,
      'nextSibling'
    )!.get!;
    let nextSiblingReads = 0;
    const nextSiblingSpy = vi
      .spyOn(Node.prototype, 'nextSibling', 'get')
      .mockImplementation(function (this: Node) {
        nextSiblingReads++;
        return nextSibling.call(this);
      });

    const restoreFocus = captureRangeFocus({ start, end, single: false }, root);
    nextSiblingSpy.mockRestore();

    expect(nextSiblingReads).toBe(0);
    restoreFocus();
  });

  it('should ignore focus capture when HTMLElement is unavailable', () => {
    root = document.createElement('div');
    document.body.appendChild(root);
    const start = document.createComment('start');
    const end = document.createComment('end');
    root.append(start, document.createElement('input'), end);

    vi.stubGlobal('HTMLElement', undefined);

    expect(() =>
      captureRangeFocus({ start, end, single: false }, root!)
    ).not.toThrow();
  });

  it('should retry focus without options when preventScroll is unsupported', () => {
    root = document.createElement('div');
    document.body.appendChild(root);
    const start = document.createComment('start');
    const input = document.createElement('input');
    const end = document.createComment('end');
    root.append(start, input, end);
    input.focus();

    const restoreFocus = captureRangeFocus({ start, end, single: false }, root);
    input.blur();
    const nativeFocus = input.focus.bind(input);
    const focusSpy = vi
      .spyOn(input, 'focus')
      .mockImplementation((options?: FocusOptions) => {
        if (options) {
          throw new TypeError('focus options are unsupported');
        }
        nativeFocus();
      });

    expect(restoreFocus).not.toThrow();
    expect(focusSpy).toHaveBeenNthCalledWith(1, { preventScroll: true });
    expect(focusSpy).toHaveBeenNthCalledWith(2);
    expect(document.activeElement).toBe(input);
  });

  it('should not override focus intentionally moved during a range commit', () => {
    root = document.createElement('div');
    document.body.appendChild(root);
    const start = document.createComment('start');
    const input = document.createElement('input');
    const end = document.createComment('end');
    const destination = document.createElement('button');
    root.append(start, input, end, destination);
    input.focus();

    const restoreFocus = captureRangeFocus({ start, end, single: false }, root);
    destination.focus();
    restoreFocus();

    expect(document.activeElement).toBe(destination);
  });

  it('should not override focus intentionally moved to an SVG during a range commit', () => {
    root = document.createElement('div');
    document.body.appendChild(root);
    const start = document.createComment('start');
    const input = document.createElement('input');
    const end = document.createComment('end');
    const destination = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    );
    destination.setAttribute('tabindex', '0');
    root.append(start, input, end, destination);
    input.focus();

    const restoreFocus = captureRangeFocus({ start, end, single: false }, root);
    destination.focus();
    restoreFocus();

    expect(document.activeElement).toBe(destination);
  });

  it('should keep legacy Fragment symbols transparent across component updates', () => {
    let update!: () => void;
    const LegacyFragment = Symbol('Fragment') as unknown as (props: {
      children?: unknown;
    }) => unknown;

    function LegacySiblings() {
      const revision = state('before');
      update = () => revision.set('after');
      return (
        <LegacyFragment>
          <section key="revision" data-legacy-revision={revision()}>
            {revision()}
          </section>
          <aside key="stable">stable</aside>
        </LegacyFragment>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <article data-legacy-frame={'true'}>
          <LegacySiblings />
        </article>
      ),
    });

    const frame = root.querySelector('[data-legacy-frame]')!;
    expect(Array.from(frame.children, (child) => child.tagName)).toEqual([
      'SECTION',
      'ASIDE',
    ]);

    update();
    flushScheduler();

    expect(Array.from(frame.children, (child) => child.tagName)).toEqual([
      'SECTION',
      'ASIDE',
    ]);
    expect(frame.querySelector('[data-legacy-revision]')?.textContent).toBe(
      'after'
    );
  });

  it('should keep component-returned keyed rows structurally transparent', async () => {
    let reorder!: () => void;
    let updateAndRemove!: () => void;

    function Rows() {
      const [rows, setRows] = state([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
      reorder = () => setRows([rows()[1]!, rows()[0]!]);
      updateAndRemove = () => setRows([{ id: 2, name: 'Bob' }]);

      return (
        <For each={rows} by={(row) => row.id}>
          {(row) => (
            <tr data-row={row.id}>
              <td>{row.name}</td>
            </tr>
          )}
        </For>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <table>
          <tbody>
            <Rows />
          </tbody>
        </table>
      ),
    });

    const tbody = root.querySelector('tbody')!;
    expect(Array.from(tbody.children).map((child) => child.tagName)).toEqual([
      'TR',
      'TR',
    ]);

    reorder();
    flushScheduler();
    expect(
      Array.from(tbody.querySelectorAll(':scope > tr')).map((row) =>
        row.getAttribute('data-row')
      )
    ).toEqual(['2', '1']);

    updateAndRemove();
    flushScheduler();
    expect(tbody.querySelectorAll(':scope > tr')).toHaveLength(1);
    expect(tbody.querySelector(':scope > tr')?.textContent).toBe('Bob');
  });

  it('should fall back when a staging host is relocated outside its component range', () => {
    let update!: () => void;

    function Rows() {
      const revision = state('before');
      update = () => revision.set('after');
      return (
        <>
          <tr data-row={'first'}>
            <td>{revision()}</td>
          </tr>
          <tr data-row={'second'}>
            <td>stable</td>
          </tr>
        </>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <table>
          <tbody>
            <Rows />
          </tbody>
        </table>
      ),
    });

    const tbody = root.querySelector('tbody')!;
    const insertBefore = tbody.insertBefore.bind(tbody);
    const insertSpy = vi
      .spyOn(tbody, 'insertBefore')
      .mockImplementation((node, reference) => {
        if (node instanceof Element && node.localName === 'tbody') {
          document.body.appendChild(node);
          return node;
        }
        return insertBefore(node, reference);
      });

    update();
    flushScheduler();
    insertSpy.mockRestore();

    expect(
      Array.from(tbody.querySelectorAll(':scope > tr'), (row) => [
        row.getAttribute('data-row'),
        row.textContent,
      ])
    ).toEqual([
      ['first', 'after'],
      ['second', 'stable'],
    ]);
    expect(document.body.querySelector(':scope > tbody')).toBeNull();
  });

  it('should keep component-returned options structurally transparent', () => {
    function Options() {
      return (
        <For each={['alpha', 'beta']} by={(value) => value}>
          {(value) => <option value={value}>{value}</option>}
        </For>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <select>
          <Options />
        </select>
      ),
    });

    expect(
      Array.from(root.querySelector('select')!.children).map(
        (child) => child.tagName
      )
    ).toEqual(['OPTION', 'OPTION']);
  });

  it('should preserve a component-owned multi-node range during parent reconciliation', () => {
    let updateParent!: () => void;

    function Rows() {
      return (
        <For each={[1, 2]} by={(value) => value}>
          {(value) => <span data-row={value}>{value}</span>}
        </For>
      );
    }

    function App() {
      const revision = state('before');
      updateParent = () => revision.set('after');
      return (
        <>
          <Rows />
          <strong data-revision={revision()}>{revision()}</strong>
        </>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });

    updateParent();
    flushScheduler();

    expect(
      Array.from(root.querySelectorAll('[data-row]'), (row) => row.textContent)
    ).toEqual(['1', '2']);
    expect(root.querySelector('[data-revision]')?.textContent).toBe('after');
  });

  it('should keep a single-item control boundary transparent across updates', () => {
    let append!: () => void;

    function Rows() {
      const rows = state([{ id: 1, name: 'Alice' }]);
      append = () => rows.set([...rows(), { id: 2, name: 'Bob' }]);
      return (
        <For each={rows} by={(row) => row.id}>
          {(row) => <tr data-row={row.id}>{row.name}</tr>}
        </For>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <table>
          <tbody>
            <Rows />
          </tbody>
        </table>
      ),
    });

    const tbody = root.querySelector('tbody')!;
    expect(Array.from(tbody.children, (child) => child.tagName)).toEqual([
      'TR',
    ]);
    append();
    flushScheduler();
    expect(Array.from(tbody.children, (child) => child.tagName)).toEqual([
      'TR',
      'TR',
    ]);
  });

  it('should replace an owned control range with a single element host', () => {
    let replace!: () => void;

    function Content() {
      const showRows = state(true);
      replace = () => showRows.set(false);
      return showRows() ? (
        <For each={[1, 2]} by={(value) => value}>
          {(value) => <span data-row={value}>{value}</span>}
        </For>
      ) : (
        <strong>Done</strong>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <section>
          <Content />
        </section>
      ),
    });

    replace();
    flushScheduler();
    const section = root.querySelector('section')!;
    expect(section.querySelectorAll(':scope > span')).toHaveLength(0);
    expect(section.querySelector(':scope > strong')?.textContent).toBe('Done');
  });
  it('should transition one component through empty, singleton, and multi-node roots', () => {
    let setMode!: (mode: 'empty' | 'single' | 'multi') => void;

    function ShapeShifter() {
      const mode = state<'empty' | 'single' | 'multi'>('empty');
      setMode = mode.set;
      if (mode() === 'empty') return null;
      if (mode() === 'single') {
        return <button data-shape-single={'true'}>{'single'}</button>;
      }
      return (
        <>
          <input data-shape-start={'true'} value={'editor'} />
          <span data-shape-end={'true'}>{'multi'}</span>
        </>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({
      root,
      component: () => (
        <section data-shape-frame={'true'}>
          <ShapeShifter />
          <i data-shape-tail={'true'}>{'tail'}</i>
        </section>
      ),
    });
    flushScheduler();

    const frame = root.querySelector('[data-shape-frame]')!;
    const tail = root.querySelector('[data-shape-tail]');
    expect(Array.from(frame.children, (node) => node.tagName)).toEqual(['I']);

    setMode('multi');
    flushScheduler();
    const firstStart = root.querySelector('[data-shape-start]');
    const firstEnd = root.querySelector('[data-shape-end]');
    expect(Array.from(frame.children, (node) => node.tagName)).toEqual([
      'INPUT',
      'SPAN',
      'I',
    ]);
    expect(root.querySelector('[data-shape-tail]')).toBe(tail);

    setMode('single');
    flushScheduler();
    const single = root.querySelector('[data-shape-single]');
    expect(firstStart?.isConnected).toBe(false);
    expect(firstEnd?.isConnected).toBe(false);
    expect(Array.from(frame.children, (node) => node.tagName)).toEqual([
      'BUTTON',
      'I',
    ]);

    setMode('multi');
    flushScheduler();
    const secondStart = root.querySelector('[data-shape-start]');
    const secondEnd = root.querySelector('[data-shape-end]');
    expect(single?.isConnected).toBe(false);
    expect(Array.from(frame.children, (node) => node.tagName)).toEqual([
      'INPUT',
      'SPAN',
      'I',
    ]);

    setMode('empty');
    flushScheduler();
    expect(secondStart?.isConnected).toBe(false);
    expect(secondEnd?.isConnected).toBe(false);
    expect(Array.from(frame.children, (node) => node.tagName)).toEqual(['I']);
    expect(root.querySelector('[data-shape-tail]')).toBe(tail);
  });

  it('should preserve a live expanded For range across a mixed-parent rerender', () => {
    let expand!: () => void;
    let updateHeader!: () => void;
    const rows = [{ id: 'one' }];

    function Row({ id }: { id: string }) {
      const expanded = state(false);
      expand = () => expanded.set(true);
      return expanded() ? (
        <>
          <span data-mixed-row-start={id}>{`${id}:start`}</span>
          <span data-mixed-row-end={id}>{`${id}:end`}</span>
        </>
      ) : (
        <strong data-mixed-row-single={id}>{`${id}:single`}</strong>
      );
    }

    function App() {
      const header = state('before');
      updateHeader = () => header.set('after');
      return (
        <main data-mixed-frame={'true'}>
          <header data-mixed-header={'true'}>{header()}</header>
          <For each={rows} by={(row) => row.id}>
            {(row) => <Row id={row.id} />}
          </For>
          {null}
          <footer data-mixed-tail={'true'}>{'tail'}</footer>
        </main>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });
    flushScheduler();

    const frame = root.querySelector('[data-mixed-frame]')!;
    const header = root.querySelector('[data-mixed-header]');
    const tail = root.querySelector('[data-mixed-tail]');
    const single = root.querySelector('[data-mixed-row-single]');

    expand();
    flushScheduler();
    const start = root.querySelector('[data-mixed-row-start]');
    const end = root.querySelector('[data-mixed-row-end]');
    expect(single?.isConnected).toBe(false);

    updateHeader();
    flushScheduler();

    expect(Array.from(frame.children, (node) => node.tagName)).toEqual([
      'HEADER',
      'SPAN',
      'SPAN',
      'FOOTER',
    ]);
    expect(root.querySelector('[data-mixed-header]')).toBe(header);
    expect(root.querySelector('[data-mixed-header]')?.textContent).toBe(
      'after'
    );
    expect(root.querySelector('[data-mixed-row-start]')).toBe(start);
    expect(root.querySelector('[data-mixed-row-end]')).toBe(end);
    expect(root.querySelector('[data-mixed-tail]')).toBe(tail);
  });

  it('should remove the live component range when a Show branch closes', () => {
    let expand!: () => void;
    let close!: () => void;
    let cleanups = 0;

    function Content() {
      const expanded = state(false);
      expand = () => expanded.set(true);
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected Content component instance');
      if (!instance.ownership.mounted) {
        (instance.ownership.cleanups ??= []).push(() => {
          cleanups += 1;
        });
      }
      return expanded() ? (
        <>
          <span data-show-start={'true'}>{'start'}</span>
          <span data-show-end={'true'}>{'end'}</span>
        </>
      ) : (
        <strong data-show-single={'true'}>{'single'}</strong>
      );
    }

    function App() {
      const visible = state(true);
      close = () => visible.set(false);
      return (
        <section data-show-frame={'true'}>
          <Show when={visible()}>
            <Content />
          </Show>
        </section>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });
    flushScheduler();

    const single = root.querySelector('[data-show-single]');
    expand();
    flushScheduler();
    const start = root.querySelector('[data-show-start]');
    const end = root.querySelector('[data-show-end]');
    expect(single?.isConnected, root.innerHTML).toBe(false);

    close();
    flushScheduler();

    expect(start?.isConnected).toBe(false);
    expect(end?.isConnected).toBe(false);
    expect(root.querySelector('[data-show-start]')).toBeNull();
    expect(root.querySelector('[data-show-end]')).toBeNull();
    expect(root.querySelector('[data-show-frame]')?.children).toHaveLength(0);
    expect(cleanups).toBe(1);
  });

  it('should update props on a retained transparent direct For item', () => {
    let updateRow!: () => void;

    function Row({ id, label }: { id: string; label: string }) {
      return (
        <>
          <span data-row-label={id}>{label}</span>
          <input data-row-editor={id} value={label} />
        </>
      );
    }

    function App() {
      const rows = state([{ id: 'one', label: 'before' }]);
      updateRow = () => rows.set([{ id: 'one', label: 'after' }]);
      return (
        <section>
          <For each={rows} by={(row) => row.id}>
            {(row) => <Row id={row.id} label={row.label} />}
          </For>
        </section>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });
    flushScheduler();

    const label = root.querySelector('[data-row-label="one"]');
    const editor = root.querySelector('[data-row-editor="one"]');
    updateRow();
    flushScheduler();

    expect(root.querySelector('[data-row-label="one"]')).toBe(label);
    expect(root.querySelector('[data-row-editor="one"]')).toBe(editor);
    expect(label?.textContent).toBe('after');
    expect((editor as HTMLInputElement | null)?.value).toBe('after');
  });

  it('should replace transparent component types for one retained For key', () => {
    let switchType!: () => void;
    let remove!: () => void;
    let firstCleanups = 0;
    let secondCleanups = 0;

    function First({ id }: { id: string }) {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected First component instance');
      if (!instance.ownership.mounted) {
        (instance.ownership.cleanups ??= []).push(() => {
          firstCleanups += 1;
        });
      }
      return (
        <>
          <span data-first-start={id}>{'first:start'}</span>
          <span data-first-end={id}>{'first:end'}</span>
        </>
      );
    }

    function Second({ id }: { id: string }) {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected Second component instance');
      if (!instance.ownership.mounted) {
        (instance.ownership.cleanups ??= []).push(() => {
          secondCleanups += 1;
        });
      }
      return (
        <>
          <strong data-second-start={id}>{'second:start'}</strong>
          <em data-second-end={id}>{'second:end'}</em>
        </>
      );
    }

    function App() {
      const rows = state([{ id: 'one', type: 'first' as 'first' | 'second' }]);
      switchType = () => {
        const type = rows()[0]?.type === 'first' ? 'second' : 'first';
        rows.set([{ id: 'one', type }]);
      };
      remove = () => rows.set([]);
      return (
        <section>
          <For each={rows} by={(row) => row.id}>
            {(row) =>
              row.type === 'first' ? (
                <First id={row.id} />
              ) : (
                <Second id={row.id} />
              )
            }
          </For>
        </section>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });
    flushScheduler();
    expect(root.querySelectorAll('[data-first-start]')).toHaveLength(1);

    switchType();
    flushScheduler();
    expect(root.querySelector('[data-first-start]')).toBeNull();
    expect(root.querySelectorAll('[data-second-start]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-second-end]')).toHaveLength(1);
    expect(firstCleanups).toBe(1);
    expect(secondCleanups).toBe(0);

    switchType();
    flushScheduler();
    expect(root.querySelector('[data-second-start]')).toBeNull();
    expect(root.querySelectorAll('[data-first-start]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-first-end]')).toHaveLength(1);
    expect(firstCleanups).toBe(1);
    expect(secondCleanups).toBe(1);

    remove();
    flushScheduler();
    expect(root.querySelector('[data-first-start]')).toBeNull();
    expect(firstCleanups).toBe(2);
    expect(secondCleanups).toBe(1);
  });

  it('should follow a direct For item across root-shape changes and swaps', () => {
    let setExpanded!: (expanded: boolean) => void;
    let swap!: () => void;
    let removeFirst!: () => void;
    let cleanups = 0;

    function Row({ id }: { id: string }) {
      if (id === 'two') {
        return (
          <i data-range-row={id} data-range-part={'single'}>
            {'two'}
          </i>
        );
      }

      const expanded = state(true);
      setExpanded = expanded.set;
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected Row component instance');
      if (!instance.ownership.mounted) {
        (instance.ownership.cleanups ??= []).push(() => {
          cleanups += 1;
        });
      }
      return expanded() ? (
        <>
          <span data-range-row={id} data-range-part={'start'}>
            {'one:start'}
          </span>
          <span data-range-row={id} data-range-part={'end'}>
            {'one:end'}
          </span>
        </>
      ) : (
        <strong data-range-row={id} data-range-part={'single'}>
          {'one'}
        </strong>
      );
    }

    function App() {
      const rows = state([{ id: 'one' }, { id: 'two' }]);
      swap = () => rows.set([rows()[1]!, rows()[0]!]);
      removeFirst = () => rows.set(rows().filter((row) => row.id !== 'one'));
      return (
        <section data-range-list={'true'}>
          <For each={rows} by={(row) => row.id}>
            {(row) => <Row id={row.id} />}
          </For>
        </section>
      );
    }

    const order = () =>
      Array.from(
        root!.querySelector('[data-range-list]')!.children,
        (node) =>
          `${node.getAttribute('data-range-row')}:${node.getAttribute(
            'data-range-part'
          )}`
      );

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });
    flushScheduler();
    const stableSecond = root.querySelector('[data-range-row="two"]');

    setExpanded(false);
    flushScheduler();
    const firstSingle = root.querySelector('[data-range-row="one"]');
    swap();
    flushScheduler();
    expect(order(), root.innerHTML).toEqual(['two:single', 'one:single']);
    expect(root.querySelector('[data-range-row="one"]')).toBe(firstSingle);
    expect(root.querySelector('[data-range-row="two"]')).toBe(stableSecond);

    setExpanded(true);
    flushScheduler();
    expect(firstSingle?.isConnected).toBe(false);
    expect(order(), root.innerHTML).toEqual([
      'two:single',
      'one:start',
      'one:end',
    ]);

    swap();
    flushScheduler();
    expect(order(), root.innerHTML).toEqual([
      'one:start',
      'one:end',
      'two:single',
    ]);
    expect(root.querySelector('[data-range-row="two"]')).toBe(stableSecond);

    setExpanded(false);
    flushScheduler();
    const secondSingle = root.querySelector('[data-range-row="one"]');
    removeFirst();
    flushScheduler();
    expect(secondSingle?.isConnected).toBe(false);
    expect(order()).toEqual(['two:single']);
    expect(cleanups).toBe(1);
  });

  it('should remove a fallback component from its current transparent range', () => {
    let expandFallback!: () => void;
    let setRows!: (rows: Array<{ id: string }>) => void;
    let fallbackCleanups = 0;
    let rowCleanups = 0;

    function Fallback() {
      const expanded = state(false);
      expandFallback = () => expanded.set(true);
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected Fallback component instance');
      if (!instance.ownership.mounted) {
        (instance.ownership.cleanups ??= []).push(() => {
          fallbackCleanups += 1;
        });
      }
      return expanded() ? (
        <>
          <span data-fallback-start={'true'}>{'empty:start'}</span>
          <span data-fallback-end={'true'}>{'empty:end'}</span>
        </>
      ) : (
        <strong data-fallback-single={'true'}>{'empty'}</strong>
      );
    }

    function Row({ id }: { id: string }) {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected fallback Row instance');
      if (!instance.ownership.mounted) {
        (instance.ownership.cleanups ??= []).push(() => {
          rowCleanups += 1;
        });
      }
      return (
        <>
          <span data-fallback-row-start={id}>{`${id}:start`}</span>
          <span data-fallback-row-end={id}>{`${id}:end`}</span>
        </>
      );
    }

    function App() {
      const rows = state<Array<{ id: string }>>([]);
      setRows = rows.set;
      return (
        <section>
          <For each={rows} by={(row) => row.id} fallback={<Fallback />}>
            {(row) => <Row id={row.id} />}
          </For>
        </section>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });
    flushScheduler();

    const fallbackSingle = root.querySelector('[data-fallback-single]');
    expandFallback();
    flushScheduler();
    const fallbackStart = root.querySelector('[data-fallback-start]');
    const fallbackEnd = root.querySelector('[data-fallback-end]');
    expect(fallbackSingle?.isConnected).toBe(false);

    setRows([{ id: 'one' }]);
    flushScheduler();
    expect(fallbackStart?.isConnected).toBe(false);
    expect(fallbackEnd?.isConnected).toBe(false);
    expect(
      root.querySelectorAll('[data-fallback-row-start]'),
      root.innerHTML
    ).toHaveLength(1);
    expect(root.querySelectorAll('[data-fallback-row-end]')).toHaveLength(1);
    expect(fallbackCleanups).toBe(1);

    setRows([]);
    flushScheduler();
    expect(root.querySelector('[data-fallback-row-start]')).toBeNull();
    expect(root.querySelector('[data-fallback-row-end]')).toBeNull();
    expect(root.querySelectorAll('[data-fallback-single]')).toHaveLength(1);
    expect(rowCleanups).toBe(1);
  });
});
