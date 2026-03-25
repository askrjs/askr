#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((res) =>
    rl.question(question, (ans) => {
      rl.close();
      res(ans);
    })
  );
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
  for (const e of entries) {
    const srcPath = path.join(src, e.name);
    const destPath = path.join(
      dest,
      e.name.replace(/\{\{\s*appName\s*\}\}/g, replacements['{{appName}}'])
    );
    if (e.isDirectory()) {
      await copyDir(srcPath, destPath, replacements);
    } else {
      const buffer = await fs.readFile(srcPath);
      // try to replace text content - if binary, keep buffer
      let content = null;
      try {
        content = buffer.toString('utf8');
      } catch {
        // binary
      }
      if (content !== null) {
        const replaced = content
          .replace(/\{\{\s*appName\s*\}\}/g, replacements['{{appName}}'])
          .replace(/\{\{appName\}\}/g, replacements['{{appName}}']);
        await fs.writeFile(destPath, replaced, 'utf8');
      } else {
        await fs.writeFile(destPath, buffer);
      }
    }
  }
}

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  // Determine template type and app name
  let templateType = 'spa'; // default
  let name = '';

  if (
    arg1 === 'spa' ||
    arg1 === 'ssr' ||
    arg1 === 'ssg' ||
    arg1 === 'startkit'
  ) {
    templateType = arg1;
    name = arg2;
  } else {
    name = arg1;
  }

  if (!name) {
    console.log('Available templates: spa, ssr, ssg, startkit\n');
    const type =
      (await prompt('Template type (spa/ssr/ssg/startkit) [spa]: ')).trim() ||
      'spa';
    if (
      type !== 'spa' &&
      type !== 'ssr' &&
      type !== 'ssg' &&
      type !== 'startkit'
    ) {
      console.error('Invalid template type');
      process.exit(1);
    }
    templateType = type;
    name = (await prompt('App name: ')).trim();
  }

  if (!name) {
    console.error('App name is required');
    process.exit(1);
  }

  const target = path.resolve(process.cwd(), name);
  try {
    const stat = await fs.stat(target).catch(() => null);
    if (stat) {
      const files = await fs.readdir(target).catch(() => []);
      if (files.length > 0) {
        console.error(`Directory ${target} already exists and is not empty.`);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error('Failed to access target dir', err);
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const templateDir = path.resolve(__dirname, '..', 'templates', templateType);

  // Check if template exists
  try {
    await fs.stat(templateDir);
  } catch {
    console.error(`Template '${templateType}' not found at ${templateDir}`);
    process.exit(1);
  }

  const typeLabels = {
    spa: 'SPA',
    ssr: 'SSR',
    ssg: 'SSG',
    startkit: 'StartKit',
  };
  console.log(`Creating ${typeLabels[templateType]} project: ${name}...\n`);

  try {
    await copyDir(templateDir, target, { '{{appName}}': name });
  } catch (err) {
    console.error('Failed to copy template:', err);
    process.exit(1);
  }

  const pm = detectPm();
  console.log(`\nInstalling dependencies with ${pm}...\n`);
  const installCmd = ['install'];
  const res = spawnSync(pm, installCmd, { cwd: target, stdio: 'inherit' });

  console.log('\nSuccess! Created ' + name + '\n');

  if (res.status !== 0) {
    console.log('Dependency installation failed. Please run manually:\n');
    console.log(`  cd ${name}`);
    console.log(`  ${pm} install`);
    console.log(`  ${pm} run dev\n`);
  } else {
    console.log('Next steps:\n');
    console.log(`  cd ${name}`);
    console.log(`  ${pm} run dev\n`);
    const typeDescs = {
      spa: 'Client-side SPA',
      ssr: 'Server-side SSR',
      ssg: 'Static Site (SSG)',
      startkit:
        'Production SaaS starter (landing + login + dashboard + accounts + settings)',
    };
    console.log(`Documentation: ${typeDescs[templateType]} with Askr`);
    console.log('Happy coding.\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
