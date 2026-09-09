import { describe, expect, it } from 'vite-plus/test';
import { renderToString } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('ARIA boolean attributes', () => {
  it('should preserve false in client-rendered DOM attributes', () => {
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => <button aria-expanded={false} aria-pressed={true} />,
      });
      flushScheduler();
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-expanded')).toBe('false');
      expect(button?.getAttribute('aria-pressed')).toBe('true');
    } finally {
      cleanup();
    }
  });

  it('should preserve false in SSR output', () => {
    expect(renderToString(() => <button aria-expanded={false} />)).toContain(
      'aria-expanded="false"'
    );
  });

  it('should render true as a string in SSR output, matching the DOM', () => {
    // ARIA state attributes are string enums, so `true` must survive as
    // "true" rather than collapsing to a bare HTML boolean attribute.
    expect(renderToString(() => <button aria-pressed={true} />)).toContain(
      'aria-pressed="true"'
    );
  });

  it('should render HTML boolean attributes bare in SSR output', () => {
    expect(renderToString(() => <input disabled={true} />)).toContain(
      '<input disabled'
    );
    expect(renderToString(() => <input disabled={true} />)).not.toContain(
      'disabled="true"'
    );
  });

  it('should render data attributes as strings in SSR output', () => {
    expect(renderToString(() => <div data-ready={true} />)).toContain(
      'data-ready="true"'
    );
  });

  it('should keep a false aria value when props are applied as bindings', () => {
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => <button aria-expanded={false}>x</button>,
      });
      flushScheduler();
      expect(
        container.querySelector('button')?.getAttribute('aria-expanded')
      ).toBe('false');
    } finally {
      cleanup();
    }
  });
});
