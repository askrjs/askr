import { expect as expectChai } from 'chai';
import { test, vi, expect } from 'vite-plus/test';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

const execP = promisify(exec);

test('should build dist and run benchmark bundle without dev warnings', async () => {
  // Build the production bundle (includes `benchmark` entry)
  await execP('npm run build:bench');

  // Spy on console.warn to ensure production bundle emits no dev warnings
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Import the built bundle
  const benchmarkBundleUrl = pathToFileURL(
    resolve(process.cwd(), 'dist/benchmark.js')
  );
  const built = await import(/* @vite-ignore */ benchmarkBundleUrl.href);
  const mount = built.mountBenchmark ?? built.default?.mountBenchmark;
  expectChai(typeof mount).to.equal('function');

  const { container, cleanup } = createTestContainer();

  // Mount the bundled benchmark app into our test container
  const app = mount(container);
  flushScheduler();

  // Basic sanity checks to make failures actionable
  expectChai(app, 'expected mount to return an app handle').to.not.equal(
    undefined
  );

  const appHandle = app as { setRows?: (data: unknown[]) => void };

  expectChai(
    typeof appHandle.setRows,
    'expected app.setRows to exist and be a function'
  ).to.equal('function');

  // Prefer using the framework-provided API to create rows (mirrors how JFB invokes frameworks).
  if (appHandle && typeof appHandle.setRows === 'function') {
    appHandle.setRows([
      { id: 1, label: 'Item 1' },
      { id: 2, label: 'Item 2' },
      { id: 3, label: 'Item 3' },
    ]);
    // Flush our test scheduler and allow the bundle's scheduler to run on the next tick
    flushScheduler();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  } else {
    // Fallback: Create rows via direct DOM mutation to simulate how a benchmark might render
    const fallbackTbody = container.querySelector('tbody')!;
    const fragment = document.createDocumentFragment();
    for (let i = 1; i <= 3; i++) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = String(i);
      const td2 = document.createElement('td');
      const a = document.createElement('a');
      a.textContent = `Item ${i}`;
      a.addEventListener('click', (e) => e.preventDefault());
      td2.appendChild(a);
      tr.appendChild(td1);
      tr.appendChild(td2);
      fragment.appendChild(tr);
    }
    fallbackTbody.appendChild(fragment);
  }

  // Click second row anchor and assert the selection class is applied by framework
  const tbody = container.querySelector('tbody')!;
  const rows = tbody.querySelectorAll('tr');
  // Sanity: assert rows were rendered by framework
  expectChai(
    rows.length,
    `expected 3 rows after setRows; DOM was: ${container.innerHTML}`
  ).to.equal(3);

  const link = rows[1].querySelector('a')!;
  link.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true })
  );
  // Flush our test scheduler and allow the bundle's scheduler to process the event handler
  flushScheduler();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  // Expect class applied
  expectChai(rows[1].className).to.equal('danger');

  // The framework's benchmark semantics expect selection to set a class.
  // We assert that no dev warnings were emitted during this flow in production.
  expect(warn).toHaveBeenCalledTimes(0);

  cleanup();
  warn.mockRestore();
}, 30000);
