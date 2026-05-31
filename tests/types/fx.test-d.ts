import { expectAssignable, expectError, expectType } from 'tsd';
import {
  debounce,
  debounceEvent,
  defer,
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
  type DebounceOptions,
  type RetryOptions,
  type ThrottleOptions,
} from '@askrjs/askr/fx';

const debounceOptions: DebounceOptions = {
  leading: true,
  trailing: false,
};
expectAssignable<DebounceOptions>(debounceOptions);

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

const debounced = debounce(
  (value: string) => {
    void value;
  },
  10,
  debounceOptions
);
expectType<((value: string) => void) & { cancel(): void }>(debounced);
debounced('value');
debounced.cancel();

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

expectType<void>(defer(() => {}));

const rafCallback = raf((value: string) => {
  void value;
});
expectType<(value: string) => void>(rafCallback);
rafCallback('value');

expectType<void>(idle(() => {}, { timeout: 10 }));
expectType<Promise<void>>(timeout(10));
expectType<Promise<number>>(retry(async () => 1, retryOptions));

const debouncedEvent = debounceEvent(10, () => {}, debounceOptions);
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
expectType<{ cancel(): void }>(scheduledRetry);
scheduledRetry.cancel();

expectType<EventListener>(scheduleEventHandler(() => {}));

expectError(debounce('bad', 10));
expectError(throttle('bad', 10));
