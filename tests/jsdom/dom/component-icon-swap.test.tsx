import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type HostInstance = {
  fn?: { name?: string };
};

type HostElement = SVGSVGElement & {
  __ASKR_INSTANCE?: HostInstance;
  __ASKR_INSTANCES?: HostInstance[];
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

describe('component icon swaps', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should swap same-host SVG component children without dropping icon output or retaining stale component owners', () => {
    let paused!: ReturnType<typeof state<boolean>>;

    function PauseIcon() {
      return (
        <svg data-icon="pause" viewBox="0 0 24 24">
          <path key={0} data-shape="pause-left" d="M8 5v14" />
          <path key={1} data-shape="pause-right" d="M16 5v14" />
        </svg>
      );
    }

    function PlayIcon() {
      return (
        <svg data-icon="play" viewBox="0 0 24 24">
          <path key={0} data-shape="play" d="M8 5v14l11-7z" />
        </svg>
      );
    }

    const App = () => {
      paused = state(false);

      return (
        <button type="button" aria-label={paused() ? 'Resume' : 'Pause'}>
          {paused() ? <PlayIcon /> : <PauseIcon />}
        </button>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const button = container.querySelector('button');
    const initialSvg = container.querySelector('svg') as HostElement | null;

    expect(button?.getAttribute('aria-label')).toBe('Pause');
    expect(initialSvg?.getAttribute('data-icon')).toBe('pause');
    expect(initialSvg?.querySelectorAll('[data-shape]')).toHaveLength(2);
    expect(
      Array.from(initialSvg?.children ?? []).map((child) => child.namespaceURI)
    ).toEqual([SVG_NAMESPACE, SVG_NAMESPACE]);
    expect(
      initialSvg?.__ASKR_INSTANCES?.map((instance) => instance.fn?.name)
    ).toEqual(['PauseIcon']);

    for (let index = 0; index < 6; index += 1) {
      const nextPaused = index % 2 === 0;
      paused.set(nextPaused);
      flushScheduler();

      const svg = container.querySelector('svg') as HostElement | null;
      expect(svg).toBe(initialSvg);
      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(svg?.querySelectorAll('[data-shape]')).toHaveLength(
        nextPaused ? 1 : 2
      );
      expect(
        Array.from(svg?.children ?? []).map((child) => child.namespaceURI)
      ).toEqual(nextPaused ? [SVG_NAMESPACE] : [SVG_NAMESPACE, SVG_NAMESPACE]);
      expect(svg?.getAttribute('data-icon')).toBe(
        nextPaused ? 'play' : 'pause'
      );
      expect(svg?.querySelector('[data-shape="play"]') !== null).toBe(
        nextPaused
      );
      expect(svg?.querySelector('[data-shape="pause-left"]') !== null).toBe(
        !nextPaused
      );
      expect(
        svg?.__ASKR_INSTANCES?.map((instance) => instance.fn?.name)
      ).toEqual([nextPaused ? 'PlayIcon' : 'PauseIcon']);
    }
  });
});
