import { expect, test } from 'vite-plus/test';
import { createIsland } from '../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

test('should render SVG, numeric style and enumerated false props that the browser honors', () => {
  const { container, cleanup } = createTestContainer();

  function App() {
    return (
      <div>
        <svg width={20} height={20} xmlnsXlink="http://www.w3.org/1999/xlink">
          <defs>
            <rect id="shape" width={4} height={4} />
          </defs>
          <path
            data-testid="path"
            d="M0 0h10"
            stroke="black"
            strokeDasharray="4 2"
            strokeOpacity={0.5}
          />
          <use data-testid="use" xlinkHref="#shape" />
        </svg>
        <div
          data-testid="box"
          style={{ width: 10, marginTop: 3, opacity: 0.5 }}
        />
        <img data-testid="img" alt="" draggable={false} />
      </div>
    );
  }

  try {
    createIsland({ root: container, component: App });
    flushScheduler();

    const path = container.querySelector('[data-testid="path"]')!;
    expect(getComputedStyle(path).strokeDasharray).toBe('4px, 2px');
    expect(getComputedStyle(path).strokeOpacity).toBe('0.5');

    const use = container.querySelector('[data-testid="use"]') as SVGUseElement;
    expect(use.href.baseVal).toBe('#shape');

    const box = container.querySelector('[data-testid="box"]')!;
    expect(getComputedStyle(box).width).toBe('10px');
    expect(getComputedStyle(box).marginTop).toBe('3px');
    expect(getComputedStyle(box).opacity).toBe('0.5');

    const img = container.querySelector(
      '[data-testid="img"]'
    ) as HTMLImageElement;
    expect(img.draggable).toBe(false);
  } finally {
    cleanup();
  }
});
