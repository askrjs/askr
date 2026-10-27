import { describe, it, expect, afterEach } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * Only objects produced by the JSX runtime (branded with `$$typeof`) render as
 * elements. Plain data that happens to carry a `type` field, such as JSON from
 * a loader or an API, has no visual representation and must not be able to
 * create elements or inject raw HTML.
 */
describe('unbranded objects as children', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  const payload = JSON.parse(
    '{"type":"div","props":{"dangerouslySetInnerHTML":{"__html":"<img id=\\"pwn\\" src=\\"x\\">"}}}'
  ) as unknown;
  const dataRecord = { type: 'text', value: 'hello' } as unknown;

  function Page() {
    return (
      <p>
        before
        {payload}
        {dataRecord}
        after
      </p>
    );
  }

  it('should not render a JSON object with a string type as an element on the client', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    createIsland({ root: mounted.container, component: Page });
    flushScheduler();
    expect(mounted.container.querySelector('#pwn')).toBeNull();
    expect(mounted.container.querySelector('div')).toBeNull();
    expect(mounted.container.querySelector('text')).toBeNull();
    expect(mounted.container.textContent).toBe('beforeafter');
  });

  it('should not serialize a JSON object with a string type in SSR', () => {
    const html = renderToStringSync(Page);
    expect(html).not.toContain('pwn');
    expect(html).not.toContain('<div');
    expect(html).not.toContain('<text');
    expect(html).toContain('before');
    expect(html).toContain('after');
  });
});
