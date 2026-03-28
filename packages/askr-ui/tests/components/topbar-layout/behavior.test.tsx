import { afterEach, describe, expect, it } from 'vite-plus/test';
import { TopbarLayout } from '../../../src/components/patterns/topbar-layout/topbar-layout';
import { TOPBAR_LAYOUT_A11Y_CONTRACT } from '../../../src/components/patterns/topbar-layout/topbar-layout.a11y';
import { mount, unmount } from '../../test-utils';

describe('TopbarLayout - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) unmount(container);
  });

  it('should render the topbar-layout data-slot on the root', () => {
    container = mount(<TopbarLayout topbar="Header">Content</TopbarLayout>);
    expect(
      container.querySelector('[data-slot="topbar-layout"]')
    ).not.toBeNull();
  });

  it('should render a header element with the navbar data-slot', () => {
    container = mount(
      <TopbarLayout topbar={<span>Header</span>}>Content</TopbarLayout>
    );
    const header = container.querySelector('header[data-slot="navbar"]');
    expect(header).not.toBeNull();
  });

  it('should render a main element with the main data-slot', () => {
    container = mount(<TopbarLayout topbar="Header">Content</TopbarLayout>);
    const main = container.querySelector('main[data-slot="main"]');
    expect(main).not.toBeNull();
  });

  it('should render topbar content inside the navbar slot', () => {
    container = mount(
      <TopbarLayout topbar={<span id="topbar-content">Header</span>}>
        Content
      </TopbarLayout>
    );
    const header = container.querySelector('header[data-slot="navbar"]');
    expect(header?.querySelector('#topbar-content')).not.toBeNull();
  });

  it('should render main content inside the main slot', () => {
    container = mount(
      <TopbarLayout topbar="Header">
        <p id="main-content">Main</p>
      </TopbarLayout>
    );
    const main = container.querySelector('main[data-slot="main"]');
    expect(main?.querySelector('#main-content')).not.toBeNull();
  });

  it('should pass through className to the root element', () => {
    container = mount(
      <TopbarLayout className="app-shell" topbar="Header">
        Content
      </TopbarLayout>
    );
    const root = container.querySelector('[data-slot="topbar-layout"]');
    expect(root?.classList.contains('app-shell')).toBe(true);
  });

  it('should emit data-topbar-height attribute', () => {
    container = mount(
      <TopbarLayout topbarHeight="4rem" topbar="Header">
        Content
      </TopbarLayout>
    );
    const root = container.querySelector('[data-slot="topbar-layout"]');
    expect(
      root?.getAttribute(
        TOPBAR_LAYOUT_A11Y_CONTRACT.DATA_ATTRIBUTES.topbarHeight
      )
    ).toBe('4rem');
  });

  it('should set topbar height inline style for valid CSS lengths', () => {
    container = mount(
      <TopbarLayout topbarHeight="4rem" topbar="Header">
        Content
      </TopbarLayout>
    );
    const header = container.querySelector(
      'header[data-slot="navbar"]'
    ) as HTMLElement;
    const style = header.getAttribute('style') ?? '';
    expect(style).toContain('4rem');
  });

  it('should emit data-gap attribute', () => {
    container = mount(
      <TopbarLayout gap="1rem" topbar="Header">
        Content
      </TopbarLayout>
    );
    const root = container.querySelector('[data-slot="topbar-layout"]');
    expect(
      root?.getAttribute(TOPBAR_LAYOUT_A11Y_CONTRACT.DATA_ATTRIBUTES.gap)
    ).toBe('1rem');
  });
});
