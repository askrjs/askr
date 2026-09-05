import type { Scheduler } from '../runtime/scheduler';
import {
  createRuntimeState,
  defaultRuntimeState,
  type RuntimeState,
} from '../runtime/runtime-state';
import { adaptRendererHost, rendererHostView } from './renderer';
import type { AskrRuntimeOptions, RuntimeRendererHost } from './contracts/core';
import type { RendererCapabilities } from '../runtime/renderer-capabilities';

export type {
  AskrRuntimeOptions,
  RuntimeRendererHost,
  RuntimeKeyedReorderDecision,
} from './contracts/core';

const defaultRuntimeOptions: AskrRuntimeOptions = {};

/** Construction-only scheduler and renderer wiring. Mounting uses the default runtime. */
export class AskrRuntime {
  readonly scheduler: Scheduler;
  private rendererHost: RuntimeRendererHost;
  #rendererCapabilities: RendererCapabilities;
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
    this.#rendererCapabilities = this.#state.renderer;
  }

  get renderer(): RuntimeRendererHost {
    if (this.#rendererCapabilities !== this.#state.renderer) {
      this.#rendererCapabilities = this.#state.renderer;
      this.rendererHost = rendererHostView(this.#rendererCapabilities);
    }
    return this.rendererHost;
  }

  configureRenderer(renderer: RuntimeRendererHost): void {
    this.#state.renderer = adaptRendererHost(renderer);
    this.#rendererCapabilities = this.#state.renderer;
    this.rendererHost = renderer;
  }
}

/** Create construction-only runtime wiring. Omitted schedulers share the default scheduler; mounting uses the default runtime. */
export function createRuntime(options: AskrRuntimeOptions = {}): AskrRuntime {
  return new AskrRuntime(options);
}

export const defaultRuntime = /* @__PURE__ */ new AskrRuntime(
  defaultRuntimeOptions
);

/** Get the process-wide default {@link AskrRuntime}. */
export function getDefaultRuntime(): AskrRuntime {
  return defaultRuntime;
}
