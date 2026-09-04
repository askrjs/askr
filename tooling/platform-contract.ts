export const packageAliasEntries = [
  ['@askrjs/askr/components', 'src/compatibility/entries/components.ts'],
  ['@askrjs/askr/jsx-runtime', 'src/compatibility/entries/jsx-runtime.ts'],
  [
    '@askrjs/askr/jsx-dev-runtime',
    'src/compatibility/entries/jsx-dev-runtime.ts',
  ],
  ['@askrjs/askr/boot', 'src/compatibility/entries/boot.ts'],
  ['@askrjs/askr/control', 'src/compatibility/entries/control.ts'],
  ['@askrjs/askr/data', 'src/compatibility/entries/data.ts'],
  ['@askrjs/askr/testing', 'src/compatibility/entries/testing.ts'],
  ['@askrjs/askr/foundations', 'src/compatibility/entries/foundations.ts'],
  [
    '@askrjs/askr/foundations/utilities',
    'src/compatibility/entries/foundations-utilities.ts',
  ],
  [
    '@askrjs/askr/foundations/interactions',
    'src/compatibility/entries/foundations-interactions.ts',
  ],
  [
    '@askrjs/askr/foundations/state',
    'src/compatibility/entries/foundations-state.ts',
  ],
  [
    '@askrjs/askr/foundations/structures',
    'src/compatibility/entries/foundations-structures.ts',
  ],
  [
    '@askrjs/askr/foundations/icon',
    'src/compatibility/entries/foundations-icon.ts',
  ],
  ['@askrjs/askr/resources', 'src/compatibility/entries/resources.ts'],
  ['@askrjs/askr/fx', 'src/compatibility/entries/fx.ts'],
  ['@askrjs/askr/router', 'src/compatibility/entries/router.ts'],
  ['@askrjs/askr/actions', 'src/compatibility/entries/actions.ts'],
  ['@askrjs/askr/ssr', 'src/compatibility/entries/ssr.ts'],
  ['@askrjs/askr/ssg', 'src/compatibility/entries/ssg.ts'],
  ['@askrjs/askr', 'src/compatibility/entries/index.ts'],
] as const;

export const buildInputEntries = [
  ['index', 'src/compatibility/entries/index.ts'],
  ['components/index', 'src/compatibility/entries/components.ts'],
  ['boot/index', 'src/compatibility/entries/boot.ts'],
  ['control/index', 'src/compatibility/entries/control.ts'],
  ['data/index', 'src/compatibility/entries/data.ts'],
  ['testing/index', 'src/compatibility/entries/testing.ts'],
  ['foundations/index', 'src/compatibility/entries/foundations.ts'],
  [
    'foundations/utilities/index',
    'src/compatibility/entries/foundations-utilities.ts',
  ],
  [
    'foundations/interactions/index',
    'src/compatibility/entries/foundations-interactions.ts',
  ],
  ['foundations/state/index', 'src/compatibility/entries/foundations-state.ts'],
  [
    'foundations/structures/index',
    'src/compatibility/entries/foundations-structures.ts',
  ],
  ['foundations/icon/index', 'src/compatibility/entries/foundations-icon.ts'],
  ['resources/index', 'src/compatibility/entries/resources.ts'],
  ['fx/index', 'src/compatibility/entries/fx.ts'],
  ['router/index', 'src/compatibility/entries/router.ts'],
  ['actions/index', 'src/compatibility/entries/actions.ts'],
  ['ssr/index', 'src/compatibility/entries/ssr.ts'],
  ['ssg/index', 'src/compatibility/entries/ssg.ts'],
  ['jsx-runtime', 'src/compatibility/entries/jsx-runtime.ts'],
  ['jsx-dev-runtime', 'src/compatibility/entries/jsx-dev-runtime.ts'],
  ['benchmark', 'src/bench/benchmark-entry.tsx'],
] as const;
