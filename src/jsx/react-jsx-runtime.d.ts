// Provide a lightweight declaration so TypeScript can resolve the automatic JSX runtime
// to our local runtime implementation during editor/TS server checks.

export { jsx, jsxs, Fragment } from './jsx-runtime';

declare module 'react/jsx-runtime' {
  export { jsx, jsxs, Fragment } from './jsx-runtime';
}
