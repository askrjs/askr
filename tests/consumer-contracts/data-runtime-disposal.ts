import * as root from '@askrjs/askr';
import {
  createDataRuntime,
  disposeDataRuntime,
  type DataRuntime,
} from '@askrjs/askr/data';

const retire: (runtime: DataRuntime) => void = disposeDataRuntime;
const runtime = createDataRuntime();
const result: void = retire(runtime);
void result;
export function invalidRetirementCalls(): void {
  // @ts-expect-error retirement belongs to the data entrypoint
  void root.disposeDataRuntime;
  // @ts-expect-error the runtime is required
  disposeDataRuntime();
  // @ts-expect-error no reset or reuse option is supported
  disposeDataRuntime(runtime, { reset: true });
  // @ts-expect-error not a data runtime
  disposeDataRuntime({});
}
