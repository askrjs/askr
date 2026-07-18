import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const consumerRoot = mkdtempSync(join(tmpdir(), 'askr-consumer-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  const packResult = JSON.parse(
    execFileSync(
      npm,
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
  const tarball = join(consumerRoot, packResult[0].filename);
  writeFileSync(
    join(consumerRoot, 'package.json'),
    JSON.stringify({ name: 'askr-consumer', private: true, type: 'module' })
  );
  execFileSync(
    npm,
    [
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      tarball,
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
    'node_modules/typescript/lib/tsc.js'
  );
  execFileSync(
    process.execPath,
    [typescriptCli, '-p', join(consumerRoot, 'tsconfig.json')],
    {
      cwd: consumerRoot,
      stdio: 'pipe',
    }
  );
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}
