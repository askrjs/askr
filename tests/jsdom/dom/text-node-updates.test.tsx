// tests/dom/text_node_updates.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';
import {
  disableEventDelegation,
  enableEventDelegation,
} from '../../../src/runtime/events';

function resetFineGrainedDiagnostics(): void {
  const ns = (
    globalThis as typeof globalThis & {
      __ASKR__?: Record<string, unknown>;
    }
  ).__ASKR__;

  if (!ns) {
    return;
  }

  ns['componentReruns'] = 0;
  ns['effectRuns'] = 0;
  ns['textNodeWrites'] = 0;
}

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

  it('should isolate 1000 scalar text bindings from parent rerenders', async () => {
    allowFrameworkWarnings(
      /Missing keys on dynamic lists in Component\. Each child in a list should have a unique "key" prop\./
    );

    let count: ReturnType<typeof state<number>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      count = state(0);

      return (
        <div>
          {Array.from({ length: 1000 }, () => (
            <span>{() => count!()}</span>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const spans = Array.from(container.querySelectorAll('span'));
    expect(spans).toHaveLength(1000);
    expect(parentRenderCount).toBe(1);

    const firstTextNodes = spans.map((span) => span.firstChild);

    resetFineGrainedDiagnostics();

    count!.set(1);
    flushScheduler();

    const ns = (
      globalThis as typeof globalThis & {
        __ASKR__?: Record<string, unknown>;
      }
    ).__ASKR__;

    expect(parentRenderCount).toBe(1);
    expect(ns?.['componentReruns']).toBe(0);
    expect(ns?.['effectRuns']).toBe(1000);
    expect(ns?.['textNodeWrites']).toBe(1000);

    const updatedSpans = Array.from(container.querySelectorAll('span'));
    for (let index = 0; index < updatedSpans.length; index += 1) {
      expect(updatedSpans[index]?.textContent).toBe('1');
      expect(updatedSpans[index]?.firstChild).toBe(firstTextNodes[index]);
    }
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

  it('should update a dynamic child from text to element and back without rerendering the parent', async () => {
    let mode: ReturnType<typeof state<'text' | 'element'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'text' | 'element'>('text');

      return (
        <div>
          {() =>
            mode!() === 'text' ? (
              'alpha'
            ) : (
              <span data-kind={'dynamic'}>{'beta'}</span>
            )
          }
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstTextNode = div.firstChild;

    expect(div.textContent).toBe('alpha');
    expect(firstTextNode?.nodeType).toBe(Node.TEXT_NODE);
    expect(parentRenderCount).toBe(1);

    mode!.set('element');
    flushScheduler();

    const span = div.querySelector('[data-kind="dynamic"]') as HTMLSpanElement;

    expect(div.textContent).toBe('beta');
    expect(div.firstChild).toBe(span);
    expect(parentRenderCount).toBe(1);

    mode!.set('text');
    flushScheduler();

    const secondTextNode = div.firstChild;

    expect(div.textContent).toBe('alpha');
    expect(secondTextNode?.nodeType).toBe(Node.TEXT_NODE);
    expect(secondTextNode).not.toBe(firstTextNode);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a mixed static child from text to element and back without rerendering the parent', async () => {
    let mode: ReturnType<typeof state<'text' | 'element'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'text' | 'element'>('text');

      return (
        <div>
          {'pre:'}
          {() =>
            mode!() === 'text' ? (
              'alpha'
            ) : (
              <span data-kind={'dynamic'}>{'beta'}</span>
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

    expect(div.textContent).toBe('pre:alpha:post');
    expect(firstNodes).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    mode!.set('element');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);
    const span = div.querySelector('[data-kind="dynamic"]') as HTMLSpanElement;

    expect(div.textContent).toBe('pre:beta:post');
    expect(secondNodes).toHaveLength(3);
    expect(secondNodes[0]).toBe(firstNodes[0]);
    expect(secondNodes[1]).toBe(span);
    expect(secondNodes[2]).toBe(firstNodes[2]);
    expect(parentRenderCount).toBe(1);

    mode!.set('text');
    flushScheduler();

    const thirdNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('pre:alpha:post');
    expect(thirdNodes).toHaveLength(3);
    expect(thirdNodes[0]).toBe(firstNodes[0]);
    expect(thirdNodes[1]?.nodeType).toBe(Node.TEXT_NODE);
    expect(thirdNodes[2]).toBe(firstNodes[2]);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a dynamic child with static element siblings without rerendering the parent', async () => {
    let mode: ReturnType<typeof state<'span' | 'button'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'span' | 'button'>('span');

      return (
        <div>
          <b data-side={'left'}>{'left'}</b>
          {() =>
            mode!() === 'span' ? (
              <span data-kind={'dynamic'}>{'alpha'}</span>
            ) : (
              <button data-kind={'dynamic'}>{'beta'}</button>
            )
          }
          <i data-side={'right'}>{'right'}</i>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);
    const left = div.querySelector('[data-side="left"]') as HTMLElement;
    const span = div.querySelector('[data-kind="dynamic"]') as HTMLSpanElement;
    const right = div.querySelector('[data-side="right"]') as HTMLElement;

    expect(div.textContent).toBe('leftalpharight');
    expect(firstNodes).toHaveLength(3);
    expect(firstNodes[0]).toBe(left);
    expect(firstNodes[1]).toBe(span);
    expect(firstNodes[2]).toBe(right);
    expect(parentRenderCount).toBe(1);

    mode!.set('button');
    flushScheduler();

    const secondNodes = Array.from(div.childNodes);
    const button = div.querySelector(
      '[data-kind="dynamic"]'
    ) as HTMLButtonElement;

    expect(div.textContent).toBe('leftbetaright');
    expect(secondNodes).toHaveLength(3);
    expect(secondNodes[0]).toBe(left);
    expect(secondNodes[1]).toBe(button);
    expect(secondNodes[2]).toBe(right);
    expect(button).not.toBe(span);
    expect(parentRenderCount).toBe(1);
  });

  it('should update multiple dynamic regions when one returns multiple roots without rerendering the parent', async () => {
    let leftMode: ReturnType<typeof state<'single' | 'multi'>> | null = null;
    let rightText: ReturnType<typeof state<string>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      leftMode = state<'single' | 'multi'>('single');
      rightText = state('right-a');

      return (
        <div>
          {() =>
            leftMode!() === 'single' ? (
              <span data-side={'left-single'}>{'left-a'}</span>
            ) : (
              <>
                <span data-side={'left-start'}>{'left-a'}</span>
                <span data-side={'left-end'}>{'left-b'}</span>
              </>
            )
          }
          <b data-static={'separator'}>{'|'}</b>
          {() => <span data-side={'right'}>{rightText!()}</span>}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const separator = div.querySelector(
      '[data-static="separator"]'
    ) as HTMLElement;
    const right = div.querySelector('[data-side="right"]') as HTMLSpanElement;

    expect(div.textContent).toBe('left-a|right-a');
    expect(Array.from(div.childNodes)).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    leftMode!.set('multi');
    flushScheduler();

    const afterLeftNodes = Array.from(div.childNodes);
    const leftStart = div.querySelector(
      '[data-side="left-start"]'
    ) as HTMLSpanElement;
    const leftEnd = div.querySelector(
      '[data-side="left-end"]'
    ) as HTMLSpanElement;
    const rightAfterLeft = div.querySelector(
      '[data-side="right"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('left-aleft-b|right-a');
    expect(afterLeftNodes).toHaveLength(4);
    expect(afterLeftNodes[1]).toBe(leftEnd);
    expect(separator).toBe(afterLeftNodes[2]);
    expect(rightAfterLeft).toBe(right);
    expect(parentRenderCount).toBe(1);

    rightText!.set('right-b');
    flushScheduler();

    const afterRightNodes = Array.from(div.childNodes);
    const rightAfterRight = div.querySelector(
      '[data-side="right"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('left-aleft-b|right-b');
    expect(afterRightNodes).toHaveLength(4);
    expect(afterRightNodes[0]).toBe(leftStart);
    expect(afterRightNodes[1]).toBe(leftEnd);
    expect(afterRightNodes[2]).toBe(separator);
    expect(rightAfterRight).toBe(right);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a mixed static child from element to multi-root and back without rerendering the parent', async () => {
    let mode: ReturnType<typeof state<'single' | 'multi'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'single' | 'multi'>('single');

      return (
        <div>
          <b data-side={'left'}>{'left'}</b>
          {() =>
            mode!() === 'single' ? (
              <span data-kind={'single'}>{'alpha'}</span>
            ) : (
              <>
                <span data-kind={'multi-start'}>{'alpha'}</span>
                <button data-kind={'multi-end'}>{'beta'}</button>
              </>
            )
          }
          <i data-side={'right'}>{'right'}</i>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const left = div.querySelector('[data-side="left"]') as HTMLElement;
    const single = div.querySelector('[data-kind="single"]') as HTMLSpanElement;
    const right = div.querySelector('[data-side="right"]') as HTMLElement;

    expect(div.textContent).toBe('leftalpharight');
    expect(Array.from(div.childNodes)).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    mode!.set('multi');
    flushScheduler();

    const multiNodes = Array.from(div.childNodes);
    const multiStart = div.querySelector(
      '[data-kind="multi-start"]'
    ) as HTMLSpanElement;
    const multiEnd = div.querySelector(
      '[data-kind="multi-end"]'
    ) as HTMLButtonElement;

    expect(div.textContent).toBe('leftalphabetaright');
    expect(multiNodes).toHaveLength(4);
    expect(multiNodes[0]).toBe(left);
    expect(multiNodes[1]).toBe(multiStart);
    expect(multiNodes[2]).toBe(multiEnd);
    expect(multiNodes[3]).toBe(right);
    expect(parentRenderCount).toBe(1);

    mode!.set('single');
    flushScheduler();

    const singleNodesAgain = Array.from(div.childNodes);
    const singleAgain = div.querySelector(
      '[data-kind="single"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('leftalpharight');
    expect(singleNodesAgain).toHaveLength(3);
    expect(singleNodesAgain[0]).toBe(left);
    expect(singleNodesAgain[1]).toBe(singleAgain);
    expect(singleNodesAgain[2]).toBe(right);
    expect(singleAgain).not.toBe(single);
    expect(parentRenderCount).toBe(1);
  });

  it('should update a mixed static child from multi-root to empty and back without rerendering the parent', async () => {
    let mode: ReturnType<typeof state<'multi' | 'empty'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'multi' | 'empty'>('multi');

      return (
        <div>
          {'pre:'}
          {() =>
            mode!() === 'multi' ? (
              <>
                <span data-kind={'multi-start'}>{'alpha'}</span>
                <span data-kind={'multi-end'}>{'beta'}</span>
              </>
            ) : null
          }
          {':post'}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const firstNodes = Array.from(div.childNodes);
    const start = div.querySelector(
      '[data-kind="multi-start"]'
    ) as HTMLSpanElement;
    const end = div.querySelector('[data-kind="multi-end"]') as HTMLSpanElement;

    expect(div.textContent).toBe('pre:alphabeta:post');
    expect(firstNodes).toHaveLength(4);
    expect(parentRenderCount).toBe(1);

    mode!.set('empty');
    flushScheduler();

    const emptyNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('pre::post');
    expect(div.querySelector('[data-kind="multi-start"]')).toBeNull();
    expect(div.querySelector('[data-kind="multi-end"]')).toBeNull();
    expect(emptyNodes).toHaveLength(2);
    expect(emptyNodes[0]).toBe(firstNodes[0]);
    expect(emptyNodes[1]).toBe(firstNodes[3]);
    expect(parentRenderCount).toBe(1);

    mode!.set('multi');
    flushScheduler();

    const finalNodes = Array.from(div.childNodes);
    const startAgain = div.querySelector(
      '[data-kind="multi-start"]'
    ) as HTMLSpanElement;
    const endAgain = div.querySelector(
      '[data-kind="multi-end"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('pre:alphabeta:post');
    expect(finalNodes).toHaveLength(4);
    expect(finalNodes[0]).toBe(firstNodes[0]);
    expect(finalNodes[1]).toBe(startAgain);
    expect(finalNodes[2]).toBe(endAgain);
    expect(finalNodes[3]).toBe(firstNodes[3]);
    expect(startAgain).not.toBe(start);
    expect(endAgain).not.toBe(end);
    expect(parentRenderCount).toBe(1);
  });

  it('should tear down direct listeners when a retained multi-root child range collapses to empty', async () => {
    disableEventDelegation();

    let mode: ReturnType<typeof state<'multi' | 'empty'>> | null = null;
    let clicks = 0;

    try {
      const Component = () => {
        mode = state<'multi' | 'empty'>('multi');

        return (
          <div>
            {'pre:'}
            {() =>
              mode!() === 'multi' ? (
                <>
                  <button
                    data-kind={'action'}
                    onClick={() => {
                      clicks += 1;
                    }}
                  >
                    {'go'}
                  </button>
                  <span data-kind={'tail'}>{'tail'}</span>
                </>
              ) : null
            }
            {':post'}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const button = container.querySelector(
        '[data-kind="action"]'
      ) as HTMLButtonElement;

      button.click();
      flushScheduler();
      expect(clicks).toBe(1);

      mode!.set('empty');
      flushScheduler();

      expect(container.querySelector('[data-kind="action"]')).toBeNull();
      expect(container.querySelector('[data-kind="tail"]')).toBeNull();

      button.click();
      flushScheduler();
      expect(clicks).toBe(1);

      mode!.set('multi');
      flushScheduler();

      const nextButton = container.querySelector(
        '[data-kind="action"]'
      ) as HTMLButtonElement;

      nextButton.click();
      flushScheduler();
      expect(clicks).toBe(2);
      expect(nextButton).not.toBe(button);
    } finally {
      enableEventDelegation();
    }
  });

  it('should keep a reactive child live after a parent rerender changes static sibling layout', async () => {
    let layout: ReturnType<typeof state<'text' | 'elements'>> | null = null;
    let mode: ReturnType<typeof state<'span' | 'button'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      layout = state<'text' | 'elements'>('text');
      mode = state<'span' | 'button'>('span');

      return (
        <div>
          {layout!() === 'text' ? 'pre:' : <b data-side={'left'}>{'left'}</b>}
          {() =>
            mode!() === 'span' ? (
              <span data-kind={'dynamic'}>{'alpha'}</span>
            ) : (
              <button data-kind={'dynamic'}>{'beta'}</button>
            )
          }
          {layout!() === 'text' ? (
            ':post'
          ) : (
            <i data-side={'right'}>{'right'}</i>
          )}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;

    expect(div.textContent).toBe('pre:alpha:post');
    expect(Array.from(div.childNodes)).toHaveLength(3);
    expect(parentRenderCount).toBe(1);

    layout!.set('elements');
    flushScheduler();

    const left = div.querySelector('[data-side="left"]') as HTMLElement;
    const span = div.querySelector('[data-kind="dynamic"]') as HTMLSpanElement;
    const right = div.querySelector('[data-side="right"]') as HTMLElement;
    const afterLayoutNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('leftalpharight');
    expect(afterLayoutNodes).toHaveLength(3);
    expect(afterLayoutNodes[0]).toBe(left);
    expect(afterLayoutNodes[1]).toBe(span);
    expect(afterLayoutNodes[2]).toBe(right);
    expect(parentRenderCount).toBe(2);

    mode!.set('button');
    flushScheduler();

    const button = div.querySelector(
      '[data-kind="dynamic"]'
    ) as HTMLButtonElement;
    const afterModeNodes = Array.from(div.childNodes);

    expect(div.textContent).toBe('leftbetaright');
    expect(afterModeNodes).toHaveLength(3);
    expect(afterModeNodes[0]).toBe(left);
    expect(afterModeNodes[1]).toBe(button);
    expect(afterModeNodes[2]).toBe(right);
    expect(button).not.toBe(span);
    expect(parentRenderCount).toBe(2);
  });

  it('should update multiple dynamic regions that both change cardinality in the same flush', async () => {
    let leftMode: ReturnType<typeof state<'single' | 'multi'>> | null = null;
    let rightMode: ReturnType<typeof state<'multi' | 'empty'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      leftMode = state<'single' | 'multi'>('single');
      rightMode = state<'multi' | 'empty'>('multi');

      return (
        <div>
          {() =>
            leftMode!() === 'single' ? (
              <span data-kind={'left-single'}>{'left-a'}</span>
            ) : (
              <>
                <span data-kind={'left-start'}>{'left-a'}</span>
                <span data-kind={'left-end'}>{'left-b'}</span>
              </>
            )
          }
          <b data-kind={'separator'}>{'|'}</b>
          {() =>
            rightMode!() === 'multi' ? (
              <>
                <span data-kind={'right-start'}>{'right-a'}</span>
                <span data-kind={'right-end'}>{'right-b'}</span>
              </>
            ) : null
          }
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLDivElement;
    const separator = div.querySelector(
      '[data-kind="separator"]'
    ) as HTMLElement;

    expect(div.textContent).toBe('left-a|right-aright-b');
    expect(Array.from(div.childNodes)).toHaveLength(4);
    expect(parentRenderCount).toBe(1);

    leftMode!.set('multi');
    rightMode!.set('empty');
    flushScheduler();

    const afterNodes = Array.from(div.childNodes);
    const leftStart = div.querySelector(
      '[data-kind="left-start"]'
    ) as HTMLSpanElement;
    const leftEnd = div.querySelector(
      '[data-kind="left-end"]'
    ) as HTMLSpanElement;

    expect(div.textContent).toBe('left-aleft-b|');
    expect(div.querySelector('[data-kind="right-start"]')).toBeNull();
    expect(div.querySelector('[data-kind="right-end"]')).toBeNull();
    expect(afterNodes).toHaveLength(3);
    expect(afterNodes[0]).toBe(leftStart);
    expect(afterNodes[1]).toBe(leftEnd);
    expect(afterNodes[2]).toBe(separator);
    expect(parentRenderCount).toBe(1);
  });

  it('should reset nested component state when a retained multi-root child range remounts', async () => {
    disableEventDelegation();

    let mode: ReturnType<typeof state<'multi' | 'empty'>> | null = null;
    let parentRenderCount = 0;

    try {
      const Counter = () => {
        const count = state(0);

        return (
          <button
            data-kind={'counter'}
            onClick={() => {
              count.set(count() + 1);
            }}
          >
            {count()}
          </button>
        );
      };

      const Component = () => {
        parentRenderCount += 1;
        mode = state<'multi' | 'empty'>('multi');

        return (
          <div>
            {'pre:'}
            {() =>
              mode!() === 'multi' ? (
                <>
                  <Counter />
                  <span data-kind={'tail'}>{'tail'}</span>
                </>
              ) : null
            }
            {':post'}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const firstButton = container.querySelector(
        '[data-kind="counter"]'
      ) as HTMLButtonElement;

      expect(container.textContent).toBe('pre:0tail:post');
      firstButton.click();
      flushScheduler();
      expect(container.textContent).toBe('pre:1tail:post');

      mode!.set('empty');
      flushScheduler();

      expect(container.textContent).toBe('pre::post');
      expect(container.querySelector('[data-kind="counter"]')).toBeNull();

      mode!.set('multi');
      flushScheduler();

      const secondButton = container.querySelector(
        '[data-kind="counter"]'
      ) as HTMLButtonElement;

      expect(container.textContent).toBe('pre:0tail:post');
      expect(secondButton).not.toBe(firstButton);
      expect(parentRenderCount).toBe(1);
    } finally {
      enableEventDelegation();
    }
  });

  it('should tear down nested component direct listeners when a retained multi-root child range is removed', async () => {
    disableEventDelegation();

    let mode: ReturnType<typeof state<'multi' | 'empty'>> | null = null;
    let outerClicks = 0;

    try {
      const Counter = () => {
        const count = state(0);

        return (
          <button
            data-kind={'counter'}
            onClick={() => {
              outerClicks += 1;
              count.set(count() + 1);
            }}
          >
            {count()}
          </button>
        );
      };

      const Component = () => {
        mode = state<'multi' | 'empty'>('multi');

        return (
          <div>
            {() =>
              mode!() === 'multi' ? (
                <>
                  <Counter />
                  <span data-kind={'tail'}>{'tail'}</span>
                </>
              ) : null
            }
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const firstButton = container.querySelector(
        '[data-kind="counter"]'
      ) as HTMLButtonElement;

      firstButton.click();
      flushScheduler();
      expect(outerClicks).toBe(1);

      mode!.set('empty');
      flushScheduler();

      firstButton.click();
      flushScheduler();
      expect(outerClicks).toBe(1);
    } finally {
      enableEventDelegation();
    }
  });

  it('should preserve SVG namespace for a single retained reactive child boundary', async () => {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    let mode: ReturnType<typeof state<'circle' | 'rect'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'circle' | 'rect'>('circle');

      return (
        <svg>
          {() =>
            mode!() === 'circle' ? (
              <circle data-kind={'shape'} />
            ) : (
              <rect data-kind={'shape'} />
            )
          }
        </svg>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const svg = container.querySelector('svg') as SVGSVGElement;
    const circle = svg.querySelector('[data-kind="shape"]') as SVGCircleElement;

    expect(svg.namespaceURI).toBe(svgNamespace);
    expect(circle.namespaceURI).toBe(svgNamespace);
    expect(circle.tagName.toLowerCase()).toBe('circle');
    expect(parentRenderCount).toBe(1);

    mode!.set('rect');
    flushScheduler();

    const rect = svg.querySelector('[data-kind="shape"]') as SVGRectElement;

    expect(rect.namespaceURI).toBe(svgNamespace);
    expect(rect.tagName.toLowerCase()).toBe('rect');
    expect(parentRenderCount).toBe(1);
  });

  it('should preserve SVG namespace for retained reactive child sequences with static SVG siblings', async () => {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    let mode: ReturnType<typeof state<'circle' | 'rect'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'circle' | 'rect'>('circle');

      return (
        <svg>
          <g data-side={'left'} />
          {() =>
            mode!() === 'circle' ? (
              <circle data-kind={'shape'} />
            ) : (
              <rect data-kind={'shape'} />
            )
          }
          <g data-side={'right'} />
        </svg>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const svg = container.querySelector('svg') as SVGSVGElement;
    const left = svg.querySelector('[data-side="left"]') as SVGGElement;
    const circle = svg.querySelector('[data-kind="shape"]') as SVGCircleElement;
    const right = svg.querySelector('[data-side="right"]') as SVGGElement;
    const firstNodes = Array.from(svg.childNodes);

    expect(firstNodes).toHaveLength(3);
    expect(left.namespaceURI).toBe(svgNamespace);
    expect(circle.namespaceURI).toBe(svgNamespace);
    expect(right.namespaceURI).toBe(svgNamespace);
    expect(parentRenderCount).toBe(1);

    mode!.set('rect');
    flushScheduler();

    const rect = svg.querySelector('[data-kind="shape"]') as SVGRectElement;
    const secondNodes = Array.from(svg.childNodes);

    expect(secondNodes).toHaveLength(3);
    expect(secondNodes[0]).toBe(left);
    expect(secondNodes[1]).toBe(rect);
    expect(secondNodes[2]).toBe(right);
    expect(rect.namespaceURI).toBe(svgNamespace);
    expect(rect.tagName.toLowerCase()).toBe('rect');
    expect(parentRenderCount).toBe(1);
  });

  it('should preserve SVG namespace for a component returned by a retained reactive child boundary', async () => {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    let mode: ReturnType<typeof state<'circle' | 'rect'>> | null = null;
    let parentRenderCount = 0;

    const Shape = ({ kind }: { kind: 'circle' | 'rect' }) =>
      kind === 'circle' ? (
        <circle data-kind={'shape'} />
      ) : (
        <rect data-kind={'shape'} />
      );

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'circle' | 'rect'>('circle');

      return <svg>{() => <Shape kind={mode!()} />}</svg>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const svg = container.querySelector('svg') as SVGSVGElement;
    const circle = svg.querySelector('[data-kind="shape"]') as SVGCircleElement;

    expect(circle.namespaceURI).toBe(svgNamespace);
    expect(circle.tagName.toLowerCase()).toBe('circle');
    expect(parentRenderCount).toBe(1);

    mode!.set('rect');
    flushScheduler();

    const rect = svg.querySelector('[data-kind="shape"]') as SVGRectElement;

    expect(rect.namespaceURI).toBe(svgNamespace);
    expect(rect.tagName.toLowerCase()).toBe('rect');
    expect(parentRenderCount).toBe(1);
  });

  it('should preserve SVG namespace when a retained reactive child boundary expands from empty', async () => {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    let mode: ReturnType<typeof state<'empty' | 'circle'>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      mode = state<'empty' | 'circle'>('empty');

      return (
        <svg>
          {() => (mode!() === 'empty' ? null : <circle data-kind={'shape'} />)}
        </svg>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const svg = container.querySelector('svg') as SVGSVGElement;

    expect(svg.childNodes).toHaveLength(0);
    expect(parentRenderCount).toBe(1);

    mode!.set('circle');
    flushScheduler();

    const circle = svg.querySelector('[data-kind="shape"]') as SVGCircleElement;

    expect(svg.childNodes).toHaveLength(1);
    expect(circle.namespaceURI).toBe(svgNamespace);
    expect(circle.tagName.toLowerCase()).toBe('circle');
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
