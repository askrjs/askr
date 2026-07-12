import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const runtimeEntry = path.join(rootDir, 'dist', 'index.js');
const bootEntry = path.join(rootDir, 'dist', 'boot', 'index.js');
const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'askr-production-bundle-')
);

const forbiddenProbeMarkers = [
  'ASKR_BENCH',
  '__ASKR_FOR_BENCH__',
  '__ASKR_PERF__',
  'domInsert',
  'domRemove',
  'itemCreated',
  'itemRemoved',
  'keyLookup',
  'rowFactory',
  'rowFactoryInvocations',
  'reconcilePhaseMs',
  'selectorInvalidations',
  'schedulerTaskExecutions',
  'coldCreate',
  'fullClear',
];

try {
  assert.ok(
    fs.existsSync(runtimeEntry) && fs.existsSync(bootEntry),
    'production bundle check requires fresh dist artifacts; run npm run build first'
  );

  const entryPath = path.join(tempDir, 'entry.js');
  fs.writeFileSync(
    entryPath,
    `import { For, jsx, selector, state } from '@askrjs/askr';
import { createIsland } from '@askrjs/askr/boot';

const rows = state([{ id: 1, label: 'one' }]);
const selected = state(null);
const isSelected = selector(selected);

const App = () => jsx('main', {
  children: jsx(For, {
    each: () => rows(),
    by: (row) => row.id,
    children: (row) => jsx('button', {
      class: () => (isSelected(row.id) ? 'selected' : ''),
      onClick: () => selected.set(row.id),
      children: () => row.label,
    }),
  }),
});

createIsland({ root: 'main', component: App });
rows.set([{ id: 2, label: 'two' }]);
`
  );

  const result = await build({
    configFile: false,
    root: tempDir,
    logLevel: 'silent',
    resolve: {
      alias: [
        { find: '@askrjs/askr/boot', replacement: bootEntry },
        { find: '@askrjs/askr', replacement: runtimeEntry },
      ],
    },
    build: {
      minify: true,
      target: 'es2020',
      write: false,
      rollupOptions: {
        input: entryPath,
      },
    },
  });

  const outputs = Array.isArray(result) ? result : [result];
  const bundledSource = outputs
    .flatMap((output) => output.output)
    .filter((output) => output.type === 'chunk')
    .map((output) => output.code)
    .join('\n');

  assert.ok(bundledSource.length > 0, 'Vite must emit a JavaScript bundle');
  for (const marker of forbiddenProbeMarkers) {
    const markerIndex = bundledSource.indexOf(marker);
    if (markerIndex >= 0 && process.env.DEBUG_PRODUCTION_BUNDLE === '1') {
      console.error(
        bundledSource.slice(
          Math.max(0, markerIndex - 240),
          markerIndex + marker.length + 240
        )
      );
    }
    assert.equal(
      markerIndex >= 0,
      false,
      `ordinary production bundle retained diagnostic probe marker ${marker}`
    );
  }

  console.log(
    `[production-bundle] hot-path counter probes absent from ${bundledSource.length} byte consumer bundle`
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
