import { expectError, expectType } from 'tsd';
import {
  capture,
  getSignal,
  on,
  resource,
  stream,
  task,
  timer,
  type ResourceResult,
} from '@askrjs/askr/resources';

declare const eventSource: EventTarget;
declare const transformer: () => void;

const readonlyDeps = ['user', 1] as const;
const asyncResource = resource(async ({ signal }) => {
  expectType<AbortSignal>(signal);
  return { id: 'user-1' };
}, readonlyDeps);

expectType<ResourceResult<{ id: string }>>(asyncResource);
expectType<{ id: string } | null>(asyncResource.value);
expectType<boolean>(asyncResource.pending);
expectType<Error | null>(asyncResource.error);
expectType<void>(asyncResource.refresh());

const syncResource = resource(({ signal }) => {
  expectType<AbortSignal>(signal);
  return 123;
}, []);

expectType<ResourceResult<number>>(syncResource);
expectType<number | null>(syncResource.value);

expectType<AbortSignal>(getSignal());
expectType<void>(on(eventSource, 'focus', () => {}));
expectType<void>(timer(1000, () => {}));
expectType<void>(task(() => {}));
expectType<void>(task(async () => {}));

const snapshot = capture(() => 123);
expectType<() => number>(snapshot);

const pendingStream = stream<string>('source');
expectType<string | null>(pendingStream.value);
expectType<boolean>(pendingStream.pending);
expectType<Error | null>(pendingStream.error);

expectError(on(eventSource, transformer));
expectError(timer(1000));
