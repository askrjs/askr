import ts from 'typescript';
import { expect, it } from 'vite-plus/test';
import { declarationContract } from './declaration-contract';

function contract(text: string, dependencies: Record<string, string> = {}) {
  const file = '/consumer.d.ts';
  const files = { [file]: text, ...dependencies };
  const options = {
    noLib: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  };
  const host = ts.createCompilerHost(options);
  host.fileExists = (name) => name in files;
  host.readFile = (name) => files[name];
  host.getSourceFile = (name) =>
    name in files
      ? ts.createSourceFile(name, files[name]!, ts.ScriptTarget.Latest, true)
      : undefined;
  const program = ts.createProgram(Object.keys(files), options, host);
  return declarationContract(program, [['.', file]], (name) => name in files);
}

it('should detect changes to types reachable only through callbacks', () => {
  const baseline = `
    interface Result { readonly value: string; }
    export declare function observe(callback: (result: Result) => void): void;
  `;
  const snapshot = contract(baseline);
  expect(snapshot.reachable.Result).toEqual([
    'interface Result {\n    readonly value: string;\n}',
  ]);
  expect(
    contract(baseline.replace('value: string', 'value: number'))
  ).not.toEqual(snapshot);
  expect(contract(baseline.replace('readonly value', 'value'))).not.toEqual(
    snapshot
  );
});

it('should detect generic constraints, optional arguments and overload ordering', () => {
  const baseline = `
    export declare function read<T extends string>(value: T, fallback?: T): T;
    export declare function read(value: number): string;
  `;
  const snapshot = contract(baseline);
  expect(
    contract(baseline.replace('extends string', 'extends number'))
  ).not.toEqual(snapshot);
  expect(contract(baseline.replace('fallback?: T', 'fallback: T'))).not.toEqual(
    snapshot
  );
  expect(contract(baseline.split('\n').reverse().join('\n'))).not.toEqual(
    snapshot
  );
});

it('should ignore comments, formatting and private class representation', () => {
  expect(
    contract(`export declare class Runtime {
    private state; /** implementation */
    run(value: string): void;
  }`)
  ).toEqual(
    contract(`export declare class Runtime { private owners; private cache;
  run(value:string):void; }`)
  );
});

it('should distinguish same-named types reached through different imports', () => {
  const dependencies = {
    '/left.d.ts': 'export interface Details { value: string; }',
    '/right.d.ts': 'export interface Details { value: number; }',
  };
  const baseline = `
    import { Details as Left } from './left.js';
    import { Details as Right } from './right.js';
    export declare function first(): Left;
    export declare function second(): Right;
  `;
  const snapshot = contract(baseline, dependencies);
  expect(snapshot.reachable.Details).toBeDefined();
  expect(snapshot.reachable.Details$2).toBeDefined();
  expect(
    contract(baseline.replace('first(): Left', 'first(): Right'), dependencies)
  ).not.toEqual(snapshot);
  expect(
    contract(baseline.replaceAll('Left', 'Renamed'), dependencies)
  ).toEqual(snapshot);
});
