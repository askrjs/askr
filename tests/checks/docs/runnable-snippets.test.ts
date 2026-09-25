// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from '@typescript/typescript6';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { dispatch, render, type RenderResult } from '@askrjs/askr/testing';

/**
 * Executes opt-in docs snippets instead of only type-checking them.
 *
 * Mark a published docs fence with `run=<id>` in its info string, for example
 * ```` ```tsx run=quick-start-user ````. The snippet is written to a temporary
 * module with its top-level declarations exported, imported in jsdom (so
 * module-scope code runs), and then handed to the scenario registered under
 * the same id below, which mounts or calls what the snippet defines and
 * asserts the documented behavior.
 */

type SnippetModule = Record<string, unknown>;

type ScenarioContext = {
  /** Body of the first fenced block after the snippet, if any. */
  nextFence: string | undefined;
  mount(component: unknown): RenderResult;
};

type Scenario = {
  /** Sibling modules the snippet imports relatively, keyed by file name. */
  files?: Record<string, string>;
  run(module: SnippetModule, context: ScenarioContext): void | Promise<void>;
};

type RunnableSnippet = {
  id: string;
  filePath: string;
  code: string;
  /** Markdown that follows the snippet's closing fence. */
  after: string;
  extension: 'ts' | 'tsx' | 'js' | 'jsx';
};

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
// Snippets are materialized inside the (git-ignored) repo `.temp` directory so
// the test's Vite pipeline transforms their JSX and resolves package aliases.
const tempParent = path.join(rootDir, '.temp');
let tempRoot = '';

beforeAll(() => {
  fs.mkdirSync(tempParent, { recursive: true });
  tempRoot = fs.mkdtempSync(path.join(tempParent, 'doc-snippets-'));
});

let mounted: RenderResult[] = [];

afterEach(() => {
  for (const result of mounted) result.cleanup();
  mounted = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Snippets mount islands and build SPA route tables in one module graph;
  // reset the process-wide execution model between them.
  delete (globalThis as Record<symbol, unknown>)[
    Symbol.for('__ASKR_EXECUTION_MODEL__')
  ];
});

afterAll(() => {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  // Remove `.temp` too when this suite was its only user.
  if (fs.existsSync(tempParent) && fs.readdirSync(tempParent).length === 0) {
    fs.rmdirSync(tempParent);
  }
});

function collectPublishedDocs(): string[] {
  const files = [path.join(rootDir, 'README.md')];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'internals' || entry.name === 'development') {
          continue;
        }
        visit(fullPath);
      } else if (/\.mdx?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  };
  visit(path.join(rootDir, 'docs'));
  return files;
}

function snippetExtension(
  lang: string,
  code: string
): RunnableSnippet['extension'] {
  const normalized =
    lang === 'typescript' ? 'ts' : lang === 'javascript' ? 'js' : lang;
  if (normalized === 'tsx' || normalized === 'jsx') return normalized;
  if (normalized !== 'ts' && normalized !== 'js') {
    throw new Error(`Runnable docs snippets must be TS or JS, got "${lang}".`);
  }
  const usesJsx = /<\/?[A-Za-z][\w:-]*(?:\s[^>]*)?>/.test(code);
  return usesJsx ? (`${normalized}x` as 'tsx' | 'jsx') : normalized;
}

function extractRunnableSnippets(): RunnableSnippet[] {
  const snippets: RunnableSnippet[] = [];
  // Same fence grammar as public-api-snippets.test.ts.
  const fencePattern = /```([A-Za-z0-9_-]+)([^\n]*)\n([\s\S]*?)```/g;

  for (const filePath of collectPublishedDocs()) {
    const content = fs.readFileSync(filePath, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = fencePattern.exec(content)) !== null) {
      const runId = /(?:^|\s)run=([\w-]+)(?=\s|$)/.exec(match[2])?.[1];
      if (!runId) continue;
      snippets.push({
        id: runId,
        filePath,
        code: match[3],
        after: content.slice(match.index + match[0].length),
        extension: snippetExtension(match[1].toLowerCase(), match[3]),
      });
    }
  }

  return snippets;
}

function collectBindingNames(name: ts.BindingName, names: string[]): void {
  if (ts.isIdentifier(name)) {
    names.push(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      collectBindingNames(element.name, names);
    }
  }
}

/** Append an export clause for the snippet's top-level declarations. */
function exportTopLevelDeclarations(snippet: RunnableSnippet): string {
  const source = ts.createSourceFile(
    `snippet.${snippet.extension}`,
    snippet.code,
    ts.ScriptTarget.Latest,
    true,
    snippet.extension.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const names: string[] = [];

  for (const statement of source.statements) {
    const exported = ts.canHaveModifiers(statement)
      ? ts
          .getModifiers(statement)
          ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      : false;
    if (exported) continue;

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      names.push(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, names);
      }
    }
  }

  return names.length > 0
    ? `${snippet.code}\nexport { ${names.join(', ')} };\n`
    : snippet.code;
}

async function importSnippet(
  snippet: RunnableSnippet,
  scenario: Scenario
): Promise<SnippetModule> {
  const dir = fs.mkdtempSync(path.join(tempRoot, `${snippet.id}-`));
  for (const [name, code] of Object.entries(scenario.files ?? {})) {
    fs.writeFileSync(path.join(dir, name), code);
  }
  const modulePath = path.join(dir, `snippet.${snippet.extension}`);
  fs.writeFileSync(modulePath, exportTopLevelDeclarations(snippet));
  return (await import(
    /* @vite-ignore */ pathToFileURL(modulePath).href
  )) as SnippetModule;
}

