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

  it('should update a fragment-wrapped function child in place without rerendering the parent', async () => {
    let text: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      text = state('a');
      return (
        <div>
          <>{() => text!()}</>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstTextNode = div.firstChild;

    expect(div.textContent).toBe('a');
    expect(parentRenderCount).toBe(1);

    text!.set('b');
    flushScheduler();

    expect(div.textContent).toBe('b');
    expect(div.firstChild).toBe(firstTextNode);
    expect(parentRenderCount).toBe(1);
  });

  it('should update mixed static and reactive text siblings in place without rerendering the parent', async () => {
    let text: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      text = state('mid');

      return (
        <div>
          {'pre:'}
          {() => text!()}
          {':post'}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('pre:mid:post');
    expect(firstNodes).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    text!.set('next');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('pre:next:post');
    expect(secondNodes).toHaveLength(3);
    expect(secondNodes[0]).toBe(firstNodes[0]);
    expect(secondNodes[1]).toBe(firstNodes[1]);
    expect(secondNodes[2]).toBe(firstNodes[2]);
    expect(parentRenderCount).toBe(1);
  });

  it('should update multiple reactive text siblings in place without rerendering the parent', async () => {
    let left: ReturnType<typeof state<string>> | null = null;
    let right: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      left = state('L');
      right = state('R');

      return (
        <div>
          <>
            {() => left!()}
            {'|'}
            {() => right!()}
          </>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('L|R');
    expect(firstNodes).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    left!.set('A');
    right!.set('B');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('A|B');
    expect(secondNodes).toHaveLength(3);
    expect(secondNodes[0]).toBe(firstNodes[0]);
    expect(secondNodes[1]).toBe(firstNodes[1]);
    expect(secondNodes[2]).toBe(firstNodes[2]);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a reactive child function that returns scalar siblings without rerendering the parent', async () => {
    let left: ReturnType<typeof state<string>> | null = null;
    let right: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      left = state('L');
      right = state('R');

      return <div>{() => [left!(), '|', right!()]}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('L|R');
    expect(firstNodes).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    left!.set('A');
    right!.set('B');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('A|B');
    expect(secondNodes).toHaveLength(3);
    expect(secondNodes[0]).toBe(firstNodes[0]);
    expect(secondNodes[1]).toBe(firstNodes[1]);
    expect(secondNodes[2]).toBe(firstNodes[2]);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a reactive child function that returns a fragment of scalar siblings without rerendering the parent', async () => {
    let left: ReturnType<typeof state<string>> | null = null;
    let right: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      left = state('L');
      right = state('R');

      return (
        <div>
          {() => (
            <>
              {left!()}
              {'|'}
              {right!()}
            </>
          )}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('L|R');
    expect(firstNodes).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    left!.set('A');
    right!.set('B');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('A|B');
    expect(secondNodes).toHaveLength(3);
    expect(secondNodes[0]).toBe(firstNodes[0]);
    expect(secondNodes[1]).toBe(firstNodes[1]);
    expect(secondNodes[2]).toBe(firstNodes[2]);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a single dynamic element child without rerendering the parent', async () => {
    let mode: ReturnType<typeof state<'span' | 'button'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'span' | 'button'>('span');

      return (
        <div>
          {() =>
            mode!() === 'span' ? (
              <span data-kind={'span'}>{'alpha'}</span>
            ) : (
              <button data-kind={'button'}>{'beta'}</button>
            )
          }
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const span = div.querySelector('span') as HTMLSpanElement;

    expect(span.textContent).toBe('alpha');
    expect(parentRenderCount).toBe(1);

    mode!.set('button');
    flushScheduler();

    const button = div.querySelector('button') as HTMLButtonElement;

    expect(div.querySelector('span')).toBeNull();
    expect(button.textContent).toBe('beta');
    expect(parentRenderCount).toBe(1);
  });

  it('should update a single dynamic child that returns a fragment with one root without rerendering the parent', async () => {
    let text: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      text = state('alpha');

      return (
        <div>
          {() => (
            <>
              <span>{text!()}</span>
            </>
          )}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const span = div.querySelector('span') as HTMLSpanElement;

    expect(span.textContent).toBe('alpha');
    expect(parentRenderCount).toBe(1);

    text!.set('beta');
    flushScheduler();

    const spanAfter = div.querySelector('span') as HTMLSpanElement;

    expect(spanAfter).toBe(span);
    expect(spanAfter.textContent).toBe('beta');
    expect(parentRenderCount).toBe(1);
  });

  it('should update a mixed static and dynamic element sandwich without rerendering the parent', async () => {
    let mode: ReturnType<typeof state<'span' | 'button'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'span' | 'button'>('span');

      return (
        <div>
          {'pre:'}
          {() =>
            mode!() === 'span' ? (
              <span data-kind={'span'}>{'alpha'}</span>
            ) : (
              <button data-kind={'button'}>{'beta'}</button>
            )
          }
          {':post'}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);
    const firstDynamic = div.querySelector('span') as HTMLSpanElement;

    expect(div.textContent).toBe('pre:alpha:post');
    expect(firstNodes).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    mode!.set('button');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);
    const button = div.querySelector('button') as HTMLButtonElement;

    expect(div.textContent).toBe('pre:beta:post');
    expect(secondNodes).toHaveLength(3);
    expect(secondNodes[0]).toBe(firstNodes[0]);
    expect(secondNodes[2]).toBe(firstNodes[2]);
    expect(button).not.toBe(firstDynamic);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a mixed static and single-root fragment child without rerendering the parent', async () => {
    let text: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      text = state('alpha');

      return (
        <div>
          {'pre:'}
          {() => (
            <>
              <span>{text!()}</span>
            </>
          )}
          {':post'}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);
    const span = div.querySelector('span') as HTMLSpanElement;

    expect(div.textContent).toBe('pre:alpha:post');
    expect(firstNodes).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    text!.set('beta');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);
    const spanAfter = div.querySelector('span') as HTMLSpanElement;

    expect(div.textContent).toBe('pre:beta:post');
    expect(secondNodes).toHaveLength(3);
    expect(secondNodes[0]).toBe(firstNodes[0]);
    expect(secondNodes[1]).toBe(span);
    expect(secondNodes[2]).toBe(firstNodes[2]);
    expect(spanAfter).toBe(span);
    expect(parentRenderCount).toBe(1);
  });

  it('should update multiple dynamic element children without rerendering the parent', async () => {
    let leftMode: ReturnType<typeof state<'span' | 'button'>> | null = null;
    let rightText: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      leftMode = state<'span' | 'button'>('span');
      rightText = state('right-a');

      return (
        <div>
          {() =>
            leftMode!() === 'span' ? (
              <span data-side={'left'}>{'left-a'}</span>
            ) : (
              <button data-side={'left'}>{'left-b'}</button>
            )
          }
          {'|'}
          {() => <span data-side={'right'}>{rightText!()}</span>}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);
    const leftSpan = div.querySelector('[data-side="left"]') as HTMLSpanElement;
    const rightSpan = div.querySelector(
      '[data-side="right"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('left-a|right-a');
    expect(firstNodes).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    leftMode!.set('button');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);
    const leftButton = div.querySelector(
      '[data-side="left"]'
    ) as HTMLButtonElement;
    const rightSpanAfterLeftUpdate = div.querySelector(
      '[data-side="right"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('left-b|right-a');
    expect(secondNodes).toHaveLength(3);
    expect(leftButton).not.toBe(leftSpan);
    expect(secondNodes[1]).toBe(firstNodes[1]);
    expect(rightSpanAfterLeftUpdate).toBe(rightSpan);
    expect(parentRenderCount).toBe(1);

    rightText!.set('right-b');
    flushScheduler();

    const thirdNodes = Array.from(div.childNodes);
    const rightSpanAfterRightUpdate = div.querySelector(
      '[data-side="right"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('left-b|right-b');
    expect(thirdNodes).toHaveLength(3);
    expect(thirdNodes[0]).toBe(leftButton);
    expect(thirdNodes[1]).toBe(firstNodes[1]);
    expect(rightSpanAfterRightUpdate).toBe(rightSpan);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a single dynamic child that returns multiple roots without rerendering the parent', async () => {
    let rightText: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      rightText = state('right-a');

      return (
        <div>
          {() => (
            <>
              <span data-side={'left'}>{'left-a'}</span>
              <span data-side={'right'}>{rightText!()}</span>
            </>
          )}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);
    const leftSpan = div.querySelector('[data-side="left"]') as HTMLSpanElement;
    const rightSpan = div.querySelector(
      '[data-side="right"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('left-aright-a');
    expect(firstNodes).toHaveLength(2);
    expect(parentRenderCount).toBe(1);

    rightText!.set('right-b');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);
    const leftSpanAfter = div.querySelector(
      '[data-side="left"]'
    ) as HTMLSpanElement;
    const rightSpanAfter = div.querySelector(
      '[data-side="right"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('left-aright-b');
    expect(secondNodes).toHaveLength(2);
    expect(leftSpanAfter).toBe(leftSpan);
    expect(rightSpanAfter).toBe(rightSpan);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a mixed static and multi-root dynamic child without rerendering the parent', async () => {
    let rightText: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      rightText = state('right-a');

      return (
        <div>
          {'pre:'}
          {() => (
            <>
              <span data-side={'left'}>{'left-a'}</span>
              <span data-side={'right'}>{rightText!()}</span>
            </>
          )}
          {':post'}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);
    const leftSpan = div.querySelector('[data-side="left"]') as HTMLSpanElement;
    const rightSpan = div.querySelector(
      '[data-side="right"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('pre:left-aright-a:post');
    expect(firstNodes).toHaveLength(4);
    expect(parentRenderCount).toBe(1);

    rightText!.set('right-b');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);
    const leftSpanAfter = div.querySelector(
      '[data-side="left"]'
    ) as HTMLSpanElement;
    const rightSpanAfter = div.querySelector(
      '[data-side="right"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('pre:left-aright-b:post');
    expect(secondNodes).toHaveLength(4);
    expect(secondNodes[0]).toBe(firstNodes[0]);
    expect(leftSpanAfter).toBe(leftSpan);
    expect(rightSpanAfter).toBe(rightSpan);
    expect(secondNodes[3]).toBe(firstNodes[3]);
    expect(parentRenderCount).toBe(1);
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
