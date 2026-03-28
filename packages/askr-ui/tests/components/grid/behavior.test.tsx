import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Grid } from '../../../src/components/primitives/grid/grid';
import { GRID_A11Y_CONTRACT } from '../../../src/components/primitives/grid/grid.a11y';
import { mount, unmount } from '../../test-utils';

describe('Grid - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) unmount(container);
  });

  it('should render the grid data-slot', () => {
    container = mount(<Grid />);
    expect(container.querySelector('[data-slot="grid"]')).not.toBeNull();
  });

  it('should render as a div by default', () => {
    container = mount(<Grid />);
    expect(container.querySelector('div[data-slot="grid"]')).not.toBeNull();
  });

  it('should pass through className', () => {
    container = mount(<Grid className="my-grid" />);
    const el = container.querySelector('[data-slot="grid"]');
    expect(el?.classList.contains('my-grid')).toBe(true);
  });

  it('should apply repeat columns style given a numeric columns prop', () => {
    container = mount(<Grid columns={3} />);
    const el = container.querySelector('[data-slot="grid"]') as HTMLElement;
    expect(el.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
  });

  it('should apply repeat columns style given a numeric string columns prop', () => {
    container = mount(<Grid columns="3" />);
    const el = container.querySelector('[data-slot="grid"]') as HTMLElement;
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('repeat(3, minmax(0, 1fr))');
  });

  it('should apply raw CSS string given a CSS length columns prop', () => {
    container = mount(<Grid columns="1fr 2fr 1fr" />);
    // CSS grid string is not a plain CSS length, should not set inline style
    const el = container.querySelector('[data-slot="grid"]') as HTMLElement;
    // data-columns attribute should still be set
    expect(el.getAttribute(GRID_A11Y_CONTRACT.DATA_ATTRIBUTES.columns)).toBe(
      '1fr 2fr 1fr'
    );
  });

  it('should emit data-columns attribute', () => {
    container = mount(<Grid columns={2} />);
    const el = container.querySelector('[data-slot="grid"]');
    expect(el?.getAttribute(GRID_A11Y_CONTRACT.DATA_ATTRIBUTES.columns)).toBe(
      '2'
    );
  });

  it('should emit data-min-item-width attribute', () => {
    container = mount(<Grid minItemWidth="200px" />);
    const el = container.querySelector('[data-slot="grid"]');
    expect(
      el?.getAttribute(GRID_A11Y_CONTRACT.DATA_ATTRIBUTES.minItemWidth)
    ).toBe('200px');
  });

  it('should emit data-gap attribute', () => {
    container = mount(<Grid gap="1rem" />);
    const el = container.querySelector('[data-slot="grid"]');
    expect(el?.getAttribute(GRID_A11Y_CONTRACT.DATA_ATTRIBUTES.gap)).toBe(
      '1rem'
    );
  });

  it('should render the child element when asChild is true', () => {
    container = mount(
      <Grid asChild>
        <ul>content</ul>
      </Grid>
    );
    const el = container.querySelector('ul');
    expect(el?.getAttribute('data-slot')).toBe('grid');
  });
});
