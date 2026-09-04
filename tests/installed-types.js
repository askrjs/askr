import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const consumerRoot = mkdtempSync(join(tmpdir(), 'askr-consumer-'));
const npmCli = process.env.npm_execpath;
if (!npmCli)
  throw new Error('Run this fixture through npm run test:installed.');

function runNpm(args, options) {
  // Invoke npm's JS entrypoint with Node on every OS; .cmd requires a shell
  // on Windows and would turn consumer paths into shell input.
  return execFileSync(process.execPath, [npmCli, ...args], options);
}

function packCandidate() {
  const packResult = JSON.parse(
    runNpm(
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        consumerRoot,
      ],
      { cwd: repositoryRoot, encoding: 'utf8' }
    )
  );
  const packEntries = Array.isArray(packResult)
    ? packResult
    : packResult && typeof packResult === 'object'
      ? Object.values(packResult)
      : [];
  const filename = packEntries[0]?.filename;
  if (typeof filename !== 'string') {
    throw new Error('npm pack did not report a tarball filename');
  }
  return join(consumerRoot, filename);
}

try {
  const tarball = process.argv[2] ? resolve(process.argv[2]) : packCandidate();
  writeFileSync(
    join(consumerRoot, 'package.json'),
    JSON.stringify({
      name: 'askr-consumer',
      private: true,
      type: 'module',
      tsd: {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          jsx: 'react-jsx',
          jsxImportSource: '@askrjs/askr',
        },
      },
    })
  );
  runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      tarball,
      'vitest@4.1.10',
      'jsdom@29.1.1',
      'tsd@0.33.0',
    ],
    { cwd: consumerRoot, stdio: 'pipe' }
  );
  cpSync(join(repositoryRoot, 'tests/types'), join(consumerRoot, 'types'), {
    recursive: true,
  });
  cpSync(
    join(repositoryRoot, 'tests/consumer-contracts'),
    join(consumerRoot, 'contracts'),
    {
      recursive: true,
    }
  );
  runNpm(
    [
      'exec',
      '--',
      'tsd',
      '--typings',
      'node_modules/@askrjs/askr/dist/index.d.ts',
      '--files',
      'types/**/*.test-d.ts',
      '--files',
      'types/**/*.test-d.tsx',
    ],
    { cwd: consumerRoot, stdio: 'pipe' }
  );
  writeFileSync(
    join(consumerRoot, 'index.tsx'),
    [
      'import { Fragment, state } from "@askrjs/askr";',
      'import { jsx, jsxs } from "@askrjs/askr/jsx-runtime";',
      'const [count] = state(1);',
      'const view = <><span>{count()}</span></>;',
      'void [Fragment, jsx, jsxs, view];',
    ].join('\n')
  );
  writeFileSync(
    join(consumerRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        jsxImportSource: '@askrjs/askr',
        strict: true,
        noEmit: true,
      },
      include: ['index.tsx'],
    })
  );
  const typescriptCli = resolve(
    repositoryRoot,
    'node_modules/@typescript/native/bin/tsc'
  );
  execFileSync(
    process.execPath,
    [typescriptCli, '-p', join(consumerRoot, 'tsconfig.json')],
    {
      cwd: consumerRoot,
      stdio: 'pipe',
    }
  );
  writeFileSync(
    join(consumerRoot, 'vitest.config.ts'),
    [
      'import { defineConfig } from "vitest/config";',
      'export default defineConfig({',
      '  oxc: { jsx: { runtime: "automatic", importSource: "@askrjs/askr" } },',
      '  test: { environment: "jsdom" },',
      '});',
    ].join('\n')
  );
  writeFileSync(
    join(consumerRoot, 'harness.test.tsx'),
    [
      'import { expect, test } from "vitest";',
      'import { state } from "@askrjs/askr";',
      'import { dispatch, render } from "@askrjs/askr/testing";',
      'test("should render a packed consumer component", () => {',
      '  const view = render(() => {',
      '    const count = state(0);',
      '    return <button onClick={() => count.set(count() + 1)}>{count()}</button>;',
      '  });',
      '  const button = view.root.querySelector("button")!;',
      '  dispatch(button, "click");',
      '  view.flush();',
      '  expect(button.textContent).toBe("1");',
      '  view.cleanup();',
      '  expect(document.body.contains(view.root)).toBe(false);',
      '});',
    ].join('\n')
  );
  runNpm(['exec', '--', 'vitest', 'run', '-c', 'vitest.config.ts'], {
    cwd: consumerRoot,
    stdio: 'inherit',
  });
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}
