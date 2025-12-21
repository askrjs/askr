import fs from 'fs';
import path from 'path';

function walk(dir) {
  return fs.readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) return walk(p);
    return p;
  });
}

const root = process.cwd();
const files = walk(path.join(root, 'src'));
for (const file of files) {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  // Replace catch {} and catch { /* ignore */ } and catch { /* ... */ }
  s = s.replace(/catch\s*\{\s*\}/g, "catch (e) { void e; }");
  s = s.replace(/catch\s*\{\s*\/\*[^]*?\*\/\s*\}/g, "catch (e) { void e; }");
  if (s !== orig) {
    fs.writeFileSync(file, s, 'utf8');
    console.log('Patched', file);
  }
}
console.log('Done');
