import { performance } from 'node:perf_hooks';
import { renderToStringSync } from '../dist/ssr/index.js';

// Match benchmark conditions and avoid dev-only logging in prof runs.
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

const HUGE_10K = Number(process.env.HUGE_10K ?? 10000);
const WARMUP = Number(process.env.WARMUP ?? 3);
const ITERS = Number(process.env.ITERS ?? 20);

function Huge() {
  return {
    type: 'div',
    children: Array.from({ length: HUGE_10K }, (_, i) => ({
      type: 'section',
      props: { key: String(i) },
      children: [
        { type: 'h2', children: [String(i)] },
        { type: 'p', children: ['Lorem ipsum dolor sit amet.'] },
      ],
    })),
  };
}

function renderOnce() {
  // Keep it identical to benches: render the component function, not a pre-built VNode.
  return renderToStringSync(Huge);
}

// Warm up JIT
for (let i = 0; i < WARMUP; i++) renderOnce();

const start = performance.now();
let lastLen = 0;
for (let i = 0; i < ITERS; i++) {
  const html = renderOnce();
  lastLen = html.length;
}
const end = performance.now();

const totalMs = end - start;
const meanMs = totalMs / ITERS;

console.log(
  JSON.stringify({ HUGE_10K, WARMUP, ITERS, totalMs, meanMs, lastLen })
);
