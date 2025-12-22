import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src', 'renderer', 'dom.ts');
let s = fs.readFileSync(file, 'utf8');
let orig = s;

// replace occurrences of 'const _g = globalThis as any;' with typed gl
s = s.replace(
  /const _g = globalThis as any;/g,
  `const ns = ((globalThis as unknown) as Record<string, unknown> & { __ASKR__?: Record<string, unknown> }).__ASKR__ || {} as Record<string, unknown>`
);

// replace remaining '(globalThis as any).__ASKR_BULK_DIAG' with namespaced access
s = s.replace(
  /\(globalThis as any\)\.__ASKR_BULK_DIAG/g,
  `((globalThis as unknown) as Record<string, unknown> & { __ASKR__?: Record<string, unknown> }).__ASKR__?.__BULK_DIAG`
);

// replace any remaining _g. with ns.
s = s.replace(/_g\./g, 'ns.');

if (s !== orig) {
  fs.writeFileSync(file, s, 'utf8');
  console.log('Patched', file);
} else {
  console.log('No changes');
}
