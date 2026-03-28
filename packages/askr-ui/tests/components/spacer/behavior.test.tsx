import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Spacer } from '../../../src/components/primitives/spacer/spacer';
import { SPACER_A11Y_CONTRACT } from '../../../src/components/primitives/spacer/spacer.a11y';
import { mount, unmount } from '../../test-utils';

describe('Spacer - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) unmount(container);
  });

  it('should render the spacer data-slot', () => {
    container = mount(<Spacer />);
    expect(container.querySelector('[data-slot="spacer"]')).not.toBeNull();
  });

  it('should render as a div by default', () => {
    container = mount(<Spacer />);
    expect(container.querySelector('div[data-slot="spacer"]')).not.toBeNull();
  });

  it('should pass through className', () => {
    container = mount(<Spacer className="my-spacer" />);
    const el = container.querySelector('[data-slot="spacer"]');
    expect(el?.classList.contains('my-spacer')).toBe(true);
  });

  it('should emit data-grow attribute', () => {
    container = mount(<Spacer grow={2} />);
    const el = container.querySelector('[data-slot="spacer"]');
    expect(el?.getAttribute(SPACER_A11Y_CONTRACT.DATA_ATTRIBUTES.grow)).toBe(
      '2'
    );
  });

  it('should emit data-axis attribute', () => {
    container = mount(<Spacer axis="block" />);
    const el = container.querySelector('[data-slot="spacer"]');
    expect(el?.getAttribute(SPACER_A11Y_CONTRACT.DATA_ATTRIBUTES.axis)).toBe(
      'block'
    );
  });

  it('should emit data-basis attribute', () => {
    container = mount(<Spacer axis="inline" basis="1rem" />);
    const el = container.querySelector('[data-slot="spacer"]');
    expect(el?.getAttribute(SPACER_A11Y_CONTRACT.DATA_ATTRIBUTES.basis)).toBe(
      '1rem'
    );
  });

  it('should set width inline style for inline axis with valid CSS basis', () => {
    container = mount(<Spacer axis="inline" basis="2rem" />);
    const el = container.querySelector('[data-slot="spacer"]') as HTMLElement;
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('2rem');
  });

  it('should render the child element when asChild is true', () => {
    container = mount(
      <Spacer asChild>
        <span />
      </Spacer>
    );
    const el = container.querySelector('span');
    expect(el?.getAttribute('data-slot')).toBe('spacer');
  });
});
