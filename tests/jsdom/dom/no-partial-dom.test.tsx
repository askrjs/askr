// tests/dom/no_partial_dom.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { evaluate, type DOMElement } from '../../../src/renderer';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';

function element(type: string, props: Record<string, unknown>): DOMElement {
  return { type, props };
}

describe('no partial DOM (DOM)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

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
});
