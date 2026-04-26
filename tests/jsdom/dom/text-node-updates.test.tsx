// tests/dom/text_node_updates.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';

describe('text node updates (DOM)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should update function children in place through a reactive text binding', async () => {
    let text: ReturnType<typeof state<string>> | null = null;

    const Component = () => {
      text = state('a');
      return <div>{() => text!()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstTextNode = div.firstChild;

    expect(div.textContent).toBe('a');

    text!.set('b');
    flushScheduler();

    expect(div.textContent).toBe('b');
    expect(div.firstChild).toBe(firstTextNode);
  });

  it('should clean up reactive text bindings when replaced by static children', async () => {
    allowFrameworkWarnings(
      /Unused state variable detected in Component at index 1/
    );

    let mode: ReturnType<typeof state<'reactive' | 'static'>> | null = null;
    let text: ReturnType<typeof state<string>> | null = null;

    const Component = () => {
      mode = state<'reactive' | 'static'>('reactive');
      text = state('a');

      return <div>{mode() === 'reactive' ? () => text!() : 'static'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    expect(div.textContent).toBe('a');

    mode!.set('static');
    flushScheduler();

    expect(div.textContent).toBe('static');

    text!.set('b');
    flushScheduler();

    expect(div.textContent).toBe('static');
  });

  it('should update text content in place when state changes', async () => {
    let text: ReturnType<typeof state<string>> | null = null;
    const Component = () => {
      text = state('a');
      return <div>{text()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstTextNode = div.firstChild;

    text!.set('b');
    flushScheduler();

    const secondTextNode = (container.querySelector('div') as HTMLDivElement)
      .firstChild;

    expect(container.textContent).toBe('b');
    // Spec: update should reuse existing text node.
    expect(secondTextNode).toBe(firstTextNode);
  });

  it('should replace element with text node when type changes', async () => {
    let mode: ReturnType<typeof state<'element' | 'text'>> | null = null;

    const Component = () => {
      mode = state<'element' | 'text'>('element');
      return mode() === 'element' ? <span id={'node'}>{'x'}</span> : 'x';
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const first = container.querySelector('#node');
    expect(first).not.toBeNull();

    mode!.set('text');
    flushScheduler();

    expect(container.querySelector('#node')).toBeNull();
    expect(container.textContent).toBe('x');
    expect(container.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  });

  it('should render empty text node when content is empty string', async () => {
    let text: ReturnType<typeof state<string>> | null = null;
    const Component = () => {
      text = state('');
      return text();
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(container.textContent).toBe('');
    // Component returns empty string, which becomes a text node.
    // The container also has a portal host div, so there are 2 child nodes.
    expect(container.childNodes.length).toBeGreaterThanOrEqual(1);
    expect(container.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  });
});
