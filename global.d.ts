// Global ambient declarations for the workspace
// Ensure TS Server resolves the automatic JSX runtime for editor files

declare module 'react/jsx-runtime' {
  export { jsx, jsxs, Fragment } from './src/jsx/jsx-runtime';
}
