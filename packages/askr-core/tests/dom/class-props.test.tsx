import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland } from '../helpers/create-island';
import {
  createTestContainer,
  flushScheduler,
  captureSSRSnapshot,
  expectDOM,
} from '../helpers/test-renderer';

describe('class / className interoperability', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const r = createTestContainer();
    container = r.container;
    cleanup = r.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should accept `class` prop in JSX and set element class', () => {
    const Component = () => <div class={'alpha'}>{'x'}</div>;

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLElement;
    expect(div.className).toBe('alpha');
    expectDOM(container).hasClass('div', 'alpha');
  });

  it('should accept `className` prop for compatibility', () => {
    const Component = () => <div className={'beta'}>{'y'}</div>;

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLElement;
    expect(div.className).toBe('beta');
    expectDOM(container).hasClass('div', 'beta');
  });

  it('should emit `class` attribute for both `class` and `className` inputs in SSR', async () => {
    const CompA = () => <div class={'ssr-a'}>{'x'}</div>;
    const CompB = () => <div className={'ssr-b'}>{'y'}</div>;

    const htmlA = await captureSSRSnapshot(CompA);
    const htmlB = await captureSSRSnapshot(CompB);

    expect(htmlA).toContain('class="ssr-a"');
    expect(htmlB).toContain('class="ssr-b"');
  });
});
