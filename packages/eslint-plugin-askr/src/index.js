import noHardcodedThemeTokens from './rules/no-hardcoded-theme-tokens.js';

const plugin = {
  meta: {
    name: '@askrjs/eslint-plugin-askr',
    version: '0.1.0',
  },
  rules: {
    'no-hardcoded-theme-tokens': noHardcodedThemeTokens,
  },
};

export default plugin;
