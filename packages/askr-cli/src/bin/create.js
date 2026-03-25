#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const TEMPLATE_TYPES = new Set(['startkit', 'spa', 'ssr', 'ssg']);

function helpText() {
  return [
    'askr-create - Project scaffolding for Askr',
    '',
    'Usage:',
    '  askr-create [template] <name> [--no-install]',
    '  askr-cli create [template] <name> [--no-install]',
    '',
    'Templates:',
    '  startkit, spa, ssr, ssg',
    '',
    'Examples:',
    '  askr-create startkit my-app',
    '  askr-cli create startkit acme-dashboard',
  ].join('\n');
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolveAnswer) => {
    rl.question(question, (answer) => {
      rl.close();
      resolveAnswer(answer);
    });
  });
}

function detectPm() {
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('npm')) return 'npm';

  return 'npm';
}

async function copyDir(src, dest, replacements) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const outputName = entry.name.replace(
      /\{\{\s*appName\s*\}\}/g,
      replacements.appName
    );
    const destPath = path.join(dest, outputName);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, replacements);
      continue;
    }

    const buffer = await fs.readFile(srcPath);
    const content = buffer.toString('utf8');
    const replaced = content
      .replace(/\{\{\s*appName\s*\}\}/g, replacements.appName)
      .replace(/\{\{appName\}\}/g, replacements.appName);

    await fs.writeFile(destPath, replaced, 'utf8');
  }
}

function parseArgs(args) {
  const positional = [];
  let install = true;
  let help = false;

  for (const arg of args) {
    if (arg === '--no-install') {
      install = false;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else {
      positional.push(arg);
    }
  }

  return { positional, install, help };
}

export async function runCreateCli(args = process.argv.slice(2), io = console) {
  const parsed = parseArgs(args);

  if (parsed.help) {
    io.log(helpText());
    return 0;
  }

  let templateType = 'startkit';
  let name = '';

  if (parsed.positional.length > 0) {
    const first = parsed.positional[0];
    if (TEMPLATE_TYPES.has(first)) {
      templateType = first;
      name = parsed.positional[1] || '';
    } else {
      name = first;
    }
  }

  if (!name) {
    io.log('Available templates: startkit, spa, ssr, ssg');
    io.log('');

    const selectedTemplate =
      (
        await prompt('Template type (startkit/spa/ssr/ssg) [startkit]: ')
      ).trim() || 'startkit';
    if (!TEMPLATE_TYPES.has(selectedTemplate)) {
      io.error('Invalid template type');
      return 1;
    }

    templateType = selectedTemplate;
    name = (await prompt('App name: ')).trim();
  }

  if (!name) {
    io.error('App name is required');
    return 1;
  }

  const target = path.resolve(process.cwd(), name);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const templateDir = path.resolve(
    __dirname,
    '..',
    '..',
    'templates',
    templateType
  );

  try {
    await fs.access(templateDir);
  } catch {
    io.error(`Template '${templateType}' not found at ${templateDir}`);
    return 1;
  }

  try {
    const stat = await fs.stat(target).catch(() => null);
    if (stat) {
      const files = await fs.readdir(target).catch(() => []);
      if (files.length > 0) {
        io.error(`Directory ${target} already exists and is not empty.`);
        return 1;
      }
    }
  } catch (error) {
    io.error('Failed to access target directory');
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const labels = { spa: 'SPA', ssr: 'SSR', ssg: 'SSG', startkit: 'StartKit' };
  io.log(`Creating ${labels[templateType]} project: ${name}...`);
  io.log('');

  try {
    await copyDir(templateDir, target, { appName: name });
  } catch (error) {
    io.error('Failed to copy template');
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  if (!parsed.install) {
    io.log('Skipping dependency installation (--no-install)');
    io.log('');
    io.log('Next steps:');
    io.log(`  cd ${name}`);
    io.log('  npm install');
    io.log('  npm run dev');
    return 0;
  }

  const pm = detectPm();
  io.log(`Installing dependencies with ${pm}...`);
  io.log('');

  const result = spawnSync(pm, ['install'], {
    cwd: target,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  io.log('');
  io.log(`Success! Created ${name}`);
  io.log('');

  if (result.status !== 0) {
    io.log('Dependency installation failed. Please run manually:');
    io.log(`  cd ${name}`);
    io.log(`  ${pm} install`);
    io.log(`  ${pm} run dev`);
    return 1;
  }

  io.log('Next steps:');
  io.log(`  cd ${name}`);
  io.log(`  ${pm} run dev`);
  return 0;
}

async function main() {
  const code = await runCreateCli(process.argv.slice(2));
  process.exit(code);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && thisPath === invokedPath) {
  void main();
}
