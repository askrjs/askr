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
      <FocusRing>
        <button type="button">Focusable</button>
      </FocusRing>
    );

    const ring = container.querySelector('[data-focus-ring="true"]')!;
    ring.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })
    );
    ring.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    expect(ring.getAttribute('data-focused')).toBe('true');
    expect(ring.getAttribute('data-focus-visible')).toBe('true');

    ring.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(ring.hasAttribute('data-focused')).toBe(false);
    expect(ring.hasAttribute('data-focus-visible')).toBe(false);
  });
});
