import type { AppRenderRuntime } from './app-render-runtime';

/**
 * What the router knows about a mounted application root: its current render
 * runtime. Boot owns the root itself and applies route updates through the
 * root update host.
 */
export interface AppRootHandle {
  readonly appRuntime: AppRenderRuntime | undefined;
}
