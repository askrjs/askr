import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const optionalPeers = ['@askrjs/auth', '@askrjs/schema'];
const peerRanges =
  JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))
    .peerDependencies ?? {};
// Windows runners expose TEMP through a DOS short path. Use the same canonical
// path for npm, TypeScript, and Vite's jsdom module resolver.
const consumerRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), 'askr-consumer-'))
);
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
  const install = (packages) =>
    runNpm(
      [
        'install',
        '--ignore-scripts',
        '--no-package-lock',
        '--no-audit',
        '--no-fund',
        ...packages,
      ],
      { cwd: consumerRoot, stdio: 'pipe' }
    );
  // Install Askr without its optional type-only peers first: an app that never
  // uses route auth or schema-backed search/actions must install, typecheck,
  // and run without @askrjs/auth or @askrjs/schema.
  install([
    tarball,
    'vitest@4.1.10',
    'jsdom@29.1.1',
    'tsd@0.33.0',
    '@types/node@^24',
  ]);
  for (const peer of optionalPeers) {
    if (existsSync(join(consumerRoot, 'node_modules', peer))) {
      throw new Error(
        `${peer} was installed with @askrjs/askr; it must be an optional peer.`
      );
    }
  }
  cpSync(
    join(repositoryRoot, 'tests/consumer-contracts'),
    join(consumerRoot, 'contracts'),
    {
      recursive: true,
    }
  );
  writeFileSync(
    join(consumerRoot, 'index.tsx'),
    [
      'import { Fragment, state } from "@askrjs/askr";',
      'import { jsx, jsxs } from "@askrjs/askr/jsx-runtime";',
      'import { createRouteRegistry, route } from "@askrjs/askr/router";',
      'import { renderToString } from "@askrjs/askr/ssr";',
      'import { createStaticGen } from "@askrjs/askr/ssg";',
      'import { defineAction } from "@askrjs/askr/actions";',
      'const [count] = state(1);',
      'const view = <><span>{count()}</span></>;',
      'route("/", () => view);',
      'void [Fragment, jsx, jsxs, view, createRouteRegistry, renderToString, createStaticGen, defineAction];',
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
        types: ['node'],
        strict: true,
        noEmit: true,
      },
      include: ['index.tsx', 'contracts/**/*.ts', 'contracts/**/*.tsx'],
    })
  );
  const typescriptCli = resolve(
    repositoryRoot,
    'node_modules/typescript/bin/tsc'
  );
  execFileSync(
    process.execPath,
    [typescriptCli, '-p', join(consumerRoot, 'tsconfig.json')],
    {
      cwd: consumerRoot,
      stdio: 'inherit',
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
      'import { route } from "@askrjs/askr/router";',
      'import { renderToString } from "@askrjs/askr/ssr";',
      'test("should load router and SSR entries without optional peers", () => {',
      '  expect([typeof route, typeof renderToString]).toEqual(["function", "function"]);',
      '});',
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
  // The declaration tests exercise route auth and schema-backed APIs, so they
  // run after the consumer opts into the optional peers.
  install(optionalPeers.map((peer) => `${peer}@${peerRanges[peer]}`));
  cpSync(join(repositoryRoot, 'tests/types'), join(consumerRoot, 'types'), {
    recursive: true,
  });
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
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}
