import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Center } from '../../../src/components/primitives/center/center';
import { CENTER_A11Y_CONTRACT } from '../../../src/components/primitives/center/center.a11y';
import { mount, unmount } from '../../test-utils';

describe('Center - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) unmount(container);
  });

  it('should render the center data-slot', () => {
    container = mount(<Center />);
    expect(container.querySelector('[data-slot="center"]')).not.toBeNull();
  });

  it('should default axis to both', () => {
    container = mount(<Center />);
    const el = container.querySelector('[data-slot="center"]');
    expect(el?.getAttribute(CENTER_A11Y_CONTRACT.DATA_ATTRIBUTES.axis)).toBe(
      'both'
    );
  });

  it('should pass through className', () => {
    container = mount(<Center className="my-center" />);
    const el = container.querySelector('[data-slot="center"]');
    expect(el?.classList.contains('my-center')).toBe(true);
  });

  it('should emit data-axis attribute', () => {
    container = mount(<Center axis="horizontal" />);
    const el = container.querySelector('[data-slot="center"]');
    expect(el?.getAttribute(CENTER_A11Y_CONTRACT.DATA_ATTRIBUTES.axis)).toBe(
      'horizontal'
    );
  });

  it('should emit data-min-height attribute', () => {
    container = mount(<Center minHeight="100vh" />);
    const el = container.querySelector('[data-slot="center"]');
    expect(
      el?.getAttribute(CENTER_A11Y_CONTRACT.DATA_ATTRIBUTES.minHeight)
    ).toBe('100vh');
  });

  it('should set minHeight inline style for valid CSS lengths', () => {
    container = mount(<Center minHeight="50vh" />);
    const el = container.querySelector('[data-slot="center"]') as HTMLElement;
    expect(el.style.minHeight).toBe('50vh');
  });

  it('should emit data-inline attribute when inline is true', () => {
    container = mount(<Center inline />);
    const el = container.querySelector('[data-slot="center"]');
    expect(el?.getAttribute(CENTER_A11Y_CONTRACT.DATA_ATTRIBUTES.inline)).toBe(
      'true'
    );
  });

  it('should render the child element when asChild is true', () => {
    container = mount(
      <Center asChild>
        <section>content</section>
      </Center>
    );
    const el = container.querySelector('section');
    expect(el?.getAttribute('data-slot')).toBe('center');
  });
});
