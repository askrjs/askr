import { expectAssignable, expectError, expectType } from 'tsd';
import {
  debounceEvent,
  idle,
  once,
  raf,
  rafEvent,
  retry,
  scheduleEventHandler,
  scheduleIdle,
  scheduleRetry,
  scheduleTimeout,
  throttle,
  throttleEvent,
  timeout,
  type RetryOptions,
  type RetryOutcome,
  type ThrottleOptions,
} from '@askrjs/askr/fx';

const throttleOptions: ThrottleOptions = {
  leading: false,
  trailing: true,
};
expectAssignable<ThrottleOptions>(throttleOptions);

const retryOptions: RetryOptions = {
  maxAttempts: 2,
  delayMs: 10,
  backoff: (attemptIndex) => attemptIndex + 1,
};
expectAssignable<RetryOptions>(retryOptions);

const throttled = throttle(
  (value: string) => {
    void value;
  },
  10,
  throttleOptions
);
expectType<((value: string) => void) & { cancel(): void }>(throttled);
throttled('value');
throttled.cancel();

const onceOnly = once((value: string) => value.length);
expectType<(value: string) => number>(onceOnly);
expectType<number>(onceOnly('value'));

const rafCallback = raf((value: string) => {
  void value;
});
expectType<((value: string) => void) & { cancel(): void }>(rafCallback);
rafCallback('value');
rafCallback.cancel();

expectType<void>(idle(() => {}, { timeout: 10 }));
expectType<Promise<void>>(timeout(10));
expectType<Promise<number>>(retry(async () => 1, retryOptions));

const debouncedEvent = debounceEvent(10, () => {}, {
  leading: true,
  trailing: false,
});
expectType<EventListener & { cancel(): void; flush(): void }>(debouncedEvent);
debouncedEvent(new Event('click'));
debouncedEvent.cancel();
debouncedEvent.flush();

const throttledEvent = throttleEvent(10, () => {}, throttleOptions);
expectType<EventListener & { cancel(): void }>(throttledEvent);
throttledEvent(new Event('click'));
throttledEvent.cancel();

const rafListener = rafEvent(() => {});
expectType<EventListener & { cancel(): void }>(rafListener);
rafListener(new Event('click'));
rafListener.cancel();

const cancelTimeout = scheduleTimeout(10, () => {});
expectType<() => void>(cancelTimeout);
cancelTimeout();

const cancelIdle = scheduleIdle(() => {}, { timeout: 10 });
expectType<() => void>(cancelIdle);
cancelIdle();

const scheduledRetry = scheduleRetry(async () => 1, retryOptions);
expectType<{
  cancel(): void;
  result: Promise<RetryOutcome<number>>;
}>(scheduledRetry);
scheduledRetry.cancel();

expectType<EventListener>(scheduleEventHandler(() => {}));

expectError(throttle('bad', 10));
