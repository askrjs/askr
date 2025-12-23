import fs from 'fs/promises';
import path from 'path';

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const res = path.resolve(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(res)));
    else if (res.endsWith('.ts') || res.endsWith('.tsx')) files.push(res);
  }
  return files;
}

async function processFile(file) {
  let text = await fs.readFile(file, 'utf8');
  const re = /await\s+flushScheduler\(\);/g;
  if (!re.test(text)) return false;

  // Replace all occurrences with explicit flush + wait
  text = text.replace(/\n(\s*)await\s+flushScheduler\(\);/g, (m, indent) => {
    return `\n${indent}flushScheduler();\n${indent}await waitForNextEvaluation();`;
  });

  // Ensure import includes waitForNextEvaluation (simple string-based insertion)
  if (
    text.includes("from '../../tests/helpers/test-renderer'") ||
    text.includes('from "../../tests/helpers/test-renderer"')
  ) {
    if (!text.includes('waitForNextEvaluation')) {
      text = text.replace(
        /(createTestContainer,\s*\n\s*flushScheduler,?)/,
        (m) => {
          return m.replace(
            'flushScheduler,',
            'flushScheduler,\n  waitForNextEvaluation,'
          );
        }
      );
    }
  }

  await fs.writeFile(file, text, 'utf8');
  return true;
}

async function main() {
  const files = await walk(path.resolve('benches'));
  const processed = [];
  for (const f of files) {
    const changed = await processFile(f);
    if (changed) processed.push(f);
  }

  console.log('Processed files:', processed.length);
  for (const f of processed) console.log('- ' + f);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
