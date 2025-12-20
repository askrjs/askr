import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full);
    } else if (ent.isFile()) {
      if (/\.test\.(ts|tsx)$/.test(ent.name)) {
        if (!/^[a-z0-9_-]+\.test\.(ts|tsx)$/.test(ent.name)) {
          console.log(full);
        }
      }
    }
  }
}

walk(path.join(__dirname, '..', 'tests'));
