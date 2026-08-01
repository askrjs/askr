import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('dangerouslySetInnerHTML on the client renderer', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should set innerHTML instead of writing a garbage attribute', () => {
    createIsland({
      root: container,
      component: () => (
        <div dangerouslySetInnerHTML={{ __html: '<b>hi</b>' }} />
      ),
    });
    flushScheduler();

    const div = container.querySelector('div');
    expect(div?.innerHTML).toBe('<b>hi</b>');
    expect(div?.hasAttribute('dangerouslysetinnerhtml')).toBe(false);
    expect(div?.hasAttribute('dangerouslySetInnerHTML')).toBe(false);
  });

  it('should update innerHTML when __html changes on a later render', () => {
    let html: ReturnType<typeof state<string>> | null = null;

    createIsland({
      root: container,
      component: () => {
        html = state('<b>first</b>');
        return <div dangerouslySetInnerHTML={{ __html: html!() }} />;
      },
    });
    flushScheduler();

    expect(container.querySelector('div')?.innerHTML).toBe('<b>first</b>');

    html!.set('<i>second</i>');
    flushScheduler();

    expect(container.querySelector('div')?.innerHTML).toBe('<i>second</i>');
  });
});
