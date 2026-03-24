import { afterEach, describe, expect, it } from 'vitest';
import { FocusRing } from '../../../src/components/focus-ring';
import { mount, unmount } from '../../test-utils';

describe('FocusRing - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('tracks focused and focus-visible state from keyboard interaction', () => {
    container = mount(
      <FocusRing tabIndex={0}>
        <button type="button">Focusable</button>
      </FocusRing>
    );

    const ring = container.querySelector('[data-focus-ring="true"]')!;
    ring.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })
    );
    ring.focus();

    expect(ring.getAttribute('data-focus-ring')).toBe('true');
    expect(document.activeElement).toBe(ring);

    ring.blur();

    expect(document.activeElement).not.toBe(ring);
  });
});
