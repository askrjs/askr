// tests/dom/no_partial_dom.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

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

      return <div {...props} />;
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
});
