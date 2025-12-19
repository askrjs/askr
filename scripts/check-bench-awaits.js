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

async function main() {
  const all = await walk(path.resolve('benches'));
  const files = all.filter((f) => f.includes(path.sep + 'benches' + path.sep));
  const matches = [];
  await Promise.all(
    files.map(async (file) => {
      const content = await fs.readFile(file, 'utf8');
      const re = /await\s+flushScheduler\(\)/g;
      if (re.test(content)) matches.push(file);
    })
  );

  if (matches.length) {
    console.error(
      'Found `await flushScheduler()` in the following bench files:'
    );
    for (const f of matches) console.error('- ' + f);
    process.exit(1);
  }

  console.log('No `await flushScheduler()` occurrences found in benches.');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
