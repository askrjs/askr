import { afterEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { cleanupApp, createIsland } from '../../../src/boot';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

describe('component array structure', () => {
  let root: HTMLElement | undefined;

  afterEach(() => {
    if (root) {
      cleanupApp(root);
      root.remove();
      root = undefined;
    }
  });

  it('should keep component-returned array siblings transparent across updates and cleanup', () => {
    let update!: () => void;
    let remove!: () => void;

    function ArrayContent() {
      const revision = state('before');
      update = () => revision.set('after');
      return [
        <input
          key={'editor'}
          data-editor={'true'}
          value={'abcdef'}
          title={revision()}
        />,
        <button key={'action'} data-action={'true'}>
          {revision()}
        </button>,
      ];
    }

    function App() {
      const visible = state(true);
      remove = () => visible.set(false);
      return (
        <section data-frame={'true'}>
          {visible() ? <ArrayContent /> : null}
          <strong>tail</strong>
        </section>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });

    const frame = root.querySelector('[data-frame]')!;
    const editor = frame.querySelector('[data-editor]') as HTMLInputElement;
    const action = frame.querySelector('[data-action]') as HTMLButtonElement;
    expect(Array.from(frame.children, (child) => child.tagName)).toEqual([
      'INPUT',
      'BUTTON',
      'STRONG',
    ]);

    editor.focus();
    editor.setSelectionRange(2, 4, 'forward');
    update();
    flushScheduler();

    expect(frame.querySelector('[data-editor]')).toBe(editor);
    expect(frame.querySelector('[data-action]')).toBe(action);
    expect(Array.from(frame.children, (child) => child.tagName)).toEqual([
      'INPUT',
      'BUTTON',
      'STRONG',
    ]);
    expect(editor.title).toBe('after');
    expect(action.textContent).toBe('after');
    expect(document.activeElement).toBe(editor);
    expect([
      editor.selectionStart,
      editor.selectionEnd,
      editor.selectionDirection,
    ]).toEqual([2, 4, 'forward']);

    remove();
    flushScheduler();

    expect(Array.from(frame.children, (child) => child.tagName)).toEqual([
      'STRONG',
    ]);
    expect(editor.isConnected).toBe(false);
    expect(action.isConnected).toBe(false);
  });

  it('should roll back a partially reconciled component array without replacing siblings', () => {
    let fail!: () => void;

    function ArrayContent(props: { failing: boolean }) {
      const secondProps: Record<string, unknown> = {
        id: 'array-second',
        children: 'stable',
      };
      if (props.failing) {
        Object.defineProperty(secondProps, 'title', {
          enumerable: true,
          get() {
            throw new Error('component array rollback');
          },
        });
      }

      return [
        <span key={'first'} id={'array-first'}>
          {props.failing ? 'changed' : 'before'}
        </span>,
        <span key={'second'} {...secondProps} />,
      ];
    }

    function App() {
      const failing = state(false);
      fail = () => failing.set(true);
      return (
        <section data-frame={'true'}>
          <ArrayContent failing={failing()} />
        </section>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });

    const frame = root.querySelector('[data-frame]')!;
    const first = frame.querySelector('#array-first');
    const second = frame.querySelector('#array-second');

    fail();
    expect(() => flushScheduler()).toThrow('component array rollback');

    expect(frame.querySelector('#array-first')).toBe(first);
    expect(frame.querySelector('#array-second')).toBe(second);
    expect(first?.textContent).toBe('before');
    expect(second?.textContent).toBe('stable');
    expect(Array.from(frame.children, (child) => child.tagName)).toEqual([
      'SPAN',
      'SPAN',
    ]);
  });

  it('should roll back a failed singleton-to-array root replacement', () => {
    let setMode!: (mode: 'single' | 'broken' | 'multi') => void;
    let clicks = 0;

    function ArrayContent() {
      const mode = state<'single' | 'broken' | 'multi'>('single');
      setMode = mode.set;
      if (mode() === 'single') {
        return (
          <button
            data-single-root={'true'}
            onClick={() => {
              clicks += 1;
            }}
          >
            {'stable'}
          </button>
        );
      }

      const secondProps: Record<string, unknown> = {
        'data-array-end': 'true',
        children: 'end',
      };
      if (mode() === 'broken') {
        Object.defineProperty(secondProps, 'title', {
          enumerable: true,
          get() {
            throw new Error('singleton array replacement failed');
          },
        });
      }
      return [
        <span key={'start'} data-array-start={'true'}>
          {'start'}
        </span>,
        <span key={'end'} {...secondProps} />,
      ];
    }

    function App() {
      return (
        <section data-root-frame={'true'}>
          <ArrayContent />
          <i data-root-tail={'true'}>{'tail'}</i>
        </section>
      );
    }

    root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: App });
    flushScheduler();

    const frame = root.querySelector('[data-root-frame]')!;
    const single = root.querySelector(
      '[data-single-root]'
    ) as HTMLButtonElement;
    const tail = root.querySelector('[data-root-tail]');
    single.focus();

    setMode('broken');
    expect(() => flushScheduler()).toThrow(
      'singleton array replacement failed'
    );

    expect(root.querySelector('[data-single-root]')).toBe(single);
    expect(single.isConnected).toBe(true);
    expect(document.activeElement).toBe(single);
    expect(root.querySelector('[data-array-start]')).toBeNull();
    expect(root.querySelector('[data-array-end]')).toBeNull();
    expect(root.querySelector('[data-root-tail]')).toBe(tail);
    single.click();
    expect(clicks).toBe(1);

    setMode('multi');
    flushScheduler();
    expect(single.isConnected).toBe(false);
    expect(Array.from(frame.children, (node) => node.tagName)).toEqual([
      'SPAN',
      'SPAN',
      'I',
    ]);
    expect(root.querySelector('[data-root-tail]')).toBe(tail);
  });
});
