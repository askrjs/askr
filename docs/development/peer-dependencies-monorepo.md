# Development: Peer Dependencies in npm Workspaces

Correct configuration of dependencies in a monorepo requires understanding how npm resolves packages. This guide covers patterns, not opinions.

## Core Concepts

### How npm Workspaces Resolve Local Packages

When you run `npm install` in a monorepo with workspaces:

1. npm reads `workspaces` array in root `package.json`
2. For each workspace, npm creates a symlink in root `node_modules/@scope/package-name` pointing to the workspace folder
3. Packages reference each other by explicit version (e.g., `"@scope/package-a": "1.0.0"`)
4. npm does **not** auto-discover workspace versions; you **must declare them explicitly**
5. npm hoists common dependencies to root `node_modules` to prevent duplicates

### Key Difference: Dependencies vs Peer Dependencies

| Type               | Purpose                                       | Installed Where        | When Required              |
| ------------------ | --------------------------------------------- | ---------------------- | -------------------------- |
| `dependencies`     | Your package USES this package                | In your `node_modules` | Always (production + dev)  |
| `peerDependencies` | Your package expects the HOST to provide this | Host's `node_modules`  | Consumer must install it   |
| `devDependencies`  | Only used during development/build            | In your `node_modules` | Never shipped to consumers |

**Key rule**: If you `import` or `require` it in shipped code, it's a `dependency`. If the consumer must have it, it's a `peerDependency`.

---

## Pattern 1: Internal Workspace Dependencies

When Package A depends on Package B (both in the same monorepo):

### Root package.json

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "packageManager": "npm@11.12.0"
}
```

### packages/package-a/package.json

```json
{
  "name": "@scope/package-a",
  "version": "1.0.0",
  "dependencies": {
    "@scope/package-b": "1.0.0"
  }
}
```

### packages/package-b/package.json

```json
{
  "name": "@scope/package-b",
  "version": "1.0.0"
}
```

**How it works:**

- `npm install` creates symlink: `root/node_modules/@scope/package-b -> packages/package-b`
- `package-a` resolves `@scope/package-b` via the symlink during dev
- Published `package-a` declares `@scope/package-b@1.0.0` in `dependencies`; npm finds it published on the registry

**Why version must match:**

- During dev: exact version doesn't matter (symlink bypasses registry), but must be declared
- After publish: consumers install from registry; version constraint must be satisfied

---

## Pattern 2: Peer Dependencies (Local)

When Package A provides an interface/plugin system and expects the consumer to provide the dependency:

### packages/plugin-api/package.json

```json
{
  "name": "@scope/plugin-api",
  "version": "1.0.0",
  "peerDependencies": {
    "@scope/core": "^1.0.0"
  },
  "devDependencies": {
    "@scope/core": "1.0.0"
  }
}
```

### packages/core/package.json

```json
{
  "name": "@scope/core",
  "version": "1.0.0"
}
```

### Root package.json

```json
{
  "workspaces": ["packages/*"],
  "private": true,
  "devDependencies": {
    "@scope/core": "1.0.0",
    "@scope/plugin-api": "1.0.0"
  }
}
```

**Why both `peerDependencies` and `devDependencies`"**

- `peerDependencies` tells consumers: "You need `@scope/core`"
- `devDependencies` in the package ensures local dev/test works (can resolve the peer)
- Root `devDependencies` ensures both are available locally for testing together

**npm hoisting behavior:**

- npm lifts shared deps to root `node_modules` when versions allow
- Both packages can resolve `@scope/core` from root or workspace's node_modules

---

## Pattern 3: External Peer Dependencies

When your package depends on something external (e.g., a framework) that you expect the consumer to provide:

### packages/my-plugin/package.json

```json
{
  "name": "@scope/my-plugin",
  "version": "1.0.0",
  "peerDependencies": {
    "some-framework": "^3.0.0"
  },
  "devDependencies": {
    "some-framework": "3.5.0"
  }
}
```

**Publishing behavior:**

- Published package declares peer in `peerDependencies`
- Consumer must install `some-framework@^3.0.0` or get a warning
- devDependency (pinned version) only used locally during package development/testing
- devDependency is **never** installed in consumers' projects

---

## Pattern 4: Optional Peer Dependencies

When a feature is optional:

```json
{
  "name": "@scope/feature",
  "version": "1.0.0",
  "peerDependencies": {
    "optional-lib": "^2.0.0"
  },
  "peerDependenciesMeta": {
    "optional-lib": {
      "optional": true
    }
  }
}
```

**Behavior:**

- Consumer won't get a warning if they don't install `optional-lib`
- Your package must handle the case where it's missing (try/catch or dynamic import)

---

## When to Add Peer as devDependency

**Always add when:**

1. Package needs to build/test locally
2. Package calls functions/types from the peer in compiler/runtime
3. You want TypeScript to resolve types

**Example - testing a peer dependency:**

```json
{
  "name": "@scope/middleware",
  "version": "1.0.0",
  "peerDependencies": {
    "@scope/runtime": "^1.0.0"
  },
  "devDependencies": {
    "@scope/runtime": "1.0.0"
  },
  "scripts": {
    "test": "vitest"
  }
}
```

During `npm test`, vitest can resolve `@scope/runtime` via devDependency. Consumers provide their own copy via peerDependency.

---

## npm Hoisting and Peer Resolution

### Example Monorepo Structure

```
root/
  packages/
    core/              # version 1.0.0
    plugin/            # peerDependency: core@^1.0.0, devDependency: core@1.0.0
    app/               # dependency: core@1.0.0, dependency: plugin@1.0.0
  node_modules/
    @scope/
      core -> ../../packages/core (symlink)
      plugin -> ../../packages/plugin (symlink)
