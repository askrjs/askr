import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vite-plus/test';

const script = fileURLToPath(
  new URL('../../scripts/publish-order.mjs', import.meta.url)
);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function checkoutRoot() {
  const root = mkdtempSync(join(tmpdir(), 'askr-publish-order-'));
  roots.push(root);
  return root;
}

function manifest(root: string, dir: string, value: Record<string, unknown>) {
  mkdirSync(join(root, dir));
  writeFileSync(join(root, dir, 'package.json'), JSON.stringify(value));
}

function order(root: string) {
  return spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
}

describe('coordinated package publish order', () => {
  it('should include public Askr packages and leave private applications out of publication', () => {
    const root = checkoutRoot();
    manifest(root, 'askr-schema', { name: '@askrjs/schema' });
    manifest(root, 'askr-examples', {
      name: '@askrjs/examples',
      private: true,
    });
    manifest(root, 'website', { name: 'website' });
    manifest(root, 'destroyer', { name: 'destroyer', private: true });
    const result = order(root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('wave 1: askr-schema\n');
  });

  it('should order runtime and optional peer dependencies while excluding development edges', () => {
    const root = checkoutRoot();
    manifest(root, 'askr-auth', { name: '@askrjs/auth' });
    manifest(root, 'askr', {
      name: '@askrjs/askr',
      peerDependencies: { '@askrjs/auth': '>=0.5.0 <0.6.0' },
      peerDependenciesMeta: { '@askrjs/auth': { optional: true } },
      devDependencies: { '@askrjs/node': '>=0.5.0 <0.6.0' },
    });
    manifest(root, 'askr-node', {
      name: '@askrjs/node',
      dependencies: { '@askrjs/askr': '>=0.5.0 <0.6.0' },
    });
    const result = order(root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      'wave 1: askr-auth\nwave 2: askr\nwave 3: askr-node\n'
    );
  });

  it('should prefer the canonical checkout over a duplicate review worktree', () => {
    const root = checkoutRoot();
    manifest(root, 'askr', { name: '@askrjs/askr' });
    manifest(root, 'askr-cli', {
      name: '@askrjs/cli',
      peerDependencies: { '@askrjs/askr': '>=0.5.0 <0.6.0' },
    });
    manifest(root, 'askr-cli-codeql', { name: '@askrjs/cli' });
    const result = order(root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('wave 1: askr\nwave 2: askr-cli\n');
  });

  it('should reject duplicate packages when neither checkout is canonical', () => {
    const root = checkoutRoot();
    manifest(root, 'review-one', { name: '@askrjs/cli' });
    manifest(root, 'review-two', { name: '@askrjs/cli' });
    const result = order(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/Duplicate package @askrjs\/cli/);
    expect(result.stderr).toContain('review-one');
    expect(result.stderr).toContain('review-two');
  });

  it('should reject a runtime dependency cycle without printing a partial publication order', () => {
    const root = checkoutRoot();
    manifest(root, 'askr-auth', {
      name: '@askrjs/auth',
      dependencies: { '@askrjs/askr': '>=0.5.0 <0.6.0' },
    });
    manifest(root, 'askr', {
      name: '@askrjs/askr',
      dependencies: { '@askrjs/auth': '>=0.5.0 <0.6.0' },
    });
    const result = order(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(
      /Dependency cycle among: @askrjs\/askr, @askrjs\/auth/
    );
  });

  it('should explain when the root contains no publishable Askr packages', () => {
    const root = checkoutRoot();
    manifest(root, 'website', { name: 'website', private: true });
    const result = order(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No publishable @askrjs package manifests');
  });
});
