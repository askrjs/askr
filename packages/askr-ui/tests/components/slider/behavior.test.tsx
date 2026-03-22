import { afterEach, describe, expect, it } from 'vitest';
import {
  Slider,
  SliderRange,
  SliderThumb,
  SliderTrack,
} from '../../../src/components/slider';
import { flushUpdates, mount, unmount } from '../../test-utils';

describe('Slider - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('should update value from pointer and keyboard input', async () => {
    container = mount(
      <Slider defaultValue={20} name="volume">
        <SliderTrack>
          <SliderRange />
          <SliderThumb />
        </SliderTrack>
      </Slider>
    );

    const track = container.querySelector(
      '[data-slider-track="true"]'
    ) as HTMLDivElement;

    track.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 100,
        height: 10,
        right: 100,
        bottom: 10,
        x: 0,
        y: 0,
        toJSON: () => null,
      }) as DOMRect;

    track.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 80,
        clientY: 5,
      })
    );
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await flushUpdates();

    const thumb = container.querySelector('[role="slider"]') as HTMLDivElement;
    const input = container.querySelector(
      'input[type="hidden"]'
    ) as HTMLInputElement;

    expect(thumb.getAttribute('aria-valuenow')).toBe('80');
    expect(input.value).toBe('80');

    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    await flushUpdates();
    expect(input.value).toBe('81');
  });

  it('should emit --ak-slider-percentage as a CSS custom property on the root', () => {
    container = mount(
      <Slider defaultValue={25} min={0} max={100}>
        <SliderTrack>
          <SliderRange />
          <SliderThumb />
        </SliderTrack>
      </Slider>
    );

    const root = container.querySelector('[data-slot="slider"]') as HTMLElement;
    expect(root?.getAttribute('style')).toContain('--ak-slider-percentage:25%');
  });
});
