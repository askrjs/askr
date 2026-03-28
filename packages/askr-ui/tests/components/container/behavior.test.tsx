import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Container } from '../../../src/components/primitives/container/container';
import { CONTAINER_A11Y_CONTRACT } from '../../../src/components/primitives/container/container.a11y';
import { mount, unmount } from '../../test-utils';

describe('Container - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) unmount(container);
  });

  it('should render the container data-slot', () => {
    container = mount(<Container />);
    expect(container.querySelector('[data-slot="container"]')).not.toBeNull();
  });

  it('should default to centered and fluid', () => {
    container = mount(<Container />);
    const el = container.querySelector(
      '[data-slot="container"]'
    ) as HTMLElement;
    expect(el.getAttribute('data-centered')).toBe('true');
    expect(el.getAttribute('data-fluid')).toBe('true');
  });

  it('should pass through className', () => {
    container = mount(<Container className="my-container" />);
    const el = container.querySelector('[data-slot="container"]');
    expect(el?.classList.contains('my-container')).toBe(true);
  });

  it('should pass through user style properties', () => {
    container = mount(<Container style={{ color: 'red' }} />);
    const el = container.querySelector(
      '[data-slot="container"]'
    ) as HTMLElement;
    expect(el.style.color).toBe('red');
  });

  it('should emit data-max-width attribute', () => {
    container = mount(<Container maxWidth="80rem" />);
    const el = container.querySelector('[data-slot="container"]');
    expect(
      el?.getAttribute(CONTAINER_A11Y_CONTRACT.DATA_ATTRIBUTES.maxWidth)
    ).toBe('80rem');
  });

  it('should set maxWidth inline style for valid CSS lengths', () => {
    container = mount(<Container maxWidth="80rem" />);
    const el = container.querySelector(
      '[data-slot="container"]'
    ) as HTMLElement;
    expect(el.style.maxWidth).toBe('80rem');
  });

  it('should emit data-size attribute for named tokens', () => {
    container = mount(<Container size="lg" />);
    const el = container.querySelector('[data-slot="container"]');
    expect(el?.getAttribute(CONTAINER_A11Y_CONTRACT.DATA_ATTRIBUTES.size)).toBe(
      'lg'
    );
  });

  it('should render the child element when asChild is true', () => {
    container = mount(
      <Container asChild>
        <section>content</section>
      </Container>
    );
    const el = container.querySelector('section');
    expect(el?.getAttribute('data-slot')).toBe('container');
  });
});
