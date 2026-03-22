declare module '@askrjs/askr/jsx-runtime' {
  export function jsx(
    type: unknown,
    props: unknown,
    key?: unknown
  ): JSX.Element;
  export function jsxs(
    type: unknown,
    props: unknown,
    key?: unknown
  ): JSX.Element;
  export const Fragment: unique symbol;
}
