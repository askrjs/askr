import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, navigate } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';
import { route } from '../../src/index';

// Minimal testing window helper
function setGlobalWindow(path: string) {
  (global as any).window = {
    location: { pathname: path, search: '', hash: '' },
    history: { pushState() {} },
    addEventListener() {},
    removeEventListener() {},
  };
}

describe('Minimal router story (authoritative)', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const t = createTestContainer();
    container = t.container;
    cleanup = t.cleanup;
  });

  afterEach(() => {
    cleanup();
    try {
      delete (global as any).window;
    } catch {}
  });

  it('should activate only the single best match (longest-match wins)', async () => {
    const calls: string[] = [];

    route('/parent', () => {
      calls.push('parent');
      return { type: 'div', props: {}, children: ['parent'] };
    });

    route('/parent/*', () => {
      calls.push('parent-wildcard');
      return { type: 'div', props: {}, children: ['parent-wildcard'] };
    });

    route('/parent/child', () => {
      calls.push('child');
      return { type: 'div', props: {}, children: ['child'] };
    });

    // initial window
    setGlobalWindow('/');
    createApp({ root: container, component: () => ({ type: 'div', props: {}, children: ['App'] }) });

    // navigate to the deeper path
    navigate('/parent/child');
    await flushScheduler();

    // Expect only the longest match handler to have run
    expect(container.textContent).toBe('child');
    expect(calls).toEqual(['child']);
  });

  it('should preserve shared layout DOM across navigations (atomic commit)', async () => {
    // two routes that share the same layout wrapper element
    route('/layout/a', () => ({
      type: 'div',
      props: { class: 'layout' },
      children: [ { type: 'div', props: { class: 'inner' }, children: ['A'] } ],
    }));

    route('/layout/b', () => ({
      type: 'div',
      props: { class: 'layout' },
      children: [ { type: 'div', props: { class: 'inner' }, children: ['B'] } ],
    }));

    setGlobalWindow('/layout/a');
    createApp({ root: container, component: () => ({ type: 'div', props: {}, children: ['App'] }) });

    navigate('/layout/a');
    await flushScheduler();

    const layoutEl1 = container.querySelector('.layout') as HTMLElement | null;
    const inner1 = container.querySelector('.inner') as HTMLElement | null;

    expect(layoutEl1).not.toBeNull();
    expect(inner1?.textContent).toBe('A');

    // navigate to sibling route that share same layout structure
    navigate('/layout/b');
    await flushScheduler();

    const layoutEl2 = container.querySelector('.layout') as HTMLElement | null;
    const inner2 = container.querySelector('.inner') as HTMLElement | null;

    // The layout element should be the same DOM instance (preserved)
    expect(layoutEl2).toBe(layoutEl1);
    // The inner content should update
    expect(inner2?.textContent).toBe('B');
  });
});
