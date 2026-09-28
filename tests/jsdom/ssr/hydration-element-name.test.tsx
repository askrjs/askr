import { describe, expect, it } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

describe('hydration element names', () => {
  it('should not claim an SVG element with the wrong case-sensitive name', () => {
    const container = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const wrong = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'lineargradient'
    );
    svg.append(wrong);
    container.append(svg);
    const root = createRoot(container, { hydrate: true });

    root.render(
      <svg>
        <linearGradient />
      </svg>
    );

    expect(svg.firstElementChild).not.toBe(wrong);
    expect(svg.firstElementChild?.localName).toBe('linearGradient');
    root.dispose();
  });
});
