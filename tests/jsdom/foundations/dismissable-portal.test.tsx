import { describe, expect, it, vi } from 'vite-plus/test';
import { definePortal } from '../../../src/foundations/structures';
import { dismissable } from '../../../src/foundations/interactions/dismissable';
import { render } from '../../../src/testing';

describe('dismissable portal composition', () => {
  it('should treat registered portaled content as logically inside', () => {
    const DropdownPortal = definePortal();

    function DropdownWriter() {
      return DropdownPortal.render({
        children: (
          <div data-dropdown-portal={'true'}>
            <button data-dropdown-option={'true'}>{'Option'}</button>
          </div>
        ),
      }) as null;
    }

    function App() {
      return (
        <main>
          <section data-modal={'true'}>{'Modal'}</section>
          <DropdownPortal />
          <DropdownWriter />
          <button data-outside={'true'}>{'Outside'}</button>
        </main>
      );
    }

    const result = render(App);
    try {
      result.flush();
      const modal = result.container.querySelector('[data-modal]');
      const portal = result.container.querySelector('[data-dropdown-portal]');
      const option = result.container.querySelector('[data-dropdown-option]');
      const outside = result.container.querySelector('[data-outside]');
      const eventSurface = result.container.querySelector('main');
      expect(modal).toBeInstanceOf(Node);
      expect(portal).toBeInstanceOf(Node);
      expect(option).toBeInstanceOf(Node);
      expect(outside).toBeInstanceOf(Node);
      expect(eventSurface).toBeInstanceOf(HTMLElement);
      expect(modal?.contains(option)).toBe(false);

      const onDismiss = vi.fn();
      const props = dismissable({
        node: modal,
        additionalInsideNodes: [portal],
        onDismiss,
      });
      eventSurface?.addEventListener(
        'pointerdown',
        (event) => props.onPointerDownCapture(event),
        true
      );

      result.dispatch(option!, 'pointerdown');
      expect(onDismiss).not.toHaveBeenCalled();

      result.dispatch(outside!, 'pointerdown');
      expect(onDismiss).toHaveBeenCalledOnce();
      expect(onDismiss).toHaveBeenCalledWith('outside');
    } finally {
      result.cleanup();
    }
  });
});
