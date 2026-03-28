import { afterEach, describe, expect, it } from 'vite-plus/test';
import { SidebarLayout } from '../../../src/components/patterns/sidebar-layout/sidebar-layout';
import { SIDEBAR_LAYOUT_A11Y_CONTRACT } from '../../../src/components/patterns/sidebar-layout/sidebar-layout.a11y';
import { mount, unmount } from '../../test-utils';

describe('SidebarLayout - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) unmount(container);
  });

  it('should render the sidebar-layout data-slot on the root', () => {
    container = mount(<SidebarLayout sidebar="Nav">Content</SidebarLayout>);
    expect(
      container.querySelector('[data-slot="sidebar-layout"]')
    ).not.toBeNull();
  });

  it('should render an aside element with the sidebar data-slot', () => {
    container = mount(
      <SidebarLayout sidebar={<span>Nav</span>}>Content</SidebarLayout>
    );
    const aside = container.querySelector('aside[data-slot="sidebar"]');
    expect(aside).not.toBeNull();
  });

  it('should render a main element with the main data-slot', () => {
    container = mount(<SidebarLayout sidebar="Nav">Content</SidebarLayout>);
    const main = container.querySelector('main[data-slot="main"]');
    expect(main).not.toBeNull();
  });

  it('should render sidebar content inside the aside slot', () => {
    container = mount(
      <SidebarLayout sidebar={<span id="nav-content">Nav</span>}>
        Content
      </SidebarLayout>
    );
    const aside = container.querySelector('aside[data-slot="sidebar"]');
    expect(aside?.querySelector('#nav-content')).not.toBeNull();
  });

  it('should render main content inside the main slot', () => {
    container = mount(
      <SidebarLayout sidebar="Nav">
        <p id="main-content">Main</p>
      </SidebarLayout>
    );
    const main = container.querySelector('main[data-slot="main"]');
    expect(main?.querySelector('#main-content')).not.toBeNull();
  });

  it('should pass through className to the root element', () => {
    container = mount(
      <SidebarLayout className="layout-wrapper" sidebar="Nav">
        Content
      </SidebarLayout>
    );
    const root = container.querySelector('[data-slot="sidebar-layout"]');
    expect(root?.classList.contains('layout-wrapper')).toBe(true);
  });

  it('should emit data-sidebar-position attribute', () => {
    container = mount(
      <SidebarLayout sidebarPosition="end" sidebar="Nav">
        Content
      </SidebarLayout>
    );
    const root = container.querySelector('[data-slot="sidebar-layout"]');
    expect(
      root?.getAttribute(
        SIDEBAR_LAYOUT_A11Y_CONTRACT.DATA_ATTRIBUTES.sidebarPosition
      )
    ).toBe('end');
  });

  it('should emit data-sidebar-width attribute', () => {
    container = mount(
      <SidebarLayout sidebarWidth="20rem" sidebar="Nav">
        Content
      </SidebarLayout>
    );
    const root = container.querySelector('[data-slot="sidebar-layout"]');
    expect(
      root?.getAttribute(
        SIDEBAR_LAYOUT_A11Y_CONTRACT.DATA_ATTRIBUTES.sidebarWidth
      )
    ).toBe('20rem');
  });

  it('should emit data-collapse-below attribute', () => {
    container = mount(
      <SidebarLayout collapseBelow="md" sidebar="Nav">
        Content
      </SidebarLayout>
    );
    const root = container.querySelector('[data-slot="sidebar-layout"]');
    expect(
      root?.getAttribute(
        SIDEBAR_LAYOUT_A11Y_CONTRACT.DATA_ATTRIBUTES.collapseBelow
      )
    ).toBe('md');
  });
});
