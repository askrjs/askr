import * as root from '@askrjs/askr';
import * as data from '@askrjs/askr/data';
import { replaceDataRuntime } from '@askrjs/askr/boot';
import type { DataRuntime } from '@askrjs/askr/data';

const replace: (root: Element | string, next: DataRuntime) => void =
  replaceDataRuntime;
void replace;
export function invalidReplacementCalls(runtime: DataRuntime): void {
  // @ts-expect-error replacement belongs to the boot owner
  void root.replaceDataRuntime;
  // @ts-expect-error data owns retirement, boot owns app replacement
  void data.replaceDataRuntime;
  // @ts-expect-error a next runtime is required
  replaceDataRuntime(document.body);
  // @ts-expect-error no fallback to the default runtime
  replaceDataRuntime(document.body, undefined);
  // @ts-expect-error no reset/remount option
  replaceDataRuntime(document.body, runtime, { remount: true });
  // @ts-expect-error the first argument identifies an app root
  replaceDataRuntime(runtime, runtime);
}
