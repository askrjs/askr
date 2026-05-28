import { describe, it, expect } from 'vite-plus/test';
import { Show, state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('controlled input remount regression', () => {
  it('should preserve the form and input DOM nodes while a controlled text input updates', () => {
    const { container, cleanup } = createTestContainer();

    const App = () => {
      const name = state('');

      return (
        <form
          onSubmit={(event: Event) => {
            event.preventDefault();
          }}
        >
          <input
            id={'bucket-name'}
            value={name()}
            onInput={(event: Event) =>
              name.set((event.target as HTMLInputElement).value)
            }
          />
          <button type={'submit'}>{'Save'}</button>
        </form>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const formBefore = container.querySelector('form') as HTMLFormElement;
    const inputBefore = container.querySelector(
      '#bucket-name'
    ) as HTMLInputElement;

    expect(formBefore).toBeTruthy();
    expect(inputBefore).toBeTruthy();

    inputBefore.focus();
    inputBefore.value = 'alpha';
    inputBefore.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const formAfter = container.querySelector('form') as HTMLFormElement;
    const inputAfter = container.querySelector(
      '#bucket-name'
    ) as HTMLInputElement;

    expect(formAfter).toBe(formBefore);
    expect(inputAfter).toBe(inputBefore);
    expect(formBefore.isConnected).toBe(true);
    expect(inputBefore.isConnected).toBe(true);
    expect(document.activeElement).toBe(inputBefore);
    expect(inputAfter.value).toBe('alpha');

    cleanup();
  });

  it('should preserve a Show-wrapped form while a controlled text input updates', () => {
    const { container, cleanup } = createTestContainer();

    const App = () => {
      const isOpen = state(true);
      const name = state('');

      return (
        <Show when={isOpen()}>
          <form
            onSubmit={(event: Event) => {
              event.preventDefault();
            }}
          >
            <input
              id={'bucket-name-show'}
              value={name()}
              onInput={(event: Event) =>
                name.set((event.target as HTMLInputElement).value)
              }
            />
            <button type={'submit'}>{'Save'}</button>
          </form>
        </Show>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const wrapperBefore = container.firstElementChild as HTMLElement;
    const formBefore = container.querySelector('form') as HTMLFormElement;
    const inputBefore = container.querySelector(
      '#bucket-name-show'
    ) as HTMLInputElement;

    expect(formBefore).toBeTruthy();
    expect(inputBefore).toBeTruthy();

    inputBefore.focus();
    inputBefore.value = 'alpha';
    inputBefore.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const formAfter = container.querySelector('form') as HTMLFormElement;
    const wrapperAfter = container.firstElementChild as HTMLElement;
    const inputAfter = container.querySelector(
      '#bucket-name-show'
    ) as HTMLInputElement;

    expect(wrapperAfter).toBe(wrapperBefore);
    expect(formAfter).toBe(formBefore);
    expect(inputAfter).toBe(inputBefore);
    expect(formBefore.isConnected).toBe(true);
    expect(inputBefore.isConnected).toBe(true);
    expect(document.activeElement).toBe(inputBefore);
    expect(inputAfter.value).toBe('alpha');

    cleanup();
  });
});
