import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error(
    'Usage: node scripts/summarize-cpuprofile.js <file.cpuprofile>'
  );
  process.exit(2);
}

/** @type {{ nodes: any[], samples?: number[], timeDeltas?: number[] }} */
const profile = JSON.parse(readFileSync(file, 'utf8'));

const nodesById = new Map();
for (const node of profile.nodes) nodesById.set(node.id, node);

const samples = profile.samples ?? [];
const timeDeltas = profile.timeDeltas ?? [];

if (samples.length === 0 || timeDeltas.length === 0) {
  console.error(
    'Profile has no samples/timeDeltas (cannot summarize self time).'
  );
  process.exit(1);
}

const selfMicrosByNode = new Map();
for (let i = 0; i < samples.length; i++) {
  const nodeId = samples[i];
  const dt = timeDeltas[i] ?? 0;
  selfMicrosByNode.set(nodeId, (selfMicrosByNode.get(nodeId) ?? 0) + dt);
}

const rows = [];
for (const [nodeId, micros] of selfMicrosByNode.entries()) {
  const node = nodesById.get(nodeId);
  const cf = node?.callFrame;
  const fn = cf?.functionName || '(anonymous)';
  const url = cf?.url || '';
  const line = cf?.lineNumber;
  const col = cf?.columnNumber;
  rows.push({ nodeId, micros, fn, url, line, col });
}

rows.sort((a, b) => b.micros - a.micros);
const totalMicros = rows.reduce((acc, r) => acc + r.micros, 0);

const topN = Number(process.env.TOP ?? 40);

console.log(`# ${basename(file)} self-time summary`);
console.log(
  `# total sampled: ${(totalMicros / 1000).toFixed(2)}ms across ${samples.length} samples`
);
console.log('#');

for (const r of rows.slice(0, topN)) {
  const pct = ((r.micros / totalMicros) * 100).toFixed(2);
  const loc = r.url ? `${r.url}:${(r.line ?? 0) + 1}:${(r.col ?? 0) + 1}` : '';
  console.log(`${pct}%\t${(r.micros / 1000).toFixed(2)}ms\t${r.fn}\t${loc}`);
}
