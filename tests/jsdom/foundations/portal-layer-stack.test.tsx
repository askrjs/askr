import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { defineScope, readScope, state } from '../../../src/index';
import { For } from '../../../src/control';
import {
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

// The documented stacking pattern: one writer owns the layer list (#495).
interface Layer {
  id: string;
  title: string;
}

interface LayerStack {
  open(layer: Layer): void;
  close(id: string): void;
}

const LayerStackScope = defineScope<LayerStack | null>(null);

function LayerStackProvider(props: { children?: unknown }) {
  const layers = state<Layer[]>([]);
  const stack: LayerStack = {
    open: (layer) => layers.set([...layers(), layer]),
    close: (id) => layers.set(layers().filter((layer) => layer.id !== id)),
  };
  return (
    <LayerStackScope value={stack}>
      {props.children}
      <Portal>
        <For each={layers} by={(layer) => layer.id}>
          {(layer) => <div data-layer={layer.id}>{layer.title}</div>}
        </For>
      </Portal>
    </LayerStackScope>
  );
}

function layerTitles(container: Element): string[] {
  return Array.from(container.querySelectorAll('[data-layer]')).map(
    (node) => node.textContent ?? ''
  );
}

describe('layer stack through a single portal writer', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
  });

  it('should render opened layers in order and keep the rest when one closes', () => {
    let stack!: LayerStack;
    function Page() {
      stack = readScope(LayerStackScope)!;
      return <main>{'page'}</main>;
    }

    createIsland({
      root: container,
      component: () => (
        <LayerStackProvider>
          <Page />
        </LayerStackProvider>
      ),
    });
    flushScheduler();

    stack.open({ id: 'settings', title: 'Settings' });
    stack.open({ id: 'confirm', title: 'Confirm' });
    flushScheduler();
    expect(layerTitles(container)).toEqual(['Settings', 'Confirm']);
    const confirm = container.querySelector('[data-layer="confirm"]');

    stack.close('settings');
    flushScheduler();
    expect(layerTitles(container)).toEqual(['Confirm']);
    expect(container.querySelector('[data-layer="confirm"]')).toBe(confirm);
  });
});
