export type ExecutionModel = 'spa' | 'islands' | 'ssr';

const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');

export function getExecutionModel(): ExecutionModel | undefined {
  const g = globalThis as unknown as Record<string | symbol, unknown>;
  return g[EXECUTION_MODEL_KEY] as ExecutionModel | undefined;
}

export function assertExecutionModel(model: ExecutionModel): void {
  // Mixing execution models is forbidden: once an app starts in one model,
  // attempting to start another is an invariant violation.
  const g = globalThis as unknown as Record<string | symbol, unknown>;
  const cur = g[EXECUTION_MODEL_KEY] as ExecutionModel | undefined;
  if (cur && cur !== model) {
    throw new Error(
      `[Askr] mixing execution models is not allowed (current: ${cur}, attempted: ${model}). ` +
        `Choose exactly one: createSPA, createSSR, or createIslands.`
    );
  }
  if (!cur) g[EXECUTION_MODEL_KEY] = model;
}
