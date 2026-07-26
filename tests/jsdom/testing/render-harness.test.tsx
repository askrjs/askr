import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { state } from '@askrjs/askr';
import { Portal } from '@askrjs/askr/foundations';
import { on } from '@askrjs/askr/resources';
import {
  cleanup,
  dispatch,
  flush,
  mount,
  render,
  type RenderResult,
} from '@askrjs/askr/testing';

const mounted: RenderResult[] = [];

afterEach(() => {
  for (const result of mounted.splice(0)) {
    result.cleanup();
  }
});

describe('testing render harness', () => {
  it('should render into a managed container and flush delegated events', () => {
    const App = () => {
      const count = state(0);
      return (
        <button onClick={() => count.set(count() + 1)}>
          {'Count: '}
          {count()}
        </button>
      );
    };
    const result = render(App);
    mounted.push(result);

    expect(document.body.contains(result.container)).toBe(true);
    const button = result.container.querySelector('button')!;

    expect(button.textContent).toBe('Count: 0');
    expect(dispatch(button, 'click')).toBe(true);
    flush();
    expect(button.textContent).toBe('Count: 1');
  });

  it('should mount into a provided container and keep cleanup idempotent', () => {
    const container = document.createElement('section');
    document.body.appendChild(container);
    const result = mount(() => <p>{'provided'}</p>, { container });
    mounted.push(result);

    expect(result.root).toBe(container);
    expect(result.container.textContent).toBe('provided');

    result.unmount();
    result.cleanup();

    expect(document.body.contains(container)).toBe(true);
    expect(container.textContent).toBe('');
    container.remove();
  });

  it('should expose refs and portal output through the returned root', () => {
    let button: HTMLButtonElement | null = null;
    const result = render(() => (
      <main>
        <button ref={(element) => (button = element)}>{'save'}</button>
        <Portal>
          <aside data-testid="portal">{'notice'}</aside>
        </Portal>
      </main>
    ));
    mounted.push(result);

    expect(button).toBe(result.container.querySelector('button'));
    expect(
      result.root.querySelector('[data-testid="portal"]')?.textContent
    ).toBe('notice');
  });

  it('should clean lifecycle work without affecting a sibling render', () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const first = render(() => {
      on(window, 'askr-harness', firstListener);
      return <div>{'first'}</div>;
    });
    const second = render(() => {
      on(window, 'askr-harness', secondListener);
      return <div>{'second'}</div>;
    });
    mounted.push(first, second);

    cleanup(first);
    window.dispatchEvent(new Event('askr-harness'));
    flush();

    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalledOnce();
    expect(second.container.textContent).toBe('second');
  });

  it('should fail clearly without a DOM environment', () => {
    const currentDocument = globalThis.document;
    vi.stubGlobal('document', undefined);

    expect(() => render(() => null)).toThrow(
      '@askrjs/askr/testing render requires a DOM environment'
    );

    vi.stubGlobal('document', currentDocument);
    vi.unstubAllGlobals();
  });

  it('should reject invalid JavaScript container and event arguments', () => {
    expect(() =>
      render(() => null, {
        container: {} as HTMLElement,
      })
    ).toThrow(
      '@askrjs/askr/testing render options.container must be an HTMLElement'
    );

    expect(() => dispatch(document.body, 123 as unknown as Event)).toThrow(
      '@askrjs/askr/testing dispatch requires an Event instance or event type string'
    );
  });

  it('should construct event-specific instances in the target realm', () => {
    let clickEvent: MouseEvent | undefined;
    let keyEvent: KeyboardEvent | undefined;
    const result = render(() => (
      <div>
        <button onClick={(event) => (clickEvent = event)}>{'click'}</button>
        <input onKeyDown={(event) => (keyEvent = event)} />
      </div>
    ));
    mounted.push(result);

    dispatch(result.root.querySelector('button')!, 'click', {
      clientX: 42,
    } as MouseEventInit);
    dispatch(result.root.querySelector('input')!, 'keydown', {
      key: 'Enter',
    } as KeyboardEventInit);

    expect(clickEvent).toBeInstanceOf(MouseEvent);
    expect(clickEvent?.clientX).toBe(42);
    expect(keyEvent).toBeInstanceOf(KeyboardEvent);
    expect(keyEvent?.key).toBe('Enter');
  });
});
