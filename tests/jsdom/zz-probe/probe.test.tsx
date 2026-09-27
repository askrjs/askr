import { describe, it } from 'vite-plus/test';
import { state } from '../../../src';
import { DefaultPortal, Portal } from '../../../src/core/api/portal';
import { createIsland } from '../../../test-utils/render/create-island';
import { createTestContainer, flushScheduler } from '../../../test-utils/render/test-renderer';
import { batch } from '../../../src/core/reactive/scheduler';
const log = (...a: unknown[]) => require('fs').appendFileSync('/private/tmp/claude-501/-Users-jrepanich-Code-askrjs-askr/d0c101ba-4fac-4e78-97c0-0cbdaf67001b/scratchpad/probe.txt', JSON.stringify(a) + '\n');

describe('probe', () => {
  it('explicit host mounted+unmounted in same flush', () => {
    const { container, cleanup } = createTestContainer();
    let setShow!: (v: boolean) => void;
    function Toggler() {
      const [show, set] = state(false);
      setShow = set;
      return show() ? <div><DefaultPortal /><span ref={(el: unknown) => { if (el) set(false); }} /></div> : null;
    }
    function App() {
      return (
        <main>
          <Toggler />
          <Portal>{<b>content</b>}</Portal>
        </main>
      );
    }
    createIsland({ root: container, component: App });
    flushScheduler();
    log('A', container.innerHTML);
    batch(() => setShow(true));
    flushScheduler();
    log('B', container.innerHTML);
    cleanup();
  });
});
