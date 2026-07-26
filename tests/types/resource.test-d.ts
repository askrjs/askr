import { expectAssignable, expectError, expectType } from 'tsd';
import {
  capture,
  documentVisible,
  getSignal,
  on,
  onRouteChange,
  resource,
  routeActive,
  stream,
  task,
  timer,
  windowFocused,
  type ActivityPredicate,
  type ListenerTarget,
  type ResourceResult,
  type RouteChangeCleanup,
  type RouteChangeOptions,
  type TimerOptions,
} from '@askrjs/askr/resources';
import type { RouteChangeCleanup as RouterRouteChangeCleanup } from '@askrjs/askr/router';

declare const eventSource: EventTarget;
declare const transformer: () => void;
declare const resolveEventSource: () => EventTarget | null;
expectAssignable<ListenerTarget>(resolveEventSource);

const readonlyDeps = ['user', 1] as const;
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
expectType<void>(onRouteChange(() => {}));
expectType<RouteChangeCleanup>(() => {});
expectType<RouterRouteChangeCleanup>(() => {});
expectType<void>(
  onRouteChange(
    (current, previous) => {
      current.path;
      previous?.path;
      return () => {};
    },
    { immediate: true } satisfies RouteChangeOptions
  )
);

const snapshot = capture(() => 123);
expectType<() => number>(snapshot);

const pendingStream = stream<string>('source');
expectType<string | null>(pendingStream.value);
expectType<boolean>(pendingStream.pending);
expectType<Error | null>(pendingStream.error);

expectError(on(eventSource, transformer));
expectError(timer(1000));
expectError(timer(1000, () => {}, { when: [123] }));
