import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  captureSSRSnapshot,
} from '../../../test-utils/render/test-renderer';

describe('SVG intrinsic prop normalization', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should render common camelCase SVG props as their real attribute names in the DOM', () => {
    let strokeWidth!: ReturnType<typeof state<number | null>>;
    let strokeLinecap!: ReturnType<typeof state<string | null>>;
    let fillRule!: ReturnType<typeof state<string | null>>;

    const Component = () => {
      strokeWidth = state<number | null>(2);
      strokeLinecap = state<string | null>('round');
      fillRule = state<string | null>('evenodd');

      return (
        <svg
          viewBox="0 0 24 24"
          strokeWidth={() => strokeWidth()}
          strokeLinecap={() => strokeLinecap()}
          xmlns="http://www.w3.org/2000/svg"
        >
          <g stroke="currentColor">
            <path
              d="M4 12h16"
              fillRule={() => fillRule()}
              clipRule={() => fillRule()}
            />
            <circle cx={12} cy={12} r={10} fill="none" />
            <rect x={2} y={2} width={20} height={20} rx={4} ry={4} />
          </g>
        </svg>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const svg = container.querySelector('svg') as SVGSVGElement;
    const path = container.querySelector('path') as SVGPathElement;
    const circle = container.querySelector('circle') as SVGCircleElement;
    const rect = container.querySelector('rect') as SVGRectElement;

    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    expect(svg.getAttribute('strokeWidth')).toBeNull();
    expect(svg.getAttribute('strokeLinecap')).toBeNull();
    expect(path.getAttribute('fill-rule')).toBe('evenodd');
    expect(path.getAttribute('clip-rule')).toBe('evenodd');
    expect(path.getAttribute('fillRule')).toBeNull();
    expect(path.getAttribute('clipRule')).toBeNull();
    expect(circle.getAttribute('cx')).toBe('12');
    expect(circle.getAttribute('cy')).toBe('12');
    expect(circle.getAttribute('r')).toBe('10');
    expect(rect.getAttribute('rx')).toBe('4');
    expect(rect.getAttribute('ry')).toBe('4');

    strokeWidth.set(4);
    strokeLinecap.set('square');
    fillRule.set(null);
    flushScheduler();

    expect(svg.getAttribute('stroke-width')).toBe('4');
    expect(svg.getAttribute('stroke-linecap')).toBe('square');
    expect(path.getAttribute('fill-rule')).toBeNull();
    expect(path.getAttribute('clip-rule')).toBeNull();
  });

  it('should serialize common camelCase SVG props as their real attribute names in SSR', async () => {
    const Component = () => (
      <svg
        viewBox="0 0 24 24"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g stroke="currentColor">
          <path
            d="M4 12h16"
            fillRule="evenodd"
            clipRule="evenodd"
            strokeWidth={3}
          />
        </g>
      </svg>
    );

    const html = await captureSSRSnapshot(Component);

    expect(html).toContain(
      '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">'
    );
    expect(html).toContain(
      '<path d="M4 12h16" fill-rule="evenodd" clip-rule="evenodd" stroke-width="3"></path>'
    );
    expect(html).not.toContain('strokeWidth=');
    expect(html).not.toContain('strokeLinecap=');
    expect(html).not.toContain('strokeLinejoin=');
    expect(html).not.toContain('fillRule=');
    expect(html).not.toContain('clipRule=');
  });
});
