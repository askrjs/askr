import { state } from '@askrjs/askr';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '../../../src/components/toast';
import { flushUpdates, mount, unmount } from '../../test-utils';

function ControlledToastFixture() {
  const openState = state(false);

  return (
    <div>
      <button
        id="launcher"
        onClick={() => {
          openState.set(true);
        }}
      >
        Show toast
      </button>
      <ToastProvider duration={1000}>
        <ToastViewport />
        <Toast open={openState()} onOpenChange={openState.set}>
          <ToastTitle>Saved</ToastTitle>
          <ToastDescription>Changes stored</ToastDescription>
          <ToastClose>Dismiss</ToastClose>
        </Toast>
      </ToastProvider>
    </div>
  );
}

describe('Toast - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    vi.useRealTimers();
    unmount(container);
  });

  it('renders toast content inside the viewport in declaration order', async () => {
    container = mount(
      <ToastProvider>
        <ToastViewport />
        <Toast defaultOpen={true}>
          <ToastTitle>First</ToastTitle>
        </Toast>
        <Toast defaultOpen={true}>
          <ToastTitle>Second</ToastTitle>
        </Toast>
      </ToastProvider>
    );
    await flushUpdates();

    const titles = Array.from(
      container.querySelectorAll('[data-toast-title="true"]')
    ).map((node) => node.textContent);

    expect(titles).toEqual(['First', 'Second']);
  });

  it('dismisses toasts on their configured timer', async () => {
    vi.useFakeTimers();
    container = mount(
      <ToastProvider duration={50}>
        <ToastViewport />
        <Toast defaultOpen={true}>
          <ToastTitle>Timed</ToastTitle>
        </Toast>
      </ToastProvider>
    );
    await flushUpdates();

    expect(container.querySelector('[data-toast="true"]')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(60);
    await flushUpdates();

    expect(container.querySelector('[data-toast="true"]')).toBeNull();
  });

  it('restores focus after closing a controlled toast', async () => {
    container = mount(<ControlledToastFixture />);

    const launcher = container.querySelector('#launcher') as HTMLButtonElement;
    launcher.focus();
    launcher.click();
    await flushUpdates();

    expect(container.querySelector('[data-toast="true"]')).not.toBeNull();

    const close = container.querySelector(
      '[data-toast-close="true"]'
    ) as HTMLButtonElement;
    close.click();
    await flushUpdates();

    expect(document.activeElement).toBe(launcher);
  });

  it('dismisses on escape and action press', async () => {
    container = mount(
      <ToastProvider>
        <ToastViewport />
        <Toast defaultOpen={true}>
          <ToastTitle>Undoable</ToastTitle>
          <ToastAction>Undo</ToastAction>
        </Toast>
      </ToastProvider>
    );
    await flushUpdates();

    const toast = container.querySelector(
      '[data-toast="true"]'
    ) as HTMLDivElement;
    toast.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await flushUpdates();
    expect(container.querySelector('[data-toast="true"]')).toBeNull();

    container = mount(
      <ToastProvider>
        <ToastViewport />
        <Toast defaultOpen={true}>
          <ToastTitle>Undoable</ToastTitle>
          <ToastAction>Undo</ToastAction>
        </Toast>
      </ToastProvider>
    );
    await flushUpdates();

    const action = container.querySelector(
      '[data-toast-action="true"]'
    ) as HTMLButtonElement;
    action.click();
    await flushUpdates();
    expect(container.querySelector('[data-toast="true"]')).toBeNull();
  });
});
