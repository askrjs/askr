export type ExecutionModel = 'spa' | 'islands' | 'ssr';

const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');

const TEST_MODEL_KEY = Symbol.for('__ASKR_TEST_EXECUTION_MODEL__');
const globals = globalThis as typeof globalThis & {
  [EXECUTION_MODEL_KEY]?: ExecutionModel;
  [TEST_MODEL_KEY]?: { model: ExecutionModel; mounts: number };
};

export function getExecutionModel(): ExecutionModel | undefined {
  return globals[EXECUTION_MODEL_KEY] ?? globals[TEST_MODEL_KEY]?.model;
}

function checkModel(model: ExecutionModel): void {
  const cur = getExecutionModel();
  if (cur && cur !== model) {
    throw new Error(
      `[Askr] mixing execution models is not allowed (current: ${cur}, attempted: ${model}). ` +
        `Choose exactly one: createSPA/hydrateSPA or createIslands.`
    );
  }
}

export function assertExecutionModel(model: ExecutionModel): void {
  checkModel(model);
  globals[EXECUTION_MODEL_KEY] = model;
}

/** Test roots own their model only until the last matching root is cleaned up. */
export function acquireTestExecutionModel(model: ExecutionModel): () => void {
  checkModel(model);
  const state = (globals[TEST_MODEL_KEY] ??= { model, mounts: 0 });
  state.mounts++;
  return () => {
    if (--state.mounts === 0) delete globals[TEST_MODEL_KEY];
  };
}