```

**Resolution order (npm v10+):**

1. Look in `<package>/node_modules/`
2. Look in `<package>/../node_modules/` (parent workspace)
3. Walk up until found or fail

**Hoisting behavior:**

- `core` is a common dependency; npm hoists it to root `node_modules`
- `plugin` resolves `core` peer via the hoisted symlink
- All packages access same `core` instance (no duplication)

---

## Minimal Root package.json

```json
{
  "name": "@scope/monorepo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "npm run --workspaces --if-present build",
    "test": "npm run --workspaces --if-present test"
  }
}
```

**Key points:**

- `"private": true` prevents publishing the monorepo root
- `"version": "0.0.0"` is arbitrary (private packages don't publish)
- `workspaces` must be an array of glob patterns
- Name is not used for resolution; internal packages use scoped names

---

## Minimal Package with Workspace Dependency

```json
{
  "name": "@scope/package-a",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "files": ["dist"],
  "dependencies": {
    "@scope/package-b": "1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**For TypeScript:**

- Declare in `dependencies` (used in shipped code)
- TypeScript resolves `@scope/package-b` via symlink during dev
- Published version constrains `@scope/package-b` on registry

---

## Minimal Package with Peer Dependency

```json
{
  "name": "@scope/plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "peerDependencies": {
    "@scope/host": "^1.0.0"
  },
  "devDependencies": {
    "@scope/host": "1.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Publishing behavior:**

- Consumer sees: `@scope/plugin@1.0.0` requires `@scope/host@^1.0.0`
- Only `devDependencies` and `peerDependencies` appear in published `package.json`
- `devDependencies` is ignored by consumers

---

## Best Practices

### 1. Use Exact Versions for Internal Workspace Dependencies

```json
{
  "dependencies": {
    "@scope/package": "1.2.3"
  }
}
```

Not `^1.2.3` or `~1.2.3`. Internal packages are released together; exact version prevents accidents.

### 2. Use Semantic Ranges for Peer Dependencies

```json
{
  "peerDependencies": {
    "framework": "^3.0.0"
  }
}
```

Allows consumers to use compatible versions (e.g., 3.0.0, 3.1.0, 3.5.0). Update when you drop support.

### 3. Pin devDependencies to Match Peer Versions

```json
{
  "peerDependencies": {
    "framework": "^3.0.0"
  },
  "devDependencies": {
    "framework": "3.5.0"
  }
}
```

Pin to a compatible version in the range. Ensures builds succeed locally.

### 4. Declare All Imports in Dependencies

If your code has `import x from 'a-lib'`, it must be in `dependencies` or `peerDependencies` (not devDependencies).

### 5. Re-export Types from Peer Dependencies

```typescript
// packages/plugin/src/index.ts
export type { SomeType } from '@scope/host';
```

Consumers can import types from your package even if they don't know about the peer.

### 6. Use peerDependenciesMeta for Warnings

```json
{
  "peerDependencies": {
    "optional-feature": "^2.0.0"
  },
  "peerDependenciesMeta": {
    "optional-feature": {
      "optional": true
    }
  }
}
```

Marks peer as optional; npm won't warn if missing.

---

## Common Mistakes

### Mistake 1: Forgetting to Declare Workspace Dependency

```json
{
  "devDependencies": {
    "@scope/package-b": "1.0.0"
  }
}
```

NO Package A ships code that imports `@scope/package-b`, but it's only in `devDependencies`.
Consumer's build fails: `@scope/package-b` not installed.

**Fix:** Move to `dependencies`.

---

### Mistake 2: Using `npm link` Instead of Workspace

```bash
cd packages/package-b && npm link
cd packages/package-a && npm link @scope/package-b
```

NO Manual symlinks conflict with npm workspace symlinks. Causes resolution chaos.

**Fix:** Use workspaces; run `npm install` once from root.

---

### Mistake 3: Forgetting devDependency on Peer

```json
{
  "peerDependencies": {
    "@scope/core": "^1.0.0"
  }
}
```

NO Local tests fail: can't resolve `@scope/core`.

**Fix:** Add `devDependencies: { "@scope/core": "1.0.0" }`.

---

### Mistake 4: Using `^` for Internal Workspace Dependencies

```json
{
  "dependencies": {
    "@scope/package": "^1.0.0"
  }
}
```

NO Workspace release discipline broken. If package-b publishes 1.1.0, package-a consumers might get mismatched.

**Fix:** Use exact version: `"1.0.0"`.

---

### Mistake 5: Not Exporting Types from Peer

```typescript
// packages/plugin/src/index.ts
import type { Config } from '@scope/host';
export function setup(config: Config) { ... }
```

NO Consumers can't infer `Config` type without knowing about `@scope/host` peer.

**Fix:** Re-export:

```typescript
export type { Config } from '@scope/host';
```

---

### Mistake 6: Over-Using peerDependencies

```json
{
  "peerDependencies": {
    "some-utility": "^1.0.0"
  }
}
```

NO If your package directly uses `some-utility` in shipped code and you own the decision, it should be `dependencies`, not `peerDependencies`.

Peer dependencies are for **extension points** or **ecosystem conventions**, not internal utilities.

---

## Verification Checklist

Before publishing, verify:

- [ ] All `import`/`require` statements in shipped code are in `dependencies` or `peerDependencies`
- [ ] Each `peerDependency` has a matching `devDependency` pinned to a compatible version
- [ ] Internal workspace dependencies use exact versions (no `^` or `~`)
- [ ] `peer peerDependencies` use semantic ranges (e.g., `^1.0.0`)
- [ ] `files` array in `package.json` excludes `node_modules` and test files
- [ ] Run `npm pack` locally and inspect `package.json` in tarball to ensure only needed fields are present
- [ ] Tests pass with only deployed dependencies (simulate consumer environment)
- [ ] Type exports re-export types from peers when needed

---

## TypeScript-Specific Considerations

### Type Resolution in Monorepo

```json
{
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "skipLibCheck": false,
    "moduleResolution": "bundler"
  }
}
```

- `moduleResolution: "bundler"` (TypeScript 4.7+) respects npm workspace symlinks
- `skipLibCheck: false` verifies type consistency across packages
- `rootDir` and `outDir` ensure built types land in `dist`

### Publishing Types

Ensure `types` field points to built declaration:

```json
{
  "name": "@scope/package",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

Consumers can import types even if they only install JavaScript.

---

## Real-World Example: Plugin System

### Core package (shipped)

```json
{
  "name": "@scope/core",
  "version": "2.0.0",
  "exports": {
    ".": "./dist/core.js"
  }
}
```

### Plugin package (shipped)

```json
{
  "name": "@scope/plugin-api",
  "version": "1.0.0",
  "peerDependencies": {
    "@scope/core": "^2.0.0"
  },
  "devDependencies": {
    "@scope/core": "2.0.0"
  }
}
```

### App consuming both (consumer)

```json
{
  "dependencies": {
    "@scope/core": "^2.0.0",
    "@scope/plugin-api": "^1.0.0"
  }
}
```

**What happens:**

- Consumer installs `@scope/core@2.x.y` and `@scope/plugin-api@1.0.0`
- npm verifies `@scope/plugin-api@1.0.0` declares peer `@scope/core@^2.0.0`
- Both packages access same `@scope/core` instance
- If consumer had installed `@scope/core@1.0.0`, npm would warn (not error)

---

## When to Question Your Structure

If you find yourself:

- Adding lots of `npm link` workarounds -> You need workspace configuration
- Repeatedly specifying same dependency versions -> Consider hoisting to root devDependencies
- Confused about which deps to cut from published package -> Re-evaluate if they should be `devDependencies`
- Unsure if something is peer or regular dep -> Ask: "Do consumers need to decide about this""

---

## References

- [npm workspaces documentation](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
- [npm peer dependencies documentation](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#peerdependencies)
- [Node.js module resolution algorithm](https://nodejs.org/en/docs/guides/nodejs-module-resolution-algorithm/)
