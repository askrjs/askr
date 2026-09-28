import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import { task } from '../../../src/resources';
import { createRoot } from '../../../src/core/dom/root';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('task callback commit rollback', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let disposeRoot: (() => void) | null = null;

  afterEach(() => {
    disposeRoot?.();
    disposeRoot = null;
    cleanup();
    vi.restoreAllMocks();
  });

  it('should run the last committed task callback after an aborted render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ({ container, cleanup } = createTestContainer());
    let flip!: State<boolean>;
    const calls: string[] = [];

    const App = () => {
      flip = state(false);
      const value = flip() ? 'uncommitted' : 'committed';
      task(() => {
        calls.push(value);
      });
      const keys = flip() ? ['b', 'a', 'c'] : ['a', 'b'];
      return (
        <div>
          <span>{value}</span>
          <ul id="list">
            {keys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      );
    };

    const root = createRoot(container);
    disposeRoot = () => root.dispose();
    root.render(<App />);
    const list = container.querySelector('#list')!;
    const error = new Error('later insertion failed');
    vi.spyOn(list, 'insertBefore').mockImplementation(() => {
      throw error;
    });

    expect(() => {
      flip.set(true);
      flushScheduler();
    }).toThrow(error);

    expect(container.querySelector('span')?.textContent).toBe('committed');
    expect(calls).toEqual(['committed']);
  });

  it('should run the latest callback after a successful render before start', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ({ container, cleanup } = createTestContainer());
    let flip!: State<boolean>;
    const calls: string[] = [];

    const App = () => {
      flip = state(false);
      const value = flip() ? 'latest' : 'initial';
      task(() => {
        calls.push(value);
      });
      return <span>{value}</span>;
    };

    const root = createRoot(container);
    disposeRoot = () => root.dispose();
    root.render(<App />);
    flip.set(true);
    flushScheduler();

    expect(container.querySelector('span')?.textContent).toBe('latest');
    expect(calls).toEqual(['latest']);
  });
});
