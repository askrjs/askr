/**
 * Tests for the createIcon factory and the component it produces.
 *
 * These tests use a hand-crafted fixture IconNode — they do NOT import from
 * any generated file (src/icons/ is gitignored and not checked in).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createIsland } from '@askrjs/askr';
import { createIcon } from '../src/create-icon';
import type { IconNode } from '../src/types';

// Minimal fixture that mimics a real Lucide icon node (two SVG children).
const FIXTURE_NODE: IconNode = [
  ['circle', { cx: '11', cy: '11', r: '8' }],
  ['path', { d: 'M21 21l-4.35-4.35' }],
];
const TestIcon = createIcon('TestIcon', FIXTURE_NODE);

function mount(element: JSX.Element): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  createIsland({ root: container, component: () => element });
  return container;
}

function unmount(container: HTMLElement): void {
  document.body.removeChild(container);
}

describe('createIcon — rendered output', () => {
  let container: HTMLElement;
  afterEach(() => unmount(container));

  it('renders an <svg> element', () => {
    container = mount(<TestIcon />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders svg children from the icon node', () => {
    container = mount(<TestIcon />);
    expect(container.querySelector('svg circle')).not.toBeNull();
    expect(container.querySelector('svg path')).not.toBeNull();
  });

  it('applies default size of 20', () => {
    container = mount(<TestIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('var(--ak-icon-size)');
    expect(svg.getAttribute('height')).toBe('var(--ak-icon-size)');
    expect(svg.getAttribute('style')).toContain('--ak-icon-size:20px');
  });

  it('applies custom size', () => {
    container = mount(<TestIcon size={32} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('var(--ak-icon-size)');
    expect(svg.getAttribute('height')).toBe('var(--ak-icon-size)');
    expect(svg.getAttribute('style')).toContain('--ak-icon-size:32px');
  });

  it('emits semantic size hooks for named sizes', () => {
    container = mount(<TestIcon size="sm" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('data-size')).toBe('sm');
    expect(svg.getAttribute('style')).toContain('--ak-icon-size:var(--ak-icon-size-sm');
  });

  it('does not emit semantic size hooks for raw CSS sizes', () => {
    container = mount(<TestIcon size="1.5rem" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('data-size')).toBeNull();
    expect(svg.getAttribute('style')).toContain('--ak-icon-size:1.5rem');
  });

  it('sets default stroke color to currentColor', () => {
    container = mount(<TestIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('data-color')).toBe('current');
  });

  it('applies custom color via stroke attribute', () => {
    container = mount(<TestIcon color="red" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('red');
    expect(svg.getAttribute('data-color')).toBeNull();
  });

  it('routes stroke width through the theme contract variable', () => {
    container = mount(<TestIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke-width')).toBe('var(--ak-icon-stroke-width)');
    expect(svg.getAttribute('style')).toContain('--ak-icon-stroke-width:var(--ak-icon-stroke-width-md, 2)');
  });

  it('preserves explicit stroke width overrides', () => {
    container = mount(<TestIcon strokeWidth={1.5} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('style')).toContain('--ak-icon-stroke-width:1.5');
  });

  it('sets aria-hidden when no title is provided', () => {
    container = mount(<TestIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('data-decorative')).toBe('true');
  });

  it('does not set aria-hidden when title is provided', () => {
    container = mount(<TestIcon title="Search" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('data-decorative')).toBeNull();
  });

  it('renders a <title> element when title prop is passed', () => {
    container = mount(<TestIcon title="Search icon" />);
    const title = container.querySelector('svg title')!;
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('Search icon');
  });

  it('sets role=img', () => {
    container = mount(<TestIcon />);
    expect(container.querySelector('svg')!.getAttribute('role')).toBe('img');
  });

  it('emits stable icon theme hooks', () => {
    container = mount(<TestIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('data-slot')).toBe('icon');
    expect(svg.getAttribute('data-icon')).toBe('TestIcon');
  });

  it('applies class prop', () => {
    container = mount(<TestIcon class="icon-sm" />);
    expect(container.querySelector('svg')!.getAttribute('class')).toBe('icon-sm');
  });

  it('merges user style with icon contract variables', () => {
    container = mount(<TestIcon style="opacity:0.5" />);
    const style = container.querySelector('svg')!.getAttribute('style') ?? '';
    expect(style).toContain('--ak-icon-size:20px');
    expect(style).toContain('opacity:0.5');
  });

  it('passes arbitrary props through to the svg element', () => {
    container = mount(<TestIcon data-testid="my-icon" />);
    expect(container.querySelector('svg')!.getAttribute('data-testid')).toBe('my-icon');
  });
});
