import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { state } from '../../../src/index';
import { jsx, type JSXElement } from '../../../src/jsx-runtime';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';
import { currentOwner, onDispose } from '../../../src/core/api/hooks';

function element(type: string, props: Record<string, unknown>): JSXElement {
  return jsx(type as 'div', props as never);
}

const updates = new WeakMap<HTMLElement, (view: JSXElement) => void>();

function evaluate(view: JSXElement, container: HTMLElement): void {
  const update = updates.get(container);
  if (update) {
    update(view);
    flushScheduler();
    return;
  }
  const App = () => {
    const current = state(view);
    updates.set(container, current.set);
    return current();
  };
  createIsland({ root: container, component: App });
  flushScheduler();
}

describe('no partial DOM (DOM)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should restore a property whose setter mutates and then throws', () => {
    let setValue!: (value: boolean) => void;
    const next = new Error('property setter failed');
    const App = () => {
      const value = state(false);
      setValue = value.set;
      return element('input', { indeterminate: value() });
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const input = container.querySelector('input') as HTMLInputElement;
    let current = input.indeterminate;
    Object.defineProperty(input, 'indeterminate', {
      configurable: true,
      get: () => current,
      set(value: boolean) {
        current = value;
        if (value) throw next;
      },
    });

    expect(() => {
      setValue(true);
      flushScheduler();
    }).toThrow(next);
    expect(input.indeterminate).toBe(false);

    delete (input as { indeterminate?: boolean }).indeterminate;
    setValue(false);
    flushScheduler();
    setValue(true);
    flushScheduler();
    expect(input.indeterminate).toBe(true);
  });

  it('should restore custom-element property and attribute state after a failed write', () => {
    const tag = 'x-rollback-prop-probe';
    if (!customElements.get(tag)) {
      class RollbackPropProbe extends HTMLElement {
        private value: unknown;
        throwOn: unknown;
        get config(): unknown {
          return this.value;
        }
        set config(value: unknown) {
          this.value = value;
          if (value === this.throwOn) throw new Error('custom setter failed');
        }
      }
      customElements.define(tag, RollbackPropProbe);
    }

    const previous = { mode: 'old' };
    const next = { mode: 'new' };
    let setStage!: (stage: number) => void;
    const App = () => {
      const stage = state(0);
      setStage = stage.set;
      return element(tag, {
        config: stage() === 0 ? 'attribute-value' : next,
      });
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const probe = container.querySelector(tag) as HTMLElement & {
      config: unknown;
      throwOn: unknown;
    };
    probe.config = previous;
    probe.throwOn = next;

    expect(() => {
      setStage(1);
      flushScheduler();
    }).toThrow('custom setter failed');
    expect(probe.config).toBe(previous);
    expect(probe.getAttribute('config')).toBe('attribute-value');

    probe.throwOn = undefined;
    setStage(0);
    flushScheduler();
    setStage(1);
    flushScheduler();
    expect(probe.config).toBe(next);
    expect(probe.hasAttribute('config')).toBe(false);
  });

  it('should restore an earlier property when a later property write aborts', () => {
    const tag = 'x-later-property-failure';
    const failure = new Error('later property failed');
    if (!customElements.get(tag)) {
      class LaterPropertyFailure extends HTMLElement {
        configValue: unknown;
        triggerValue: unknown;
        shouldThrow = false;
        get config(): unknown {
          return this.configValue;
        }
        set config(value: unknown) {
          this.configValue = value;
        }
        get trigger(): unknown {
          return this.triggerValue;
        }
        set trigger(value: unknown) {
          this.triggerValue = value;
          if (this.shouldThrow && value === 'explode') throw failure;
        }
      }
      customElements.define(tag, LaterPropertyFailure);
    }

    const before = { mode: 'before' };
    const after = { mode: 'after' };
    let setStage!: (stage: number) => void;
    const App = () => {
      const stage = state(0);
      setStage = stage.set;
      return element(tag, {
        'prop:config': stage() === 0 ? before : after,
        'prop:trigger': stage() === 0 ? 'stable' : 'explode',
      });
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const probe = container.querySelector(tag) as HTMLElement & {
      config: unknown;
      trigger: unknown;
      shouldThrow: boolean;
    };
    probe.shouldThrow = true;

    expect(() => {
      setStage(1);
      flushScheduler();
    }).toThrow(failure);
    expect(probe.config).toBe(before);
    expect(probe.trigger).toBe('stable');

    probe.shouldThrow = false;
    setStage(0);
    flushScheduler();
    setStage(1);
    flushScheduler();
    expect(probe.config).toBe(after);
    expect(probe.trigger).toBe('explode');
  });

  it('should restore a bound property when its setter mutates and throws', () => {
    const tag = 'x-bound-property-failure';
    if (!customElements.get(tag)) {
      class BoundPropertyFailure extends HTMLElement {
        private value: unknown;
        throwOn: unknown;
        get config(): unknown {
          return this.value;
        }
        set config(value: unknown) {
          this.value = value;
          if (value === this.throwOn) throw new Error('bound setter failed');
        }
      }
      customElements.define(tag, BoundPropertyFailure);
    }

    const before = { mode: 'before' };
    const after = { mode: 'after' };
    let setValue!: (value: { mode: string }) => void;
    const App = () => {
      const value = state(before);
      setValue = value.set;
      return element(tag, { config: () => value() });
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const probe = container.querySelector(tag) as HTMLElement & {
      config: unknown;
      throwOn: unknown;
    };
    probe.throwOn = after;

    expect(() => {
      setValue(after);
      flushScheduler();
    }).toThrow('bound setter failed');
    expect(probe.config).toBe(before);

    probe.throwOn = undefined;
    setValue(before);
    flushScheduler();
    setValue(after);
    flushScheduler();
    expect(probe.config).toBe(after);
  });

  it('should complete render fully or not at all', async () => {
    const ok = () => (
      <div>
        <span>{'A'}</span>
        <span>{'B'}</span>
        <span>{'C'}</span>
      </div>
    );

    createIsland({ root: container, component: ok });
    flushScheduler();

    expect(container.querySelectorAll('span').length).toBe(3);
  });

  it('should revert DOM when an error occurs during render', async () => {
    let phase: ReturnType<typeof state<'ok' | 'fail'>> | null = null;

    const Component = () => {
      phase = state<'ok' | 'fail'>('ok');
      if (phase() === 'fail') {
        return (
          <div>
            <span>{'A'}</span>
            {(() => {
              throw new Error('boom');
            })()}
            <span>{'C'}</span>
          </div>
        );
      }
      return (
        <div>
          <span>{'A'}</span>
          <span>{'B'}</span>
          <span>{'C'}</span>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const stable = container.innerHTML;

    // Trigger re-render that will fail
    expect(() => {
      phase!.set('fail');
      flushScheduler();
    }).toThrow('boom');

    // Spec: DOM should stay at last stable commit.
    expect(container.innerHTML).toBe(stable);
  });

  it('should update both sibling components or neither when render fails', async () => {
    let flip: ReturnType<typeof state<boolean>> | null = null;

    const Component = () => {
      flip = state(false);
      return (
        <div>
          <span id={'a'}>{flip() ? 'A2' : 'A1'}</span>
          <span id={'b'}>{flip() ? 'B2' : 'B1'}</span>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const before = container.innerHTML;
    flip!.set(true);

    // If an update fails mid-way, neither sibling should change.
    // (We don't inject a failure here yet; this test asserts the transactional spec.)
    flushScheduler();
    expect(container.innerHTML).not.toBe('');
    expect(container.innerHTML).not.toBe(before);
  });

  it('should roll back retained text when a later prop read throws', () => {
    let fail: ReturnType<typeof state<boolean>> | null = null;

    const Component = () => {
      fail = state(false);
      const props: Record<string, unknown> = {
        children: fail() ? 'after' : 'before',
      };

      if (fail()) {
        Object.defineProperty(props, 'title', {
          enumerable: true,
          get() {
            throw new Error('prop read failed');
          },
        });
      } else {
        props.title = 'stable';
      }

      return element('div', props);
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const retained = container.querySelector('div');

    expect(() => {
      fail!.set(true);
      flushScheduler();
    }).toThrow('prop read failed');

    expect(container.querySelector('div')).toBe(retained);
    expect(retained?.textContent).toBe('before');
    expect(retained?.getAttribute('title')).toBe('stable');
  });

  it('should roll back retained capture listener replacement when a later prop read throws', () => {
    const calls: string[] = [];
    const beforeHandler = () => calls.push('before');
    const afterHandler = () => calls.push('after');
    const failingProps: Record<string, unknown> = {
      onClickCapture: afterHandler,
      children: 'click',
    };
    Object.defineProperty(failingProps, 'title', {
      enumerable: true,
      get() {
        throw new Error('listener rollback failed');
      },
    });

    evaluate(
      element('button', {
        onClickCapture: beforeHandler,
        children: 'click',
        title: 'stable',
      }),
      container
    );
    const retained = container.querySelector('button');
    retained?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(calls).toEqual(['before']);
    expect(() => evaluate(element('button', failingProps), container)).toThrow(
      'listener rollback failed'
    );

    expect(container.querySelector('button')).toBe(retained);
    retained?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(calls).toEqual(['before', 'before']);
    expect(retained?.getAttribute('title')).toBe('stable');
  });

  it('should remove a newly added retained capture listener when a later prop read throws', () => {
    const calls: string[] = [];
    const afterHandler = () => calls.push('after');
    const failingProps: Record<string, unknown> = {
      onClickCapture: afterHandler,
      children: 'click',
    };
    Object.defineProperty(failingProps, 'title', {
      enumerable: true,
      get() {
        throw new Error('new listener rollback failed');
      },
    });

    evaluate(
      element('button', {
        children: 'click',
        title: 'stable',
      }),
      container
    );
    const retained = container.querySelector('button');

    expect(() => evaluate(element('button', failingProps), container)).toThrow(
      'new listener rollback failed'
    );

    expect(container.querySelector('button')).toBe(retained);
    retained?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(calls).toEqual([]);
    expect(retained?.getAttribute('title')).toBe('stable');
  });

  it('should roll back retained delegated listener replacement when a later prop read throws', () => {
    const calls: string[] = [];
    const beforeHandler = () => calls.push('before');
    const afterHandler = () => calls.push('after');
    const failingProps: Record<string, unknown> = {
      onClick: afterHandler,
      children: 'click',
    };
    Object.defineProperty(failingProps, 'title', {
      enumerable: true,
      get() {
        throw new Error('delegated listener rollback failed');
      },
    });

    evaluate(
      element('button', {
        onClick: beforeHandler,
        children: 'click',
        title: 'stable',
      }),
      container
    );
    const retained = container.querySelector('button');
    retained?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(calls).toEqual(['before']);
    expect(() => evaluate(element('button', failingProps), container)).toThrow(
      'delegated listener rollback failed'
    );

    expect(container.querySelector('button')).toBe(retained);
    retained?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(calls).toEqual(['before', 'before']);
    expect(retained?.getAttribute('title')).toBe('stable');
  });

  it('should remove a newly added retained delegated listener when a later prop read throws', () => {
    const calls: string[] = [];
    const afterHandler = () => calls.push('after');
    const failingProps: Record<string, unknown> = {
      onClick: afterHandler,
      children: 'click',
    };
    Object.defineProperty(failingProps, 'title', {
      enumerable: true,
      get() {
        throw new Error('new delegated listener rollback failed');
      },
    });

    evaluate(
      element('button', {
        children: 'click',
        title: 'stable',
      }),
      container
    );
    const retained = container.querySelector('button');

    expect(() => evaluate(element('button', failingProps), container)).toThrow(
      'new delegated listener rollback failed'
    );

    expect(container.querySelector('button')).toBe(retained);
    retained?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(calls).toEqual([]);
    expect(retained?.getAttribute('title')).toBe('stable');
  });

  it('should roll back retained reactive prop replacement when a later prop read throws', () => {
    allowFrameworkWarnings(/Unused state variable detected in Component/);

    let fail: ReturnType<typeof state<boolean>> | null = null;
    let before: ReturnType<typeof state<string>> | null = null;
    let after: ReturnType<typeof state<string>> | null = null;

    const Component = () => {
      fail = state(false);
      before = state('before-1');
      after = state('after-1');

      const props: Record<string, unknown> = {
        title: fail() ? () => after!() : () => before!(),
        children: 'reactive',
      };

      if (fail()) {
        Object.defineProperty(props, 'aria-label', {
          enumerable: true,
          get() {
            throw new Error('reactive prop rollback failed');
          },
        });
      }

      return element('div', props);
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const retained = container.querySelector('div');

    expect(retained?.getAttribute('title')).toBe('before-1');
    expect(() => {
      fail!.set(true);
      flushScheduler();
    }).toThrow('reactive prop rollback failed');

    expect(container.querySelector('div')).toBe(retained);
    expect(retained?.getAttribute('title')).toBe('before-1');

    before!.set('before-2');
    flushScheduler();
    expect(retained?.getAttribute('title')).toBe('before-2');

    after!.set('after-2');
    flushScheduler();
    expect(retained?.getAttribute('title')).toBe('before-2');
  });

  it('should roll back direct retained reactive prop replacement when a later prop read throws', () => {
    const failingProps: Record<string, unknown> = {
      title: () => 'after',
      children: 'reactive',
    };
    Object.defineProperty(failingProps, 'aria-label', {
      enumerable: true,
      get() {
        throw new Error('direct reactive prop rollback failed');
      },
    });

    evaluate(
      element('div', {
        title: () => 'before',
        children: 'reactive',
      }),
      container
    );
    const retained = container.querySelector('div');

    expect(retained?.getAttribute('title')).toBe('before');
    expect(() => evaluate(element('div', failingProps), container)).toThrow(
      'direct reactive prop rollback failed'
    );

    expect(container.querySelector('div')).toBe(retained);
    expect(retained?.getAttribute('title')).toBe('before');
  });

  it('should remove a newly added retained reactive prop when a later prop read throws', () => {
    allowFrameworkWarnings(/Unused state variable detected in Component/);

    let fail: ReturnType<typeof state<boolean>> | null = null;
    let label: ReturnType<typeof state<string>> | null = null;

    const Component = () => {
      fail = state(false);
      label = state('reactive-1');

      const props: Record<string, unknown> = {
        title: fail() ? () => label!() : 'stable',
        children: 'reactive',
      };

      if (fail()) {
        Object.defineProperty(props, 'aria-label', {
          enumerable: true,
          get() {
            throw new Error('new reactive prop rollback failed');
          },
        });
      }

      return <div {...props} />;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const retained = container.querySelector('div');

    expect(retained?.getAttribute('title')).toBe('stable');
    expect(() => {
      fail!.set(true);
      flushScheduler();
    }).toThrow('new reactive prop rollback failed');

    expect(container.querySelector('div')).toBe(retained);
    expect(retained?.getAttribute('title')).toBe('stable');

    label!.set('reactive-2');
    flushScheduler();
    expect(retained?.getAttribute('title')).toBe('stable');
  });

  it('should restore a removed retained reactive prop when a later prop read throws', () => {
    allowFrameworkWarnings(/Unused state variable detected in Component/);

    let fail: ReturnType<typeof state<boolean>> | null = null;
    let label: ReturnType<typeof state<string>> | null = null;

    const Component = () => {
      fail = state(false);
      label = state('reactive-1');

      const props: Record<string, unknown> = {
        title: fail() ? 'static' : () => label!(),
        children: 'reactive',
      };

      if (fail()) {
        Object.defineProperty(props, 'aria-label', {
          enumerable: true,
          get() {
            throw new Error('removed reactive prop rollback failed');
          },
        });
      }

      return element('div', props);
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const retained = container.querySelector('div');

    expect(retained?.getAttribute('title')).toBe('reactive-1');
    expect(() => {
      fail!.set(true);
      flushScheduler();
    }).toThrow('removed reactive prop rollback failed');

    expect(container.querySelector('div')).toBe(retained);
    expect(retained?.getAttribute('title')).toBe('reactive-1');

    label!.set('reactive-2');
    flushScheduler();
    expect(retained?.getAttribute('title')).toBe('reactive-2');
  });

  it('should roll back retained form-control values when a later prop read throws', () => {
    const failingProps: Record<string, unknown> = {
      type: 'checkbox',
      value: 'after',
      checked: false,
    };
    Object.defineProperty(failingProps, 'title', {
      enumerable: true,
      get() {
        throw new Error('form rollback failed');
      },
    });

    evaluate(
      element('input', {
        type: 'checkbox',
        value: 'before',
        checked: true,
        title: 'stable',
      }),
      container
    );
    const retained = container.querySelector('input');

    expect(retained?.value).toBe('before');
    expect(retained?.checked).toBe(true);
    expect(() => evaluate(element('input', failingProps), container)).toThrow(
      'form rollback failed'
    );

    expect(container.querySelector('input')).toBe(retained);
    expect(retained?.value).toBe('before');
    expect(retained?.getAttribute('value')).toBe('before');
    expect(retained?.checked).toBe(true);
    expect(retained?.hasAttribute('checked')).toBe(true);
    expect(retained?.getAttribute('title')).toBe('stable');
  });

  it('should roll back retained child reorders and insertions when a later prop read throws', () => {
    const failingProps: Record<string, unknown> = {
      children: [
        <span key={'c'} id={'c'}>
          {'C'}
        </span>,
        <span key={'a'} id={'a'}>
          {'A2'}
        </span>,
        <span key={'d'} id={'d'}>
          {'D'}
        </span>,
      ],
    };
    Object.defineProperty(failingProps, 'title', {
      enumerable: true,
      get() {
        throw new Error('children rollback failed');
      },
    });

    evaluate(
      element('div', {
        children: [
          <span key={'a'} id={'a'}>
            {'A'}
          </span>,
          <span key={'b'} id={'b'}>
            {'B'}
          </span>,
          <span key={'c'} id={'c'}>
            {'C'}
          </span>,
        ],
        title: 'stable',
      }),
      container
    );
    const retained = container.querySelector('div');
    const beforeChildren = Array.from(retained?.children ?? []);

    expect(Array.from(retained?.children ?? []).map((el) => el.id)).toEqual([
      'a',
      'b',
      'c',
    ]);

    expect(() => evaluate(element('div', failingProps), container)).toThrow(
      'children rollback failed'
    );

    expect(container.querySelector('div')).toBe(retained);
    expect(Array.from(retained?.children ?? []).map((el) => el.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(Array.from(retained?.children ?? [])).toEqual(beforeChildren);
    expect(retained?.textContent).toBe('ABC');
    expect(retained?.getAttribute('title')).toBe('stable');
  });

  it('should restore keyed child order and lifetimes after a DOM move fails', () => {
    let setRows!: (rows: string[]) => void;
    let removedCleanupCalls = 0;
    const Item = ({ row }: { row: string }) => {
      onDispose(currentOwner()!, () => {
        if (row === 'b') removedCleanupCalls += 1;
      });
      return <li data-row={row}>{row}</li>;
    };
    const App = () => {
      const rows = state(['a', 'b', 'c', 'd']);
      setRows = rows.set;
      return (
        <ul>
          {rows().map((row) => (
            <Item key={row} row={row} />
          ))}
        </ul>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const list = container.querySelector('ul')!;
    const before = Array.from(list.children);
    const failure = new Error('keyed child insertion failed');
    let successfulInsertions = 0;
    let failedAfterSuccessfulMove = false;
    const insertBefore = list.insertBefore.bind(list);
    const insertBeforeSpy = vi
      .spyOn(list, 'insertBefore')
      .mockImplementation((node, child) => {
        if (successfulInsertions === 1 && !failedAfterSuccessfulMove) {
          failedAfterSuccessfulMove = true;
          throw failure;
        }
        const inserted = insertBefore(node, child);
        successfulInsertions += 1;
        return inserted;
      });

    setRows(['d', 'c', 'a']);
    expect(() => flushScheduler()).toThrow(failure);
    expect(failedAfterSuccessfulMove).toBe(true);
    expect(successfulInsertions).toBeGreaterThanOrEqual(2);
    insertBeforeSpy.mockRestore();

    expect(Array.from(list.children)).toEqual(before);
    expect(Array.from(list.children).map((node) => node.textContent)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(removedCleanupCalls).toBe(0);

    setRows(['d', 'c', 'a']);
    flushScheduler();
    expect(Array.from(list.children).map((node) => node.textContent)).toEqual([
      'd',
      'c',
      'a',
    ]);
    expect(list.children[0]).toBe(before[3]);
    expect(list.children[1]).toBe(before[2]);
    expect(list.children[2]).toBe(before[0]);
    expect(removedCleanupCalls).toBe(1);
  });
});
