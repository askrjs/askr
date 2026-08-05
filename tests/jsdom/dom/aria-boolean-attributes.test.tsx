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
});
