import { afterEach, describe, expect, it } from 'vitest';
import { FocusScope } from '../../../src/components/focus-scope';
import { mount, unmount } from '../../test-utils';

describe('FocusScope - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
    document.body.innerHTML = '';
  });

  it('supports manual focus inside the scope without breaking the focus target', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Before';
    document.body.appendChild(trigger);
    trigger.focus();

    container = mount(
      <FocusScope restoreFocus>
        <button type="button">First</button>
        <button type="button">Second</button>
      </FocusScope>
    );

    const first = container.querySelector('button') as HTMLButtonElement;
    first.focus();
    expect(document.activeElement).toBe(first);

    expect(document.activeElement).not.toBe(trigger);
  });
});
