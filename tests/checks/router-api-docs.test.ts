import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

const read = (relative: string) =>
  fs.readFileSync(path.join(rootDir, relative), 'utf8');

describe('router public contract documentation', () => {
  it('should mark ambient route APIs deprecated in their declarations', () => {
    const source = read('src/router/manifest.ts');

    for (const name of ['getManifest', 'clearRoutes']) {
      expect(source).toContain(`export function ${name}`);
    }
    for (const name of ['getManifest', 'clearRoutes']) {
      expect(source).toMatch(
        new RegExp(`@deprecated[\\s\\S]*export function ${name}`)
      );
    }
    expect(read('src/router/store.ts')).toMatch(
      /@deprecated[\s\S]*export function getRoutes/
    );
    expect(read('src/router/authoring.ts')).toMatch(
      /@deprecated[\s\S]*export function registerRoutes/
    );
  });

  it('should document registry as the only preferred SPA route source', () => {
    const boot = read('src/boot/index.ts');
    const types = read('src/boot/types.ts');

    expect(boot).toMatch(/Preferred usage with registry/);
    expect(boot).not.toMatch(/Preferred usage with manifest/);
    expect(types).toMatch(/Preferred: pass a route registry/);
    expect(types).toMatch(
      /Deprecated: pass `manifest` or `routes` only for legacy code/
    );
  });

  it('should direct the router reference to the explicit registry API', () => {
    const docs = read('docs/reference/router.md');

    expect(docs).toMatch(/## `createRouteRegistry\(definition, options\)`/);
    expect(docs).toMatch(/`registerRoutes\(\)` is\s+deprecated/);
    expect(docs).toMatch(/This accessor is deprecated/);
    expect(docs).toMatch(/This ambient reset is deprecated/);
  });
});
