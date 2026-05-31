import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createSPA, cleanupApp } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settleNavigation(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

async function mountIsolatedSpas(
  rootA: HTMLDivElement,
  rootB: HTMLDivElement
): Promise<void> {
  await createSPA({
    root: rootA,
    routes: [
      {
        path: '/start',
        handler: () => <div id={'app-a'}>{'A start'}</div>,
      },
      {
        path: '/next',
        handler: () => <div id={'app-a'}>{'A next'}</div>,
      },
    ],
  });

  await createSPA({
    root: rootB,
    routes: [
      {
        path: '/start',
        handler: () => <div id={'app-b'}>{'B start'}</div>,
      },
      {
        path: '/next',
        handler: () => <div id={'app-b'}>{'B next'}</div>,
      },
    ],
  });
}

describe('multi-root SPA isolation', () => {
  let rootA: HTMLDivElement;
  let rootB: HTMLDivElement;
  let cleanupA: () => void;
  let cleanupB: () => void;

  beforeEach(() => {
    const first = createTestContainer();
    rootA = first.container;
    cleanupA = first.cleanup;

    const second = createTestContainer();
    rootB = second.container;
    cleanupB = second.cleanup;

    window.history.replaceState({}, '', '/start');
  });

  afterEach(() => {
    cleanupApp(rootB);
    cleanupApp(rootA);
    cleanupB();
    cleanupA();
    window.history.replaceState({}, '', '/');
  });

  it('should keep two SPAs independently routable across the same browser navigation', async () => {
    await mountIsolatedSpas(rootA, rootB);

    await settleNavigation();

    expect(rootA.textContent).toBe('A start');
    expect(rootB.textContent).toBe('B start');

    navigate('/next');
    await settleNavigation();

    expect(rootA.textContent).toBe('A next');
    expect(rootB.textContent).toBe('B next');
  });

  it('should keep both SPAs in sync when browser history triggers popstate', async () => {
    await mountIsolatedSpas(rootA, rootB);
    await settleNavigation();

    navigate('/next');
    await settleNavigation();

    expect(rootA.textContent).toBe('A next');
    expect(rootB.textContent).toBe('B next');

    window.history.replaceState({ path: '/start' }, '', '/start');
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: { path: '/start' } })
    );
    await settleNavigation();

    expect(rootA.textContent).toBe('A start');
    expect(rootB.textContent).toBe('B start');
  });
});
