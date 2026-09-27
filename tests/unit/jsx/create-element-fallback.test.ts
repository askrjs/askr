import ts from '@typescript/typescript6';
import { describe, expect, it } from 'vite-plus/test';
import * as root from '../../../src/index';

describe('createElement fallback for key after spread', () => {
  it('should be the import the automatic JSX transform emits for a key after a spread', () => {
    const { outputText } = ts.transpileModule(
      'declare const props: object; declare const id: string; declare function Row(p: object): null;\nexport const row = <Row {...props} key={id} />;',
      {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: '@askrjs/askr',
          module: ts.ModuleKind.ESNext,
        },
        fileName: 'row.tsx',
      }
    );

    expect(outputText).toMatch(
      /import \{ createElement as \w+ \} from "@askrjs\/askr"/
    );
    expect(typeof (root as Record<string, unknown>).createElement).toBe(
      'function'
    );
  });

  it('should build an element with the key taken out of props and children from arguments', () => {
    const createElement = (root as Record<string, unknown>).createElement as (
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => { type: unknown; key: unknown; props: Record<string, unknown> };
    const Row = () => null;

    const single = createElement(Row, { label: 'a', key: 'r1' }, 'child');
    expect(single.type).toBe(Row);
    expect(single.key).toBe('r1');
    expect(single.props).toEqual({ label: 'a', children: 'child' });

    const many = createElement('ul', { key: 7 }, 'a', 'b');
    expect(many.key).toBe(7);
    expect(many.props).toEqual({ children: ['a', 'b'] });

    const bare = createElement('br', null);
    expect(bare.key).toBeNull();
    expect(bare.props).toEqual({});
  });
});
