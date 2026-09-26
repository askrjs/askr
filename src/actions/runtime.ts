import { currentAppRuntime as getCurrentAppRenderRuntime } from '../core/api/hooks';

const emptyFramework = Object.freeze({}) as Readonly<Record<string, unknown>>;

/** @internal Read Askr-owned state from the current application root. */
export function readActionFramework(): Readonly<Record<string, unknown>> {
  return getCurrentAppRenderRuntime()?.framework ?? emptyFramework;
}
