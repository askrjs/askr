import { expectAssignable, expectError, expectType } from 'tsd';
import {
  capture,
  documentVisible,
  getSignal,
  on,
  resource,
  routeActive,
  stream,
  task,
  timer,
  windowFocused,
  type ActivityPredicate,
  type ListenerTarget,
  type ResourceResult,
  type StreamResult,
  type StreamOptions,
  type StreamStatus,
  type TimerOptions,
} from '@askrjs/askr/resources';

declare const eventSource: EventTarget;
declare const transformer: () => void;
declare const resolveEventSource: () => EventTarget | null;
expectAssignable<ListenerTarget>(resolveEventSource);

const readonlyDeps = ['user', 1] as const;
const streamOptions: StreamOptions<string> = {
  deps: readonlyDeps,
  initialValue: 'cached',
};
expectType<StreamOptions<string>>(streamOptions);
const timerOptions: TimerOptions = { when: [documentVisible()] };
expectType<TimerOptions>(timerOptions);

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
expectType<void>(on(resolveEventSource, 'focus', () => {}));
expectType<void>(on(eventSource, 'focus', () => {}, { passive: true }));
expectType<void>(timer(1000, () => {}));
expectType<void>(timer(1000, () => {}, { when: [routeActive('/dashboard')] }));
expectType<ActivityPredicate>(routeActive('/'));
expectType<ActivityPredicate>(routeActive(['/', '/admin'] as const));
expectType<ActivityPredicate>(documentVisible());
expectType<ActivityPredicate>(windowFocused());
expectType<void>(task(() => {}));
expectType<void>(task(async () => {}));

const snapshot = capture(() => 123);
expectType<() => number>(snapshot);

const pendingStream = stream<string>(
  async function* ({ signal }) {
    expectType<AbortSignal>(signal);
    yield 'value';
  },
  { deps: readonlyDeps, initialValue: 'cached' }
);
expectType<StreamResult<string>>(pendingStream);
expectType<string | null>(pendingStream.value);
expectType<StreamStatus>(pendingStream.status);
expectType<boolean>(pendingStream.pending);
expectType<boolean>(pendingStream.stale);
expectType<Error | null>(pendingStream.error);
expectType<void>(pendingStream.restart());
expectType<void>(pendingStream.close());

expectError(on(eventSource, transformer));
expectError(timer(1000));
expectError(timer(1000, () => {}, { when: [123] }));
expectError(stream('source'));
expectError(stream(() => Promise.resolve('not iterable')));
