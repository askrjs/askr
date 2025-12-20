#!/usr/bin/env node
import { JSDOM } from 'jsdom';
import jiti from 'jiti';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = jiti(import.meta.url);

async function run() {
  const dom = new JSDOM(`<!doctype html><html><body></body></html>`, {
    pretendToBeVisual: true,
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.MutationObserver = dom.window.MutationObserver;

  const { createApp, state } = require('../src/index');
  const { globalScheduler } = require('../src/runtime/scheduler');

  const container = document.createElement('div');
  document.body.appendChild(container);

  let items = null;
  const Component = () => {
    items = state(Array.from({ length: 200 }, (_, i) => i));
    return {
      type: 'ul',
      props: {
        children: items().map((item) => ({
          type: 'li',
          props: { children: `Item ${item}` },
          key: item,
        })),
      },
    };
  };

  createApp({ root: container, component: Component });
  // initial mount
  globalScheduler.flush();

  const start = Date.now();
  const ITER = 4000;
  for (let i = 0; i < ITER; i++) {
    // make a small change and commit immediately to stress DOM and scheduler
    items.set(items().map((x) => x + 1));
    globalScheduler.flush();
  }
  const ms = Date.now() - start;

  // record mutation totals using MutationObserver
  const obs = new MutationObserver(() => {});
  obs.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  // small snapshot
  const text = container.textContent || '';
  obs.disconnect();

  fs.writeFileSync(
    'bench-profiles/profile_text_bulk_stress.json',
    JSON.stringify({ iterations: ITER, ms, textLength: text.length }, null, 2)
  );
  console.log('WROTE bench-profiles/profile_text_bulk_stress.json', {
    iterations: ITER,
    ms,
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
