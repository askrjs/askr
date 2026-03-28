import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Stack } from '../../../src/components/primitives/stack/stack';
import { STACK_A11Y_CONTRACT } from '../../../src/components/primitives/stack/stack.a11y';
import { mount, unmount } from '../../test-utils';

describe('Stack - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) unmount(container);
  });

  it('should render the stack data-slot', () => {
    container = mount(<Stack />);
    expect(container.querySelector('[data-slot="stack"]')).not.toBeNull();
  });

  it('should render as a div by default', () => {
    container = mount(<Stack />);
    expect(container.querySelector('div[data-slot="stack"]')).not.toBeNull();
  });

  it('should pass through className', () => {
    container = mount(<Stack className="my-stack" />);
    const el = container.querySelector('[data-slot="stack"]');
    expect(el?.classList.contains('my-stack')).toBe(true);
  });

  it('should emit data-gap attribute', () => {
    container = mount(<Stack gap="1rem" />);
    const el = container.querySelector('[data-slot="stack"]');
    expect(el?.getAttribute(STACK_A11Y_CONTRACT.DATA_ATTRIBUTES.gap)).toBe(
      '1rem'
    );
  });

  it('should emit data-align attribute', () => {
    container = mount(<Stack align="center" />);
    const el = container.querySelector('[data-slot="stack"]');
    expect(el?.getAttribute(STACK_A11Y_CONTRACT.DATA_ATTRIBUTES.align)).toBe(
      'center'
    );
  });

  it('should emit data-justify attribute', () => {
    container = mount(<Stack justify="space-between" />);
    const el = container.querySelector('[data-slot="stack"]');
    expect(el?.getAttribute(STACK_A11Y_CONTRACT.DATA_ATTRIBUTES.justify)).toBe(
      'space-between'
    );
  });

  it('should emit data-wrap attribute', () => {
    container = mount(<Stack wrap="wrap" />);
    const el = container.querySelector('[data-slot="stack"]');
    expect(el?.getAttribute(STACK_A11Y_CONTRACT.DATA_ATTRIBUTES.wrap)).toBe(
      'wrap'
    );
  });

  it('should render the child element when asChild is true', () => {
    container = mount(
      <Stack asChild>
        <section>content</section>
      </Stack>
    );
    const el = container.querySelector('section');
    expect(el?.getAttribute('data-slot')).toBe('stack');
  });
});
