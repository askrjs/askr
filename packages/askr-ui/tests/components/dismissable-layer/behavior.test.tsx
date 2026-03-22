import { afterEach, describe, expect, it, vi } from 'vitest';
import { DismissableLayer } from '../../../src/components/dismissable-layer';
import { mount, unmount } from '../../test-utils';

describe('DismissableLayer - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('dismisses on Escape for the mounted layer', () => {
    const onDismiss = vi.fn();

    container = mount(
      <DismissableLayer onDismiss={onDismiss}>
        <div>Layer</div>
      </DismissableLayer>
    );

    const layer = container.querySelector('[data-dismissable-layer="true"]')!;
    layer.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