function component(module: SnippetModule, name: string): () => unknown {
  const value = module[name];
  expect(typeof value, `snippet should define ${name}()`).toBe('function');
  return value as () => unknown;
}

/** Drain the microtasks a stubbed fetch chain needs, flushing renders between. */
async function settle(result: RenderResult): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
    result.flush();
  }
}

function stubUserFetch(response: Promise<unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => response.then((body) => ({ json: () => body })))
  );
}

async function expectUserResourceStates(
  module: SnippetModule,
  context: ScenarioContext,
  name: string
): Promise<void> {
  const User = component(module, name);

  stubUserFetch(Promise.resolve({ name: 'Ada' }));
  const loaded = context.mount(() => User({ id: '1' }));
  expect(loaded.root.textContent).toBe('Loading...');
  await settle(loaded);
  expect(loaded.root.textContent).toBe('Ada');

  // The runtime logs the failed load; the snippet must still render it.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  stubUserFetch(Promise.reject(new Error('offline')));
  const failed = context.mount(() => User({ id: '2' }));
  await settle(failed);
  expect(failed.root.textContent).toBe('Failed to load user');
}

const scenarios: Record<string, Scenario> = {
  'api-state-derive': {
    run(module, context) {
      const result = context.mount(component(module, 'Counter'));
      const button = result.root.querySelector('button');
      expect(button?.textContent).toBe('Doubled: 0');

      dispatch(button!, 'click');
      result.flush();
      expect(button?.textContent).toBe('Doubled: 2');
    },
  },

  'data-state': {
    run(module, context) {
      const result = context.mount(component(module, 'Counter'));
      const [set, increment] = result.root.querySelectorAll('button');
      const output = result.root.querySelector('output');
      expect(output?.textContent).toBe('0');

      dispatch(set, 'click');
      result.flush();
      expect(output?.textContent).toBe('1');

      dispatch(increment, 'click');
      result.flush();
      expect(output?.textContent).toBe('2');
    },
  },

  'data-derive': {
    run(module, context) {
      const result = context.mount(component(module, 'DoubledCounter'));
      const button = result.root.querySelector('button');
      expect(button?.textContent).toBe('0 doubled is 0');

      dispatch(button!, 'click');
      result.flush();
      expect(button?.textContent).toBe('1 doubled is 2');
    },
  },

  'data-resource-user-card': {
    run: (module, context) =>
      expectUserResourceStates(module, context, 'UserCard'),
  },

  'quick-start-user': {
    run: (module, context) => expectUserResourceStates(module, context, 'User'),
  },

  'resources-user-card': {
    run: (module, context) =>
      expectUserResourceStates(module, context, 'UserCard'),
  },

  'runtime-enforcement-conditional-hook': {
    run(module, context) {
      const result = context.mount(component(module, 'Component'));
      const button = result.root.querySelector('button');
      expect(button, 'snippet should render a button').not.toBeNull();

      // The click handler's re-render throws inside a DOM event listener,
      // which jsdom reports to window 'error' listeners.
      const errors: unknown[] = [];
      const onError = (event: ErrorEvent): void => {
        errors.push(event.error);
        event.preventDefault();
      };
      window.addEventListener('error', onError);
      try {
        dispatch(button!, 'click');
        result.flush();
      } catch (error) {
        errors.push(error);
      } finally {
        window.removeEventListener('error', onError);
      }

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toMatch(
        /render-scoped hook sequence changed/
      );
    },
  },

  'runtime-enforcement-render-mutation': {
    run(module, context) {
      let thrown: unknown;
      try {
        context.mount(component(module, 'Component'));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      // The error block quoted right after the snippet must be the message
      // users actually see.
      expect(context.nextFence?.trim()).toBe((thrown as Error).message);
    },
  },

  'ssr-document': {
    files: {
      'routes.tsx': [
        "import { createRouteRegistry, route } from '@askrjs/askr/router';",
        '',
        'export const registry = createRouteRegistry(() => {',
        "  route('/', () => <main>Home</main>);",
        '});',
        '',
      ].join('\n'),
    },
    run(module) {
      const html = module.html as string;
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      expect(parsed.title).toBe('/');
      expect(parsed.querySelector('main')?.textContent).toBe('Home');

      const document = module.document as (args: unknown) => string;
      expect(typeof document).toBe('function');
      const pathname = '/</title><script>alert(1)</script>';
      const injected = new DOMParser().parseFromString(
        document({
          appHtml: '<main></main>',
          context: { pathname, params: {}, search: '', hash: '' },
        }),
        'text/html'
      );
      expect(injected.title).toBe(pathname);
      expect(injected.querySelector('script')).toBeNull();
    },
  },
};

const snippets = extractRunnableSnippets();

describe('runnable docs snippets', () => {
  it('should pair every run-marked snippet with exactly one scenario', () => {
    const ids = snippets.map((snippet) => snippet.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(scenarios).sort());
  });

  for (const snippet of snippets) {
    const label = `${path.relative(rootDir, snippet.filePath)} (${snippet.id})`;
    it(`should run ${label}`, async () => {
      const scenario = scenarios[snippet.id];
      expect(scenario, `missing scenario for ${snippet.id}`).toBeDefined();
      const module = await importSnippet(snippet, scenario);
      await scenario.run(module, {
        nextFence: /```[^\n]*\n([\s\S]*?)```/.exec(snippet.after)?.[1],
        mount(value) {
          const result = render(value as () => never);
          mounted.push(result);
          return result;
        },
      });
    });
  }
});
