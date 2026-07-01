/**
 * SSR Concurrency Isolation Tests
 *
 * Validates that concurrent SSR renders are isolated from each other
 * and do not share keys, renderData, or context state.
 */

import { describe, it, expect, vi } from 'vite-plus/test';
import { renderToString, renderToStringSync } from '../../../src/ssr';
import { createQuery } from '../../../src/data';
import { resource } from '../../../src/resources';
import { getNextKey, getCurrentRenderData } from '../../../src/ssr/render-keys';
import { getRenderContext } from '../../../src/ssr/context';
import {
  createRouteRegistry,
  currentRoute,
  route,
} from '../../../src/router/route';

describe('SSR concurrency isolation', () => {
  it('should isolate render context between concurrent renders', async () => {
    // Track keys generated during each render
    const keysA: string[] = [];
    const keysB: string[] = [];

    const ComponentA = () => {
      // Generate keys during render
      for (let i = 0; i < 5; i++) {
        keysA.push(getNextKey());
      }
      return <div id="a">Component A</div>;
    };

    const ComponentB = () => {
      // Generate keys during render
      for (let i = 0; i < 5; i++) {
        keysB.push(getNextKey());
      }
      return <div id="b">Component B</div>;
    };

    // Run renders concurrently via Promise.all
    // In Node.js with AsyncLocalStorage, each should have isolated context
    const [htmlA, htmlB] = await Promise.all([
      Promise.resolve().then(() => renderToStringSync(ComponentA)),
      Promise.resolve().then(() => renderToStringSync(ComponentB)),
    ]);

    // Verify HTML output is correct
    expect(htmlA).toContain('id="a"');
    expect(htmlA).toContain('Component A');
    expect(htmlB).toContain('id="b"');
    expect(htmlB).toContain('Component B');

    // Key sequences should be identical (both start from r:0)
    // This proves isolation - if they shared state, keys would interleave
    expect(keysA).toEqual(['r:0', 'r:1', 'r:2', 'r:3', 'r:4']);
    expect(keysB).toEqual(['r:0', 'r:1', 'r:2', 'r:3', 'r:4']);
  });

  it('should isolate renderData between concurrent renders', async () => {
    const dataSeenA: unknown[] = [];
    const dataSeenB: unknown[] = [];

    const ComponentA = () => {
      dataSeenA.push(getCurrentRenderData());
      return <div>A</div>;
    };

    const ComponentB = () => {
      dataSeenB.push(getCurrentRenderData());
      return <div>B</div>;
    };

    await Promise.all([
      Promise.resolve().then(() =>
        renderToStringSync(ComponentA, {}, { data: { source: 'A' } })
      ),
      Promise.resolve().then(() =>
        renderToStringSync(ComponentB, {}, { data: { source: 'B' } })
      ),
    ]);

    // Each component should see its own data
    expect(dataSeenA[0]).toEqual({ source: 'A' });
    expect(dataSeenB[0]).toEqual({ source: 'B' });
  });

  it('should isolate query caches between concurrent renders', async () => {
    const caches: Array<Map<string, unknown> | null> = [];
    const cacheSizesDuringRender: number[] = [];

    const ComponentA = () => {
      createQuery({
        key: 'users:ssr',
        fetch: async () => 'A',
      });
      caches.push(getRenderContext()?.queryCache ?? null);
      cacheSizesDuringRender.push(getRenderContext()?.queryCache?.size ?? 0);
      return <div>A</div>;
    };

    const ComponentB = () => {
      createQuery({
        key: 'users:ssr',
        fetch: async () => 'B',
      });
      caches.push(getRenderContext()?.queryCache ?? null);
      cacheSizesDuringRender.push(getRenderContext()?.queryCache?.size ?? 0);
      return <div>B</div>;
    };

    await Promise.all([
      Promise.resolve().then(() => renderToStringSync(ComponentA)),
      Promise.resolve().then(() => renderToStringSync(ComponentB)),
    ]);

    expect(caches[0]).not.toBeNull();
    expect(caches[1]).not.toBeNull();
    expect(caches[0]).not.toBe(caches[1]);
    expect(cacheSizesDuringRender).toEqual([1, 1]);
    expect(caches[0]?.size).toBe(0);
    expect(caches[1]?.size).toBe(0);
  });

  it('should produce deterministic output across multiple renders', () => {
    let keySeq: string[] = [];

    const Component = () => {
      keySeq = [];
      for (let i = 0; i < 3; i++) {
        keySeq.push(getNextKey());
      }
      return <div>{keySeq.join(',')}</div>;
    };

    const html1 = renderToStringSync(Component);
    const keys1 = [...keySeq];

    const html2 = renderToStringSync(Component);
    const keys2 = [...keySeq];

    const html3 = renderToStringSync(Component);
    const keys3 = [...keySeq];

    // All renders should produce identical output
    expect(html1).toBe(html2);
    expect(html2).toBe(html3);

    // Key sequences should be identical (reset each render)
    expect(keys1).toEqual(['r:0', 'r:1', 'r:2']);
    expect(keys2).toEqual(['r:0', 'r:1', 'r:2']);
    expect(keys3).toEqual(['r:0', 'r:1', 'r:2']);
  });

  it('should not have context outside of render', () => {
    // Outside any render, context should be null
    expect(getRenderContext()).toBeNull();
  });

  it('should have context during render', () => {
    let contextDuringRender: unknown = 'not-set';

    const Component = () => {
      contextDuringRender = getRenderContext();
      return <div>test</div>;
    };

    renderToStringSync(Component);

    expect(contextDuringRender).not.toBeNull();
    expect(contextDuringRender).toHaveProperty('seed');
    expect(contextDuringRender).toHaveProperty('keyCounter');
  });

  it('should handle deeply nested concurrent renders', async () => {
    const results: { id: number; keys: string[] }[] = [];

    const makeComponent = (id: number) => () => {
      const keys: string[] = [];
      for (let i = 0; i < 3; i++) {
        keys.push(getNextKey());
      }
      results.push({ id, keys });
      return <div data-id={id}>{keys.join(',')}</div>;
    };

    // Run 10 concurrent renders
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        Promise.resolve().then(() => renderToStringSync(makeComponent(i)))
      )
    );

    // All should have the same key sequence (isolation)
    for (const result of results) {
      expect(result.keys).toEqual(['r:0', 'r:1', 'r:2']);
    }
  });

  it('should isolate URL-based route snapshots between concurrent renders', async () => {
    const [htmlA, htmlB] = await Promise.all([
      Promise.resolve().then(() =>
        renderToString({
          url: '/users/1?q=alpha#one',
          routes: [
            {
              path: '/users/{id}',
              handler: () => {
                const snapshot = currentRoute();
                return (
                  <div>
                    A:{snapshot.params.id}:{snapshot.query.get('q')}:
                    {snapshot.hash}
                  </div>
                );
              },
            },
          ],
        })
      ),
      Promise.resolve().then(() =>
        renderToString({
          url: '/posts/2?q=beta#two',
          routes: [
            {
              path: '/posts/{id}',
              handler: () => {
                const snapshot = currentRoute();
                return (
                  <div>
                    B:{snapshot.params.id}:{snapshot.query.get('q')}:
                    {snapshot.hash}
                  </div>
                );
              },
            },
          ],
        })
      ),
    ]);

    expect(htmlA).toContain('A:1:alpha:#one');
    expect(htmlB).toContain('B:2:beta:#two');
  });

  it('should isolate URL-based registry route resource data between concurrent renders', async () => {
    const nameLoader = vi.fn((_opts: { signal: AbortSignal }) => 'loader-name');
    const roleLoader = vi.fn((_opts: { signal: AbortSignal }) => 'loader-role');
    const registry = createRouteRegistry(() => {
      route('/profiles/{id}', ({ id }) => {
        const snapshot = currentRoute();
        const name = resource<string>(nameLoader, [id]);
        const role = resource<string>(roleLoader, [id]);

        return (
          <div>
            {snapshot.params.id}:{name.value}:{role.value}
          </div>
        );
      });
    });

    const [htmlA, htmlB] = await Promise.all([
      Promise.resolve().then(() =>
        renderToString({
          url: '/profiles/a',
          registry,
          data: { 'r:0': 'Ada', 'r:1': 'admin' },
        })
      ),
      Promise.resolve().then(() =>
        renderToString({
          url: '/profiles/b',
          registry,
          data: { 'r:0': 'Lin', 'r:1': 'guest' },
        })
      ),
    ]);

    expect(htmlA).toContain('a:Ada:admin');
    expect(htmlA).toContain('{"r:0":"Ada","r:1":"admin"}');
    expect(htmlB).toContain('b:Lin:guest');
    expect(htmlB).toContain('{"r:0":"Lin","r:1":"guest"}');
    expect(nameLoader).not.toHaveBeenCalled();
    expect(roleLoader).not.toHaveBeenCalled();
  });

  it('should isolate route tables between concurrent URL renders', async () => {
    const [htmlA, htmlB] = await Promise.all([
      Promise.resolve().then(() =>
        renderToString({
          url: '/account/7',
          routes: [
            {
              path: '/account/{id}',
              handler: () => {
                const snapshot = currentRoute();
                return (
                  <div>
                    account:{snapshot.matches[0]?.path}:{snapshot.params.id}
                  </div>
                );
              },
            },
          ],
        })
      ),
      Promise.resolve().then(() =>
        renderToString({
          url: '/settings/profile',
          routes: [
            {
              path: '/settings/profile',
              handler: () => {
                const snapshot = currentRoute();
                return (
                  <div>
                    settings:{snapshot.matches[0]?.path}:{snapshot.path}
                  </div>
                );
              },
            },
          ],
        })
      ),
    ]);

    expect(htmlA).toContain('account:/account/{id}:7');
    expect(htmlB).toContain('settings:/settings/profile:/settings/profile');
  });
});

