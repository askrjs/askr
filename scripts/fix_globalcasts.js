import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src', 'renderer', 'dom.ts');
let s = fs.readFileSync(file, 'utf8');
let orig = s;

// replace occurrences of 'const _g = globalThis as any;' with typed gl
s = s.replace(/const _g = globalThis as any;/g, `const gl = globalThis as unknown as {
                  __ASKR_LAST_FASTPATH_STATS?: unknown;
                  __ASKR_BULK_DIAG?: unknown;
                  __ASKR_FASTPATH_COUNTERS?: Record<string, number>;
                };`);

// replace remaining '(globalThis as any).__ASKR_BULK_DIAG' with gl assignment
s = s.replace(/\(globalThis as any\)\.__ASKR_BULK_DIAG/g, `(globalThis as unknown as { __ASKR_BULK_DIAG?: unknown }).__ASKR_BULK_DIAG`);

// replace any remaining _g. with gl.
s = s.replace(/_g\./g, 'gl.');

if (s !== orig) {
  fs.writeFileSync(file, s, 'utf8');
  console.log('Patched', file);
} else {
  console.log('No changes');
}
