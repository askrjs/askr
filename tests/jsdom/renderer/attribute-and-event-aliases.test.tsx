import { describe, it, expect, afterEach, vi } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// `download` and `onDoubleClick` are not in the typed element props; the
// renderer still handles them for untyped and spread props.
function untypedProps(props: Record<string, unknown>): Record<string, never> {
  return props as Record<string, never>;
}

describe('attribute and event aliases', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('should render download={true} as a bare attribute', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    createIsland({
      root: mounted.container,
      component: () => (
        <a href="/report.csv" {...untypedProps({ download: true })}>
          report
        </a>
      ),
    });
    flushScheduler();
    expect(mounted.container.querySelector('a')!.getAttribute('download')).toBe(
      ''
    );
    const html = renderToStringSync(() => (
      <a href="/report.csv" {...untypedProps({ download: true })}>
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
      component: () => <button {...untypedProps({ onDoubleClick })}>go</button>,
    });
    flushScheduler();
    mounted.container
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });
});
