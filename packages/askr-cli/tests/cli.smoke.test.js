import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runCli } from '../src/bin/cli.js';
import { runCreateCli } from '../src/bin/create.js';
import { runSsgCli } from '../src/bin/ssg.js';

function createIo() {
  const logs = [];
  const errors = [];

  return {
    io: {
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
    },
    logs,
    errors,
  };
}

test('runCli prints top-level help', async () => {
  const { io, logs, errors } = createIo();
  const code = await runCli(['--help'], io);

  assert.equal(code, 0);
  assert.equal(errors.length, 0);
  assert.match(logs.join('\n'), /askr-cli - Unified CLI/);
  assert.match(logs.join('\n'), /Commands:/);
});

test('runCreateCli defaults to startkit when template is omitted', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'askr-cli-'));
  const previousCwd = process.cwd();

  try {
    process.chdir(tempRoot);
    const { io, errors } = createIo();
    const code = await runCreateCli(['sample-app', '--no-install'], io);

    assert.equal(code, 0);
    assert.equal(errors.length, 0);

    const appRoot = path.join(tempRoot, 'sample-app');
    const packageJson = await fs.readFile(
      path.join(appRoot, 'package.json'),
      'utf8'
    );
    const landingFile = await fs.readFile(
      path.join(appRoot, 'src', 'pages', 'home.tsx'),
      'utf8'
    );
    const routesFile = await fs.readFile(
      path.join(appRoot, 'src', 'routes', 'index.ts'),
      'utf8'
    );
    const routerFile = await fs.readFile(
      path.join(appRoot, 'src', 'router.tsx'),
      'utf8'
    );

    assert.match(packageJson, /"name": "sample-app"/);
    assert.match(packageJson, /"@askrjs\/askr-lucide"/);
    assert.match(landingFile, /Production-ready starter/);
    assert.match(routesFile, /auth:\s*'guest'/);
    assert.match(routesFile, /auth:\s*true/);
    assert.match(routesFile, /group\(\{\s*layout:\s*App\s*\}/);
    assert.match(routesFile, /fallback\(/);
    assert.match(routerFile, /registerRoutes/);
    assert.match(routerFile, /auth:\s*routeAuth/);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runSsgCli prints help without requiring config', async () => {
  const { io, logs, errors } = createIo();
  const code = await runSsgCli(['--help'], undefined, io);

  assert.equal(code, 0);
  assert.equal(errors.length, 0);
  assert.match(logs.join('\n'), /askr-ssg - Static Site Generation for Askr/);
});
