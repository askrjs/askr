import path from 'path';

const rootDir = __dirname;

export const benchDefine = {
  'process.env.NODE_ENV': '"production"',
};

export const benchEsbuild = {
  jsx: 'automatic' as const,
  jsxImportSource: '@askrjs/askr',
};

export const benchResolve = {
  alias: {
    '@askrjs/askr/foundations': path.resolve(
      rootDir,
      'src/foundations/index.ts'
    ),
    '@askrjs/askr/resources': path.resolve(rootDir, 'src/resources/index.ts'),
    '@askrjs/askr/fx': path.resolve(rootDir, 'src/fx/index.ts'),
    '@askrjs/askr/router': path.resolve(rootDir, 'src/router/index.ts'),
    '@askrjs/askr/ssr': path.resolve(rootDir, 'src/ssr/index.ts'),
    '@askrjs/askr/ssg': path.resolve(rootDir, 'src/ssg/index.ts'),
    '@askrjs/askr/vite': path.resolve(rootDir, 'src/dev/vite-plugin-askr.ts'),
    '@askrjs/askr/jsx-runtime': path.resolve(rootDir, 'src/jsx/jsx-runtime.ts'),
    '@askrjs/askr/jsx-dev-runtime': path.resolve(
      rootDir,
      'src/jsx/jsx-dev-runtime.ts'
    ),
    '@askrjs/askr/for': path.resolve(rootDir, 'src/for/index.ts'),
    '@askrjs/askr': path.resolve(rootDir, 'src/index.ts'),
  },
};

export const domBenchIncludes = [
  'benches/tier1/**/*.{ts,tsx}',
  'benches/tier2/**/*.{ts,tsx}',
  'benches/tier3/**/*.{ts,tsx}',
  'benches/tier4/**/*.tsx',
];

export const domBenchExcludes = [
  'benches/**/*-ssr-*',
  'benches/shared/_shared.*',
];

export const ssrBenchIncludes = [
  'benches/tier1/**/tier1-hotpath-ssr-*.{ts,tsx}',
  'benches/tier2/**/tier2-subsystem-ssr-*.{ts,tsx}',
];
