import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import jiti from 'jiti';
import inspector from 'node:inspector';
import { writeFileSync } from 'node:fs';

// Match benchmark conditions.
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

const require = jiti(import.meta.url);

function post(session, method, params) {
  return new Promise((resolve, reject) => {
    session.post(method, params ?? {}, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

function installDomGlobals(dom) {
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.MutationObserver = dom.window.MutationObserver;
  global.CustomEvent = dom.window.CustomEvent;
}

async function run() {
  const dom = new JSDOM(`<!doctype html><html><body></body></html>`, {
    pretendToBeVisual: true,
  });
  installDomGlobals(dom);

  const { createIsland, state } = require('../src/index');
  const { globalScheduler } = require('../src/runtime/scheduler');

  const container = document.createElement('div');
  document.body.appendChild(container);

  let updateFn = null;
  const App = () => {
    const count = state(0);
    updateFn = () => count.set(count() + 1);
    return { type: 'div', children: [String(count())] };
  };

  createIsland({ root: container, component: App });
  globalScheduler.flush();

  const UPDATES = Number(process.env.UPDATES ?? 100);
  const ITERS = Number(process.env.ITERS ?? 50);
  const WARMUP = Number(process.env.WARMUP ?? 5);

  for (let w = 0; w < WARMUP; w++) {
    for (let i = 0; i < UPDATES; i++) {
      updateFn();
      globalScheduler.flush();
    }
  }

  const wantProfile =
    process.env.CPU_PROFILE === '1' || process.env.CPU_PROFILE === 'true';
  const session = wantProfile ? new inspector.Session() : null;
  if (session) {
    session.connect();
  }

  if (session) {
    await post(session, 'Profiler.enable');
    await post(session, 'Profiler.start');
  }

  const start = performance.now();
  for (let r = 0; r < ITERS; r++) {
    for (let i = 0; i < UPDATES; i++) {
      updateFn();
      globalScheduler.flush();
    }
  }
  const end = performance.now();

  let profile = null;
  if (session) {
    const res = await post(session, 'Profiler.stop');
    profile = res.profile;
    await post(session, 'Profiler.disable');
    session.disconnect();
  }

  const totalMs = end - start;
  const ops = ITERS;
  const meanMsPerOp = totalMs / ops;

  console.log(
    JSON.stringify({ UPDATES, ITERS, WARMUP, totalMs, meanMsPerOp }, null, 0)
  );

  if (profile) {
    const out = process.env.CPU_PROFILE_OUT ?? 'tmp-scheduler-loop.cpuprofile';
    writeFileSync(out, JSON.stringify(profile));
    console.log(`WROTE ${out}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
