import { afterEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { cleanupApp, createIsland } from '../../../src/boot';
import type { DOMElement } from '../../../src/renderer';
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

  it('keeps component-returned array siblings transparent across updates and cleanup', () => {
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

  it('rolls back a partially reconciled component array without replacing siblings', () => {
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
        {
          type: 'span',
          key: 'first',
          props: {
            id: 'array-first',
            children: props.failing ? 'changed' : 'before',
          },
        } as DOMElement,
        {
          type: 'span',
          key: 'second',
          props: secondProps,
        } as DOMElement,
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
});
