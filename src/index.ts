/**
 * Askr: Actor-backed deterministic UI framework
 *
 * Public API surface — only users should import from here
 */

import { installRendererBridge } from './renderer';

installRendererBridge();

// Runtime primitives
export { state } from './runtime/state';
export type { State, StateSetter, StateTuple } from './runtime/state';
export { derive } from './runtime/derive';
export type { Derived } from './runtime/derive';
export { getSignal } from './runtime/component';
export { selector } from './runtime/selector';
export type { Selector } from './runtime/selector';

// Control flow
export { Case, For, Match, Show } from './control';
export type { CaseProps, ForProps, MatchProps, ShowProps } from './control';

// Context
export { defineContext, readContext } from './runtime/context';
export type { Context } from './runtime/context';

// Re-export JSX runtime for tsconfig jsxImportSource
export { jsx, jsxs, Fragment } from './jsx-runtime';

// Public types
export type { Props } from './common/props';
