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
          let signal;
          assert.throws(() => renderToStringSync(() => {
            resource(({ signal: current }) => {
              signal = current;
              if (${JSON.stringify(mode)} === 'thenable') return { then(_, reject) { reject(new Error('thenable failed')); } };
              if (${JSON.stringify(mode)} === 'throwing-then') {
                let reads = 0;
                return { get then() { if (++reads > 1) throw new Error('then access'); return () => {}; } };
              }
              if (${JSON.stringify(mode)} === 'immediate') return Promise.reject(new Error('loader failed'));
              if (${JSON.stringify(mode)} === 'delayed') return new Promise((_, reject) => setTimeout(() => reject(new Error('loader failed')), 5));
              return new Promise((_, reject) => current.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
            }, []);
            return null;
          }), SSRDataMissingError);
          await new Promise(resolve => setTimeout(resolve, 30));
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
