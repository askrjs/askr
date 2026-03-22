import test from 'node:test';
import { RuleTester } from 'eslint';

import rule from './no-hardcoded-theme-tokens.js';

test('no-hardcoded-theme-tokens rule', () => {
  const tester = new RuleTester({
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  });

  tester.run('no-hardcoded-theme-tokens', rule, {
    valid: [
      {
        code: "const cls = 'button-primary';",
        filename: 'src/components/button.tsx',
      },
      {
        code: "const value = 'var(--ak-color-primary)';",
        filename: 'tests/button.test.tsx',
      },
      {
        code: "const style = '--ak-color-primary';",
        filename: 'src/components/theme.tsx',
        options: [{ allowList: ['--ak-color-primary'] }],
      },
    ],
    invalid: [
      {
        code: "const style = '--ak-color-primary';",
        filename: 'src/components/theme.tsx',
        errors: [{ messageId: 'hardcodedToken' }],
      },
      {
        code: 'const style = `padding: var(--ak-space-md);`;',
        filename: 'src/components/layout.tsx',
        errors: [{ messageId: 'hardcodedToken' }],
      },
    ],
  });
});
