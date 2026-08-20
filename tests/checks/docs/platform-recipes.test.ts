import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

function read(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('verified platform recipe documentation', () => {
  it('should index every core-owned recipe and its applicability', () => {
    const recipes = read('docs/guides/platform-recipes.md');
    const packageVersion = (
      JSON.parse(read('package.json')) as { version: string }
    ).version;

    expect(recipes).toContain(`@askrjs/askr@${packageVersion}`);
    for (const heading of [
      'Persistent routed shell',
      'SSR-safe route-driven search',
      'Hydrated query data',
      'Dynamic schema browser',
      'Error boundary placement',
      'Test the recipes',
    ]) {
      expect(recipes).toContain(`## ${heading}`);
    }
    expect(recipes).toMatch(
      /Active navigation in a persistent layout[^\n]*\|\s*Yes\s*\|\s*Yes\s*\|\s*Yes\s*\|/
    );
    expect(recipes).toMatch(
      /Browser listeners and controlled search[^\n]*\|\s*Yes\s*\|\s*Yes\s*\|\s*Yes\s*\|/
    );
    expect(recipes).toMatch(
      /Loading, failure, invalidation, hydration[^\n]*\|\s*Yes\s*\|\s*Yes\s*\|\s*Yes\s*\|/
    );
    expect(recipes).toMatch(
      /Dynamic keyed data with bounded loading[^\n]*\|\s*Yes\s*\|\s*Data\s*\|\s*Data\s*\|/
    );
    expect(recipes).toMatch(
      /Local and route-level recovery[^\n]*\|\s*Yes\s*\|\s*Local\s*\|\s*Local\s*\|/
    );
  });

  it('should keep runnable examples and package-owned UI links discoverable', () => {
    const recipes = read('docs/guides/platform-recipes.md');

    for (const fileName of [
      'routed-shell.tsx',
      'browser-search.tsx',
      'data-hydration.tsx',
      'dynamic-schema-browser.tsx',
      'error-boundaries.tsx',
    ]) {
      expect(recipes).toContain(`../../examples/platform-recipes/${fileName}`);
      expect(
        fs.existsSync(
          path.join(rootDir, 'examples', 'platform-recipes', fileName)
        )
      ).toBe(true);
    }

    expect(recipes).toContain('askrjs/askr-themes/blob/main/docs/recipes.md');
    expect(recipes).toContain('askrjs/askr-ui/blob/main/docs/components.md');
    expect(read('docs/index.md')).toContain('./guides/platform-recipes.md');
    expect(read('docs/README.md')).toContain('./guides/platform-recipes.md');
  });

  it('should use only supported public Askr entrypoints in recipe sources', () => {
    const source = [
      'routed-shell.tsx',
      'browser-search.tsx',
      'data-hydration.tsx',
      'error-boundaries.tsx',
    ]
      .map((fileName) =>
        read(path.join('examples', 'platform-recipes', fileName))
      )
      .join('\n');

    for (const entrypoint of [
      '@askrjs/askr',
      '@askrjs/askr/components',
      '@askrjs/askr/control',
      '@askrjs/askr/data',
      '@askrjs/askr/resources',
      '@askrjs/askr/router',
    ]) {
      expect(source).toContain(`'${entrypoint}'`);
    }
    expect(source).not.toContain('../src/');
  });
});
