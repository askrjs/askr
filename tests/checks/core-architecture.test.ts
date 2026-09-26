import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Layering of the rebuilt core (see docs/internals/core-rewrite.md):
 *
 *   reactive  <-  component  <-  view  <-  dom
 *                     ^
 *                    api (also view)
 *
 * A layer imports only from the layers to its left. The core never imports
 * the previous runtime/renderer implementation or higher-level packages.
 */
const ROOT = resolve(__dirname, '../../src/core');
const LAYERS: Record<string, readonly string[]> = {
  reactive: [],
  component: ['reactive'],
  view: [],
  dom: ['reactive', 'component', 'view'],
  api: ['reactive', 'component', 'view'],
};
const ALLOWED_OUTSIDE = ['common'];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function imports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/from '(\.[^']+)'/g)].map((match) =>
    resolve(dirname(file), match[1])
  );
}

describe('core architecture', () => {
  const all = files(ROOT);

  it('keeps each layer to its allowed dependencies', () => {
    const violations: string[] = [];
    for (const file of all) {
      const layer = relative(ROOT, file).split('/')[0];
      const allowed = LAYERS[layer];
      expect(allowed, `unknown core layer: ${layer}`).toBeDefined();
      for (const target of imports(file)) {
        const inCore = relative(ROOT, target);
        if (!inCore.startsWith('..')) {
          const targetLayer = inCore.split('/')[0];
          if (targetLayer !== layer && !allowed.includes(targetLayer)) {
            violations.push(`${relative(ROOT, file)} -> core/${inCore}`);
          }
          continue;
        }
        const outside = relative(resolve(ROOT, '..'), target).split('/')[0];
        if (!ALLOWED_OUTSIDE.includes(outside)) {
          violations.push(
            `${relative(ROOT, file)} -> src/${relative(resolve(ROOT, '..'), target)}`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('has no import cycles', () => {
    const graph = new Map(
      all.map((file) => [
        file.replace(/\.ts$/, ''),
        imports(file).filter((target) => target.startsWith(ROOT)),
      ])
    );
    const state = new Map<string, 'visiting' | 'done'>();
    const cycles: string[] = [];
    const visit = (node: string, path: string[]) => {
      if (state.get(node) === 'done') return;
      if (state.get(node) === 'visiting') {
        cycles.push(
          [...path.slice(path.indexOf(node)), node]
            .map((p) => relative(ROOT, p))
            .join(' -> ')
        );
        return;
      }
      state.set(node, 'visiting');
      for (const next of graph.get(node) ?? []) visit(next, [...path, node]);
      state.set(node, 'done');
    };
    for (const node of graph.keys()) visit(node, []);
    expect(cycles).toEqual([]);
  });
});
