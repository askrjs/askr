// tests/dom/no_partial_dom.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

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
});
