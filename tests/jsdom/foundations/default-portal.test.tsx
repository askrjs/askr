import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('DefaultPortal', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    // Reset the default portal so tests don't share state
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
  });

  it('should be present by default and render nothing until used', () => {
    createIsland({
      root: container,
      component: () => <div>{'App'}</div>,
    });
    flushScheduler();
    expect(container.textContent).toBe('App');
  });

  it('should render content into the default portal and clear it', () => {
    const App = () => {
      const tick = state(0);
      return (
        <button onClick={() => tick.set(tick() + 1)}>{`tick=${tick()}`}</button>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(typeof DefaultPortal.render).toBe('function');

    DefaultPortal.render({ children: 'Toast' });
    flushScheduler();
    expect(container.textContent).toContain('Toast');

    DefaultPortal.render({ children: undefined });
    flushScheduler();
    expect(container.textContent).not.toContain('Toast');
  });

  it('should render Portal children on initial render and update reactively', () => {
    const App = () => {
      const label = state('Toast');
      return (
        <>
          <button onClick={() => label.set('Updated')}>{'update'}</button>
          <Portal>{label()}</Portal>
        </>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.textContent).toContain('Toast');
    // Text portal content sits among the root's children with no wrapper.
    const initialPortalText = Array.from(container.childNodes).find(
      (node) =>
        node.nodeType === Node.TEXT_NODE && (node as Text).data === 'Toast'
    );
    expect(initialPortalText).toBeDefined();
    expect(Array.from(container.children).map((el) => el.tagName)).toEqual([
      'BUTTON',
    ]);

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.textContent).not.toContain('Toast');
    expect(container.textContent).toContain('Updated');
    expect(container.textContent?.match(/Updated/g)).toHaveLength(1);
    expect(Array.from(container.children).map((el) => el.tagName)).toEqual([
      'BUTTON',
    ]);
  });

  it('should preserve the final portal write in one render', () => {
    function NestedPortalWriter(props: { children: string }) {
      Portal({ children: `${props.children} pending` });
      Portal({ children: props.children });
      return null;
    }

    function App() {
      const label = state('Toast');
      return (
        <>
          <button onClick={() => label.set('Updated')}>{'update'}</button>
          <NestedPortalWriter>{label()}</NestedPortalWriter>
        </>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.textContent?.match(/Toast/g)).toHaveLength(1);

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.textContent).not.toContain('Toast');
    expect(container.textContent).not.toContain('pending');
    expect(container.textContent?.match(/Updated/g)).toHaveLength(1);
  });

  it('should discard portal writes from a failed render without dropping other writers', () => {
    let mode!: ReturnType<typeof state<'idle' | 'fail' | 'recover'>>;
    createIsland({
      root: container,
      component: () => {
        mode = state<'idle' | 'fail' | 'recover'>('idle');
        if (mode() === 'fail') {
          Portal({ children: 'Broken pending' });
          Portal({ children: 'Broken' });
          throw new Error('render failed');
        }
        if (mode() === 'recover') {
          Portal({ children: 'Recovered pending' });
          Portal({ children: 'Recovered' });
        }
        return <main>{'content'}</main>;
      },
    });
    flushScheduler();

    DefaultPortal.render({ children: 'Stable' });
    flushScheduler();
    expect(container.textContent?.match(/Stable/g)).toHaveLength(1);

    mode.set('fail');
    expect(() => flushScheduler()).toThrow('render failed');

    expect(container.textContent?.match(/Stable/g)).toHaveLength(1);
    expect(container.textContent).not.toContain('Broken');
    expect(container.textContent).not.toContain('pending');

    mode.set('recover');
    flushScheduler();

    expect(container.textContent?.match(/Stable/g)).toHaveLength(1);
    expect(container.textContent).not.toContain('pending');
    expect(container.textContent?.match(/Recovered/g)).toHaveLength(1);
  });
});
