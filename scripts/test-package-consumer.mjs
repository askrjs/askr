import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
);
const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'askr-package-consumer-')
);

function run(command, args, cwd = rootDir) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

try {
  const packed = JSON.parse(
    run('npm', [
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      tempDir,
    ])
  );
  assert.equal(packed.length, 1, 'npm pack should produce one tarball');
  const tarball = path.join(tempDir, packed[0].filename);
  const packedFiles = packed[0].files.map((file) => file.path);

  assert.equal(
    packedFiles.some((file) => file.endsWith('.map')),
    false,
    'package tarball must not contain source maps'
  );
  for (const file of packedFiles.filter((file) => file.endsWith('.js'))) {
    const source = run('tar', ['-xOf', tarball, `package/${file}`]);
    assert.equal(
      /\/\/[#@]\s*sourceMappingURL=/.test(source),
      false,
      `package JavaScript artifact ${file} must not reference an unpacked source map`
    );
  }
  assert.ok(
    packedFiles.includes('dist/bin/askr-ssg.js'),
    'tarball must contain the SSG CLI'
  );

  for (const [specifier, target] of Object.entries(packageJson.exports)) {
    const jsTarget = typeof target === 'string' ? target : target.import;
    const typeTarget = typeof target === 'string' ? undefined : target.types;
    assert.ok(jsTarget, `${specifier} must have an ESM target`);
    assert.ok(typeTarget, `${specifier} must have a type target`);
    assert.ok(
      packedFiles.includes(jsTarget.slice(2)),
      `${specifier} JavaScript artifact must be packed`
    );
    assert.ok(
      packedFiles.includes(typeTarget.slice(2)),
      `${specifier} declaration artifact must be packed`
    );
  }

  const consumerDir = path.join(tempDir, 'consumer');
  fs.mkdirSync(consumerDir);
  fs.writeFileSync(
    path.join(consumerDir, 'package.json'),
    JSON.stringify({
      name: 'askr-clean-consumer',
      private: true,
      type: 'module',
    })
  );
  run(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball],
    consumerDir
  );

  const publicSpecifiers = Object.keys(packageJson.exports).map((specifier) =>
    specifier === '.'
      ? packageJson.name
      : `${packageJson.name}/${specifier.slice(2)}`
  );
  run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      publicSpecifiers
        .map((specifier) => `await import(${JSON.stringify(specifier)});`)
        .join('\n'),
    ],
    consumerDir
  );

  const installedPackage = path.join(
    consumerDir,
    'node_modules',
    ...packageJson.name.split('/')
  );
  const cliPath = path.join(consumerDir, 'node_modules', '.bin', 'askr-ssg');
  assert.ok(
    fs.existsSync(cliPath),
    'npm must create the installed askr-ssg bin symlink'
  );
  assert.match(
    run(cliPath, ['--help'], consumerDir),
    /askr-ssg - Static Site Generation for Askr/
  );
  const cliConfigPath = path.join(consumerDir, 'ssg.config.ts');
  const cliOutputDir = path.join(consumerDir, 'static-site');
  fs.writeFileSync(
    cliConfigPath,
    `export const routes = [{ path: '/', component: () => '<main>installed cli</main>' }];\n`
  );
  assert.match(
    run(
      cliPath,
      ['--config', cliConfigPath, '--output', cliOutputDir],
      consumerDir
    ),
    /Generated:\s+1\/1 routes/
  );
  assert.match(
    fs.readFileSync(path.join(cliOutputDir, 'index.html'), 'utf8'),
    /installed cli/
  );

  run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import assert from 'node:assert/strict';
       import { jsx } from ${JSON.stringify(packageJson.name)};
       import { renderToStringSync } from ${JSON.stringify(`${packageJson.name}/ssr`)};
       assert.equal(renderToStringSync(() => jsx('main', { children: 'consumer smoke' })), '<main>consumer smoke</main>');`,
    ],
    consumerDir
  );

  fs.writeFileSync(
    path.join(consumerDir, 'index.ts'),
    `import { state } from '${packageJson.name}';\nconst count = state(0);\ncount.set(1);\n`
  );
  fs.writeFileSync(
    path.join(consumerDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        strict: true,
      },
    })
  );
  run(
    process.execPath,
    [
      path.join(rootDir, 'node_modules/typescript/bin/tsc'),
      '-p',
      'tsconfig.json',
    ],
    consumerDir
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
