import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { RenderDepthError, jsx, state } from '../../../src/index';
import type { JSXElement } from '../../../src/jsx/types';
import { ErrorBoundary } from '../../../src/components';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

// Askr renders nested elements and components recursively (#624).
const SUPPORTED_DEPTH = 200;
const OVERFLOWING_DEPTH = 5000;

// Build the chain through a local reference to the JSX factory: calling it
// through the test runner's import getter can turn a stack overflow inside
// the getter into an unrelated TypeError, which makes the overflow tests
// depend on exactly where the stack runs out.
const h = jsx;

function Chain(props: { remaining: number; label: string }): JSXElement {
  return props.remaining === 0
    ? h('span', { 'data-leaf': 'true', children: props.label })
    : h('div', {
        children: h(Chain, {
          remaining: props.remaining - 1,
          label: props.label,
        }),
      });
}

describe('deep element-wrapped component chains', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => cleanup());

  it('should mount and patch a chain within the supported depth', () => {
    let label!: ReturnType<typeof state<string>>;
    createIsland({
      root: container,
      component: () => {
        label = state('a');
        return <Chain remaining={SUPPORTED_DEPTH} label={label()} />;
      },
    });
    flushScheduler();
    expect(container.querySelector('[data-leaf]')?.textContent).toBe('a');

    label.set('b');
    flushScheduler();
    expect(container.querySelector('[data-leaf]')?.textContent).toBe('b');
  });

  it('should explain a stack overflow from a chain that is too deep', () => {
    container.innerHTML = '<p data-placeholder="true">loading</p>';
    let error: unknown;
    try {
      createIsland({
        root: container,
        component: () => <Chain remaining={OVERFLOWING_DEPTH} label={'a'} />,
      });
      flushScheduler();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('RenderDepthError');
    expect((error as Error).message).toMatch(
      /call stack overflowed while rendering/
    );
    expect((error as { cause?: unknown }).cause).toBeInstanceOf(RangeError);
    expect(error).toBeInstanceOf(RenderDepthError);
    expect(container.querySelector('[data-placeholder]')).not.toBeNull();
  });

  it('should explain a stack overflow when an update deepens the chain', () => {
    let depth!: ReturnType<typeof state<number>>;
    createIsland({
      root: container,
      component: () => {
        depth = state(10);
        return <Chain remaining={depth()} label={'a'} />;
      },
    });
    flushScheduler();

    depth.set(OVERFLOWING_DEPTH);
    let error: unknown;
    try {
      flushScheduler();
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).name).toBe('RenderDepthError');
    // The committed tree is unchanged, and the app renders again later.
    expect(container.querySelectorAll('div')).toHaveLength(10);
    depth.set(20);
    flushScheduler();
    expect(container.querySelectorAll('div')).toHaveLength(20);
  });

  it('should hand a RenderDepthError to the nearest ErrorBoundary', () => {
    let depth!: ReturnType<typeof state<number>>;
    createIsland({
      root: container,
      component: () => {
        depth = state(5);
        const current = depth();
        return (
          <ErrorBoundary
            resetKey={current}
            fallback={(error) => (
              <p data-fallback={'true'}>{(error as Error).name}</p>
            )}
          >
            <Chain remaining={current} label={'a'} />
          </ErrorBoundary>
        );
      },
    });
    flushScheduler();
    expect(container.querySelector('[data-leaf]')).not.toBeNull();

    depth.set(OVERFLOWING_DEPTH);
    flushScheduler();
    expect(container.querySelector('[data-fallback]')?.textContent).toBe(
      'RenderDepthError'
    );
  });

  it('should render within the supported depth and explain an overflow during SSR', () => {
    expect(
      renderToStringSync(() => (
        <Chain remaining={SUPPORTED_DEPTH} label={'ssr'} />
      ))
    ).toContain('<span data-leaf="true">ssr</span>');
    // Caught directly: wrapping the call in expect().toThrow() adds proxy
    // frames that change where the stack runs out.
    let error: unknown;
    try {
      renderToStringSync(() => (
        <Chain remaining={OVERFLOWING_DEPTH} label={'ssr'} />
      ));
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).name).toBe('RenderDepthError');

    const html = renderToStringSync(() => (
      <ErrorBoundary fallback={(caught) => <p>{(caught as Error).name}</p>}>
        <Chain remaining={OVERFLOWING_DEPTH} label={'ssr'} />
      </ErrorBoundary>
    ));
    expect(html).toBe('<p>RenderDepthError</p>');
  });
});
