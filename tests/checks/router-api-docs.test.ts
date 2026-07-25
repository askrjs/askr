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
  it('should remove the ambient route APIs from the public and internal surfaces', () => {
    for (const relative of [
      'src/router/index.ts',
      'src/router/route.ts',
      'src/router/manifest.ts',
      'src/router/authoring.ts',
      'src/router/store.ts',
    ]) {
      const source = read(relative);
      for (const name of [
        'registerRoutes',
        'getManifest',
        'getRoutes',
        'clearRoutes',
      ]) {
        expect(source).not.toMatch(
          new RegExp(`export (?:function|\\{)[\\s\\S]*\\b${name}\\b`)
        );
        expect(source).not.toContain('@deprecated');
      }
    }
  });

  it('should document registry as the only preferred SPA route source', () => {
    const boot = read('src/boot/index.ts');
    const types = read('src/boot/types.ts');

    expect(boot).toMatch(/route registry/);
    expect(boot).not.toMatch(
      /getManifest|getRoutes|clearRoutes|config\.manifest|config\.routes|legacy/
    );
    expect(types).toMatch(/Pass a route registry/);
    expect(types).not.toMatch(/manifest\?|Deprecated|legacy/);

    const routerTypes = read('src/common/router.ts');
    expect(routerTypes).toMatch(/registry: RouteRegistry/);
    expect(routerTypes).not.toMatch(/manifest\?: RouteManifest/);
  });

  it('should direct the router reference to the explicit registry API', () => {
    const docs = read('docs/reference/router.md');

    expect(docs).toMatch(/## `createRouteRegistry\(definition, options\)`/);
    expect(docs).toMatch(/createRouteRegistry/);
    expect(docs).not.toMatch(
      /registerRoutes|getManifest|getRoutes|clearRoutes|deprecated|legacy/
    );
  });
});
