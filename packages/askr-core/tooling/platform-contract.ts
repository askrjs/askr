export const packageAliasEntries = [
  ['@askrjs/askr/jsx-runtime', 'src/jsx/jsx-runtime.ts'],
  ['@askrjs/askr/jsx-dev-runtime', 'src/jsx/jsx-dev-runtime.ts'],
  ['@askrjs/askr/for', 'src/for/index.ts'],
  ['@askrjs/askr/foundations', 'src/foundations/index.ts'],
  ['@askrjs/askr/resources', 'src/resources/index.ts'],
  ['@askrjs/askr/fx', 'src/fx/index.ts'],
  ['@askrjs/askr/router', 'src/router/index.ts'],
  ['@askrjs/askr/ssr', 'src/ssr/index.ts'],
  ['@askrjs/askr/ssg', 'src/ssg/index.ts'],
  ['@askrjs/askr', 'src/index.ts'],
] as const;

export const buildInputEntries = [
  ['index', 'src/index.ts'],
  ['boot/index', 'src/boot/index.ts'],
  ['for/index', 'src/for/index.ts'],
  ['foundations/index', 'src/foundations/index.ts'],
  ['resources/index', 'src/resources/index.ts'],
  ['fx/index', 'src/fx/index.ts'],
  ['router/index', 'src/router/index.ts'],
  ['ssr/index', 'src/ssr/index.ts'],
  ['ssg/index', 'src/ssg/index.ts'],
  ['jsx-runtime', 'src/jsx/jsx-runtime.ts'],
  ['jsx-dev-runtime', 'src/jsx/jsx-dev-runtime.ts'],
  ['benchmark', 'src/bench/benchmark-entry.tsx'],
] as const;
