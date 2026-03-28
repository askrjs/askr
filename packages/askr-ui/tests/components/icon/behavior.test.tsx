import { afterEach, describe, expect, it } from 'vite-plus/test';
import { IconBase } from '@askrjs/askr/foundations';
import { mount, unmount } from '../../test-utils';

describe('IconBase', () => {
  let container: HTMLElement | undefined;

  afterEach(() => {
    unmount(container);
    container = undefined;
  });

  it('emits the canonical icon theme hooks', () => {
    container = mount(IconBase({ iconName: 'Search' }));

    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('data-slot')).toBe('icon');
    expect(svg.getAttribute('data-icon')).toBe('Search');
    expect(svg.getAttribute('data-color')).toBe('current');
  });

  it('emits semantic data-size only for named sizes', () => {
    container = mount(IconBase({ size: 'sm' }));

    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('data-size')).toBe('sm');
    expect(svg.getAttribute('style')).toContain(
      '--ak-icon-size:var(--ak-icon-size-sm'
    );
  });

  it('treats raw CSS sizes as consumer overrides', () => {
    container = mount(IconBase({ size: '1.5rem' }));

    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('data-size')).toBeNull();
    expect(svg.getAttribute('style')).toContain('--ak-icon-size:1.5rem');
  });

  it('marks unlabeled icons as decorative', () => {
    container = mount(IconBase({}));

    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('data-decorative')).toBe('true');
  });

  it('renders a title for labeled icons', () => {
    container = mount(IconBase({ title: 'Search' }));

    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('data-decorative')).toBeNull();
    expect(svg.querySelector('title')?.textContent).toBe('Search');
  });

  it('preserves explicit stroke width overrides', () => {
    container = mount(IconBase({ strokeWidth: 1.5 }));

    const style = container.querySelector('svg')?.getAttribute('style') ?? '';
    expect(style).toContain(
      '--ak-icon-stroke-width:var(--ak-icon-stroke-width-md, 1.5)'
    );
  });

  it('pins intrinsic svg sizing while exposing css size hooks', () => {
    container = mount(IconBase({ size: 15 }));

    const svg = container.querySelector('svg')!;
    const style = svg.getAttribute('style') ?? '';
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
    expect(style).toContain('--ak-icon-size:15px');
    expect(style).toContain('display:inline-block');
    expect(style).toContain('flex-shrink:0');
  });
});
