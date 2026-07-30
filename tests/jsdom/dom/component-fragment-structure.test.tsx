import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { For, state } from '../../../src';
import { cleanupApp, createIsland } from '../../../src/boot';
import { captureRangeFocus } from '../../../src/renderer/component-fragment-range';
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
    createIsland({ root, component: () => <main><Body /><span data-after="true" /></main> });
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
    const outside = document.createElement('button');
    root.append(start, input, end, outside);
    input.focus();

    const restoreFocus = captureRangeFocus({ start, end, single: false }, root);
    outside.focus();
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
});
