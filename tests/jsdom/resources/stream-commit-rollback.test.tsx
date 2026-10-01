import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { stream } from '../../../src/resources';
import { createRoot, type Root } from '../../../src/core/dom/root';
import {
  clearScheduler,
  flushSync,
} from '../../../src/core/reactive/scheduler';

let root: Root | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  root?.dispose();
  root = undefined;
  clearScheduler();
});

describe('stream structural commit rollback', () => {
  it('should activate the committed source after a newer structural commit aborts', () => {
    const container = document.createElement('div');
    const started: string[] = [];
    function Example(props: { id: string; extra?: boolean }) {
      stream(
        () => props.id,
        (id) => {
          started.push(id);
          return {
            [Symbol.asyncIterator]: () => ({
              next: () => new Promise<IteratorResult<string>>(() => {}),
            }),
          };
        }
      );
      return (
        <>
          <span>{'ready'}</span>
          {props.extra ? <i>{'extra'}</i> : null}
        </>
      );
    }

    root = createRoot(container);
    root.render(<Example id="committed" />);
    expect(started).toEqual([]);
    const prepared = root.prepare(<Example id="discarded" extra />);
    const failure = new Error('structural placement failed');
    const insert = vi
      .spyOn(container, 'insertBefore')
      .mockImplementationOnce(() => {
        throw failure;
      });

    expect(() => prepared.commit()).toThrow(failure);
    expect(prepared.aborted).toBe(true);
    insert.mockRestore();
    flushSync();

    expect(started).toEqual(['committed']);
    expect(container.querySelector('i')).toBe(null);

    root.render(<Example id="accepted" extra />);
    flushSync();
    expect(started).toEqual(['committed', 'accepted']);
    expect(container.querySelector('i')?.textContent).toBe('extra');
  });
});
