import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { ErrorBoundary } from '@askrjs/askr/components';
import { cleanupApp } from '../../../src/boot';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * Delegated handlers on elements created by a render that is later discarded
 * (here, rewound by an ErrorBoundary) must not keep their event type's
 * delegation alive: once no rendered element uses it, no container listens.
 */
describe('delegated handlers of discarded renders', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  const listening = new Map<EventTarget, Map<string, number>>();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const track = (delta: number) =>
      function (this: EventTarget, type: string) {
        const byType = listening.get(this) ?? new Map<string, number>();
        byType.set(type, (byType.get(type) ?? 0) + delta);
        listening.set(this, byType);
      };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(
      function (this: EventTarget, ...args) {
        track(1).call(this, args[0]);
        return add.apply(this, args);
      }
    );
    vi.spyOn(EventTarget.prototype, 'removeEventListener').mockImplementation(
      function (this: EventTarget, ...args) {
        track(-1).call(this, args[0]);
        return remove.apply(this, args);
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    listening.clear();
    cleanup();
  });

  it('should stop listening for an event only a discarded subtree used', () => {
    function Failing(): never {
      throw new Error('render failed');
    }

    createIsland({
      root: container,
      component: () => (
        <ErrorBoundary fallback={<p>fallback</p>}>
          <div>
            <button onDblClick={() => {}}>twice</button>
            <Failing />
          </div>
        </ErrorBoundary>
      ),
    });
    flushScheduler();
    expect(container.textContent).toBe('fallback');

    cleanupApp(container);
    const netDblClick = [...listening.values()].reduce(
      (total, byType) => total + (byType.get('dblclick') ?? 0),
      0
    );
    expect(netDblClick).toBe(0);
  });
});
