import { describe, it, expect, afterEach, vi } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('attribute and event aliases', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('should render download={true} as a bare attribute', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    createIsland({
      root: mounted.container,
      component: () => (
        <a href="/report.csv" download={true}>
          report
        </a>
      ),
    });
    flushScheduler();
    expect(mounted.container.querySelector('a')!.getAttribute('download')).toBe(
      ''
    );
    const html = renderToStringSync(() => (
      <a href="/report.csv" download={true}>
        report
      </a>
    ));
    expect(html).toContain(' download>');
    expect(html).not.toContain('download="true"');
  });

  it('should fire onDoubleClick for dblclick events', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    const onDoubleClick = vi.fn();
    createIsland({
      root: mounted.container,
      component: () => <button onDoubleClick={onDoubleClick}>go</button>,
    });
    flushScheduler();
    mounted.container
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });
});
