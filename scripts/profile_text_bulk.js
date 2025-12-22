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

  // Wire globals
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.MutationObserver = dom.window.MutationObserver;

  // Import the library via jiti so TS is handled
  const { createIsland, state } = require('../src/index');

  function trackDOMMutations(node, callback) {
    let addedNodes = 0;
    let removedNodes = 0;
    let changedAttributes = 0;
    let changedText = 0;

    const processRecords = (mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          addedNodes += mutation.addedNodes.length;
          removedNodes += mutation.removedNodes.length;
        } else if (mutation.type === 'attributes') {
          changedAttributes++;
        } else if (mutation.type === 'characterData') {
          changedText++;
        }
      }
    };

    const observer = new MutationObserver((mutations) =>
      processRecords(mutations)
    );
    observer.observe(node, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeOldValue: false,
      characterDataOldValue: false,
    });

    callback();

    const pending = observer.takeRecords();
    processRecords(pending);
    observer.disconnect();

    return { addedNodes, removedNodes, changedAttributes, changedText };
  }

  // Build a component similar to the bench
  const container = document.createElement('div');
  document.body.appendChild(container);

  // Use a real component to exercise the framework path
  let items = null;
  const { jsx } = require('../src/jsx/jsx-runtime');
  const { globalScheduler } = require('../src/runtime/scheduler');

  const Component = () => {
    items = state([1, 2, 3, 4, 5]);
    return jsx('ul', {
      children: items().map((item) => ({
        type: 'li',
        props: { children: `Item ${item}` },
        key: item,
      })),
    });
  };

  // Mount with the real renderer
  createIsland({ root: container, component: Component });
  // Ensure initial render
  globalScheduler.flush();

  // Now instrument the bulk updates via framework state.set
  const mutations = trackDOMMutations(container, () => {
    for (let i = 0; i < 100; i++) {
      items.set(items().map((x) => x + 1));
      globalScheduler.flush();
    }
  });

  fs.writeFileSync(
    'bench-profiles/profile_text_bulk_mutations.json',
    JSON.stringify(mutations, null, 2)
  );
  console.log('WROTE bench-profiles/profile_text_bulk_mutations.json');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