describe('SSR escaping correctness', () => {
  it('should escape text content correctly', () => {
    const Component = () => <div>{'<script>alert("xss")</script>'}</div>;
    const html = renderToStringSync(Component);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('should preserve allowlisted css functions in style objects', () => {
    const Component = () => (
      <div
        style={{
          color: 'var(--ak-foreground, rgb(255, 0, 0))',
          transform: 'translateX(10px)',
        }}
      />
    );

    const html = renderToStringSync(Component);

    expect(html).toContain('style="');
    expect(html).toContain('color:var(--ak-foreground, rgb(255, 0, 0));');
    expect(html).toContain('transform:translateX(10px);');
  });

  it('should drop unsafe css functions and uri schemes from style objects', () => {
    const Component = () => (
      <div
        style={{
          color: 'var(--ak-foreground, #fff)',
          transform: 'scale(1.1)',
          backgroundImage: 'url(javascript:alert(1))',
          maskImage: 'javascript:alert(1)',
        }}
      />
    );

    const html = renderToStringSync(Component);

    expect(html).toContain('style="');
    expect(html).toContain('color:var(--ak-foreground, #fff);');
    expect(html).toContain('transform:scale(1.1);');
    expect(html).not.toContain('background-image');
    expect(html).not.toContain('mask-image');
    expect(html).not.toContain('javascript:alert');
  });

  it('should escape attribute values correctly', () => {
    const Component = () => <div title={'"><script>alert("xss")</script>'} />;
    const html = renderToStringSync(Component);
    expect(html).toContain('&quot;');
    expect(html).not.toContain('"><script>');
  });

  it('should handle ampersands in text', () => {
    const Component = () => <div>Tom & Jerry</div>;
    const html = renderToStringSync(Component);
    expect(html).toContain('Tom &amp; Jerry');
  });

  it('should handle ampersands in attributes', () => {
    const Component = () => <a href="/search?a=1&b=2">link</a>;
    const html = renderToStringSync(Component);
    expect(html).toContain('href="/search?a=1&amp;b=2"');
  });

  it('should handle single quotes in attributes', () => {
    const Component = () => <div title="it's a test" />;
    const html = renderToStringSync(Component);
    expect(html).toContain('&#x27;');
  });
});
