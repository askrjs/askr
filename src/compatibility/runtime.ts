import type { Scheduler } from '../runtime/scheduler';
import {
  createRuntimeState,
  defaultRuntimeState,
  type RuntimeState,
} from '../runtime/runtime-state';
import { adaptRendererHost, rendererHostView } from './renderer';
import type { AskrRuntimeOptions, RuntimeRendererHost } from './contracts/core';

export type {
  AskrRuntimeOptions,
  RuntimeRendererHost,
  RuntimeKeyedReorderDecision,
} from './contracts/core';

const defaultRuntimeOptions: AskrRuntimeOptions = {};

/** A scheduler + renderer host pairing; owns scheduling and renderer wiring for an app instance. */
export class AskrRuntime {
  readonly scheduler: Scheduler;
  private rendererHost: RuntimeRendererHost;
  readonly #state: RuntimeState;

  constructor(options: AskrRuntimeOptions = {}) {
    this.#state =
      options === defaultRuntimeOptions
        ? defaultRuntimeState
        : createRuntimeState(
            options.scheduler as unknown as Scheduler | undefined
          );
    this.scheduler = this.#state.scheduler;
    this.rendererHost =
      options.renderer ?? rendererHostView(this.#state.renderer);
    this.#state.renderer = adaptRendererHost(this.rendererHost);
  }

  get renderer(): RuntimeRendererHost {
    return this.rendererHost;
  }

  configureRenderer(renderer: RuntimeRendererHost): void {
    this.#state.renderer = adaptRendererHost(renderer);
    this.rendererHost = renderer;
  }
}

/** Create a new {@link AskrRuntime} instance with its own scheduler/renderer wiring. */
export function createRuntime(options: AskrRuntimeOptions = {}): AskrRuntime {
  return new AskrRuntime(options);
}

export const defaultRuntime = new AskrRuntime(defaultRuntimeOptions);

/** Get the process-wide default {@link AskrRuntime}. */
export function getDefaultRuntime(): AskrRuntime {
  return defaultRuntime;
}
