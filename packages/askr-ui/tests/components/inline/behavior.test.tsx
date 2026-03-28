import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Inline } from '../../../src/components/primitives/inline/inline';
import { INLINE_A11Y_CONTRACT } from '../../../src/components/primitives/inline/inline.a11y';
import { mount, unmount } from '../../test-utils';

describe('Inline - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) unmount(container);
  });

  it('should render the inline data-slot', () => {
    container = mount(<Inline />);
    expect(container.querySelector('[data-slot="inline"]')).not.toBeNull();
  });

  it('should render as a div by default', () => {
    container = mount(<Inline />);
    expect(container.querySelector('div[data-slot="inline"]')).not.toBeNull();
  });

  it('should pass through className', () => {
    container = mount(<Inline className="my-inline" />);
    const el = container.querySelector('[data-slot="inline"]');
    expect(el?.classList.contains('my-inline')).toBe(true);
  });

  it('should emit data-gap attribute', () => {
    container = mount(<Inline gap="0.5rem" />);
    const el = container.querySelector('[data-slot="inline"]');
    expect(el?.getAttribute(INLINE_A11Y_CONTRACT.DATA_ATTRIBUTES.gap)).toBe(
      '0.5rem'
    );
  });

  it('should emit data-align attribute', () => {
    container = mount(<Inline align="center" />);
    const el = container.querySelector('[data-slot="inline"]');
    expect(el?.getAttribute(INLINE_A11Y_CONTRACT.DATA_ATTRIBUTES.align)).toBe(
      'center'
    );
  });

  it('should emit data-wrap attribute', () => {
    container = mount(<Inline wrap="wrap" />);
    const el = container.querySelector('[data-slot="inline"]');
    expect(el?.getAttribute(INLINE_A11Y_CONTRACT.DATA_ATTRIBUTES.wrap)).toBe(
      'wrap'
    );
  });

  it('should emit data-collapse-below attribute', () => {
    container = mount(<Inline collapseBelow="sm" />);
    const el = container.querySelector('[data-slot="inline"]');
    expect(
      el?.getAttribute(INLINE_A11Y_CONTRACT.DATA_ATTRIBUTES.collapseBelow)
    ).toBe('sm');
  });

  it('should render the child element when asChild is true', () => {
    container = mount(
      <Inline asChild>
        <nav>content</nav>
      </Inline>
    );
    const el = container.querySelector('nav');
    expect(el?.getAttribute('data-slot')).toBe('inline');
  });
});
