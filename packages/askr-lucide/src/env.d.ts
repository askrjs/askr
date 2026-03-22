// Module declaration for @askrjs/askr/jsx-runtime.
// The askr package builds its JS bundle for jsx-runtime via Vite, but the
// corresponding .d.ts file is not emitted by tsc (it lands at dist/jsx/jsx-runtime.d.ts
// rather than the dist/jsx-runtime.d.ts path the exports map declares).
// This declaration bridges that gap for local development.
// See: https://www.typescriptlang.org/tsconfig#jsxImportSource

// Load @askrjs/askr's type graph so that the global JSX namespace
// (JSX.Element, JSX.IntrinsicElements) is available in all src files,
// even those that don't import from @askrjs/askr directly.
/// <reference types="@askrjs/askr" />

declare module '@askrjs/askr/jsx-runtime' {
  type JSXElement = {
    $$typeof: symbol;
    type: unknown;
    props: Record<string, unknown>;
    key?: string | number | null;
  };

  export function jsx(
    type: unknown,
    props: Record<string, unknown> | null,
    key?: string | number
  ): JSXElement;

  export function jsxs(
    type: unknown,
    props: Record<string, unknown> | null,
    key?: string | number
  ): JSXElement;

  export function jsxDEV(
    type: unknown,
    props: Record<string, unknown> | null,
    key?: string | number
  ): JSXElement;

  export const Fragment: symbol;
}
