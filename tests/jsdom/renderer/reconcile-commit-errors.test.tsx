import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import { ErrorBoundary } from '@askrjs/askr/components';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// A failing reconciliation commit must surface through the component update
// transaction (rollback, then the nearest ErrorBoundary or the flush), never
// be papered over by rebuilding the parent with replaceChildren().
describe('reconciliation commit errors', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let flip!: State<boolean>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Small keyed lists that reorder and grow take full reconciliation.
  const List = () => {
    flip = state(false);
    const keys = flip() ? ['b', 'a', 'c'] : ['a', 'b'];
    return (
      <ul id="list">
        {keys.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
    );
  };

  function failNextInsertInto(parentId: string, error: Error) {
    const insertBefore = Element.prototype.insertBefore;
    let armed = true;
    return vi
      .spyOn(Element.prototype, 'insertBefore')
      .mockImplementation(function <T extends Node>(
        this: Element,
        node: T,
        child: Node | null
      ): T {
        if (armed && this.id === parentId) {
          armed = false;
          throw error;
        }
        return insertBefore.call(this, node, child) as T;
      });
  }

  it('should roll back and throw a commit error instead of replacing children', () => {
    createIsland({ root: container, component: List });
    flushScheduler();
    const stable = container.innerHTML;
    const list = container.querySelector('#list')!;
    const stableChildren = Array.from(list.childNodes);

    const error = new Error('commit failed');
    failNextInsertInto('list', error);
    const replaceChildren = vi.spyOn(Element.prototype, 'replaceChildren');

    expect(() => {
      flip.set(true);
      flushScheduler();
    }).toThrow(error);

    expect(replaceChildren).not.toHaveBeenCalledWith(expect.anything());
    expect(container.innerHTML).toBe(stable);
    expect(Array.from(list.childNodes)).toEqual(stableChildren);
  });

  it('should route a commit error to the nearest ErrorBoundary', () => {
    const onError = vi.fn();
    const App = () => (
      <ErrorBoundary onError={onError}>
        <List />
      </ErrorBoundary>
    );
    createIsland({ root: container, component: App });
    flushScheduler();

    const error = new Error('commit failed');
    failNextInsertInto('list', error);

    flip.set(true);
    flushScheduler();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(error);
    expect(container.querySelector('[data-askr-error-boundary]')).toBeTruthy();
  });
});
