import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vite-plus/test';

// @askr-allow-real-timers: isolated Node processes must reach native unhandled-rejection checkpoints.
describe('SSR resource failure containment', () => {
  it.each(['immediate', 'delayed', 'abort', 'thenable', 'throwing-then'])(
    'should contain a %s loader rejection after rejecting synchronous SSR',
    (mode) => {
      const result = spawnSync(
        process.execPath,
        [
          '--unhandled-rejections=strict',
          '--input-type=module',
          '-e',
          `
          import assert from 'node:assert/strict';
          import { renderToStringSync, SSRDataMissingError } from './dist/ssr/index.js';
          import { resource } from './dist/resources/index.js';
          const mode = ${JSON.stringify(mode)};
          let signal;
          let loaderReached;
          const loaderDidRun = new Promise(resolve => { loaderReached = resolve; });
          assert.throws(() => renderToStringSync(() => {
            resource(({ signal: current }) => {
              signal = current;
              if (mode === 'thenable') return { then(_, reject) { loaderReached(); reject(new Error('thenable failed')); } };
              if (mode === 'throwing-then') {
                let reads = 0;
                return { get then() { loaderReached(); if (++reads > 1) throw new Error('then access'); return () => {}; } };
              }
              if (mode === 'immediate') { loaderReached(); return Promise.reject(new Error('loader failed')); }
              if (mode === 'delayed') return new Promise((_, reject) => setImmediate(() => { loaderReached(); reject(new Error('loader failed')); }));
              return new Promise((_, reject) => current.addEventListener('abort', () => { loaderReached(); reject(new Error('cancelled')); }, { once: true }));
            }, []);
            return null;
          }), SSRDataMissingError);
          await loaderDidRun;
          await new Promise(resolve => setImmediate(resolve));
          assert.equal(signal.aborted, true);
          assert.equal(renderToStringSync(() => 'healthy'), 'healthy');
        `,
        ],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 10_000 }
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    }
  );
});
