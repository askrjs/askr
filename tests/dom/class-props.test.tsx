import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  captureSSRSnapshot,
  expectDOM,
} from '../helpers/test_renderer';

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
    const Component = () => ({
      type: 'div',
      props: { class: 'alpha' },
      children: ['x'],
    });

    createApp({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLElement;
    expect(div.className).toBe('alpha');
    expectDOM(container).hasClass('div', 'alpha');
  });

  it('should accept `className` prop for compatibility', () => {
    const Component = () => ({
      type: 'div',
      props: { className: 'beta' },
      children: ['y'],
    });

    createApp({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div') as HTMLElement;
    expect(div.className).toBe('beta');
    expectDOM(container).hasClass('div', 'beta');
  });

  it('should emit `class` attribute for both `class` and `className` inputs in SSR', async () => {
    const CompA = () => ({
      type: 'div',
      props: { class: 'ssr-a' },
      children: ['x'],
    });
    const CompB = () => ({
      type: 'div',
      props: { className: 'ssr-b' },
      children: ['y'],
    });

    const htmlA = await captureSSRSnapshot(CompA);
    const htmlB = await captureSSRSnapshot(CompB);

    expect(htmlA).toContain('class="ssr-a"');
    expect(htmlB).toContain('class="ssr-b"');
  });
});
