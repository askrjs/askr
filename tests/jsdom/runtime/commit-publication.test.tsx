import { describe, expect, it, vi } from 'vite-plus/test';
import { state, type State } from '../../../src/runtime/state';
import {
  getCurrentInstance,
  type ComponentInstance,
} from '../../../src/runtime';
import { render } from '../../../src/testing';
import { task } from '../../../src/runtime';
import { getRuntimeRenderer } from '../../../src/runtime/access';
import { registerCommitParticipant } from '../../../src/runtime/transaction-access';

describe('commit publication boundary', () => {
  it('should retain the previous lifetime when an extension declines range replacement and publication fails', () => {
    let visible!: State<boolean>;
    let owner!: ComponentInstance;
    const view = render(() => <Child />);
    function Child() {
      owner = getCurrentInstance()!;
      visible = state(false);
      return visible() ? <button>{'ready'}</button> : null;
    }
    const previous = view.root.innerHTML;
    const previousOwner = owner.owner;
    const renderer = getRuntimeRenderer();
    const evaluate = renderer.evaluate.bind(renderer);
    const replacement = vi
      .spyOn(renderer, 'replaceComponentRange')
      .mockReturnValue(null);
    const application = vi
      .spyOn(renderer, 'evaluate')
      .mockImplementation((...args) => {
        evaluate(...args);
        registerCommitParticipant({
          publish() {
            throw new Error('extension publication failed');
          },
        });
      });
    try {
      visible.set(true);
      expect(() => view.flush()).toThrow('extension publication failed');
      expect(view.root.innerHTML).toBe(previous);
      expect(owner.owner).toBe(previousOwner);
      expect(owner.owner.disposed).toBe(false);
      expect(visible._readers?.has(owner)).toBe(true);
    } finally {
      replacement.mockRestore();
      application.mockRestore();
      view.cleanup();
    }
  });

  it('should retain a departed child lifetime when later application fails', async () => {
    let phase!: State<boolean>;
    let retired = 0;
    let child!: ComponentInstance;
    function Previous() {
      child = getCurrentInstance()!;
      task(() => () => {
        retired++;
      });
      return <button>{'previous'}</button>;
    }
    function Branch() {
      phase = state(false);
      return [
        phase() ? <em key="next">{'next'}</em> : <Previous key="previous" />,
        <span key="sibling">{'sibling'}</span>,
      ];
    }
    const view = render(() => <Branch />);
    await Promise.resolve();
    await Promise.resolve();
    const button = view.root.querySelector('button')!;
    const sibling = view.root.querySelector('span')!;
    const parent = sibling.parentElement!;
    const snapshot = view.root.innerHTML;
    const original = parent.insertBefore.bind(parent);
    let failed = false;
    const insertion = vi
      .spyOn(parent, 'insertBefore')
      .mockImplementation((node, before) => {
        if (node === sibling && !failed) {
          failed = true;
          throw new Error('late application failed');
        }
        return original(node, before);
      });
    try {
      phase.set(true);
      expect(() => view.flush()).toThrow('late application failed');
      expect(view.root.innerHTML).toBe(snapshot);
      expect(view.root.querySelector('button')).toBe(button);
      expect(retired).toBe(0);
      expect(child.owner.disposed).toBe(false);
      expect(child.owner.mounted).toBe(true);
    } finally {
      insertion.mockRestore();
      view.cleanup();
    }
    expect(retired).toBe(1);
  });

  it('should restore output and subscriptions when final range application fails', () => {
    let phase!: State<boolean>;
    let previousSource!: State<number>;
    let nextSource!: State<number>;
    let owner!: ComponentInstance;
    const clicks: boolean[] = [];
    const refs: Array<[boolean, Element | null]> = [];
    function Child() {
      owner = getCurrentInstance()!;
      phase = state(false);
      previousSource = state(1);
      nextSource = state(2);
      const next = phase();
      const value = next ? nextSource() : previousSource();
      return [
        <button
          key="button"
          data-phase={String(next)}
          ref={(node) => refs.push([next, node])}
          onClick={() => clicks.push(next)}
        >
          {value}
        </button>,
        <span key="sibling">{'sibling'}</span>,
      ];
    }
    const view = render(() => <Child />);
    const button = view.root.querySelector('button')!;
    const parent = button.parentElement!;
    const original = parent.insertBefore.bind(parent);
    const snapshot = view.root.innerHTML;
    let failed = false;
    const insertion = vi
      .spyOn(parent, 'insertBefore')
      .mockImplementation((node, before) => {
        if (node === button && !failed) {
          failed = true;
          throw new Error('final range application failed');
        }
        return original(node, before);
      });
    try {
      phase.set(true);
      expect(() => view.flush()).toThrow('final range application failed');
      expect(failed).toBe(true);
      expect(view.root.innerHTML).toBe(snapshot);
      expect(view.root.querySelector('button')).toBe(button);
      expect(previousSource._readers?.has(owner)).toBe(true);
      expect(nextSource._readers?.has(owner) ?? false).toBe(false);
      expect(refs).toEqual([[false, button]]);
      button.click();
      expect(clicks).toEqual([false]);
      insertion.mockRestore();
      nextSource.set(7);
      previousSource.set(9);
      view.flush();
      expect(view.root.querySelector('button')).toBe(button);
      expect(button.textContent).toBe('7');
      expect(button.dataset.phase).toBe('true');
      button.click();
      expect(clicks).toEqual([false, true]);
    } finally {
      insertion.mockRestore();
      view.cleanup();
    }
  });
});
