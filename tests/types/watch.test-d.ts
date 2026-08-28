import { expectAssignable, expectError, expectType } from 'tsd';
import { derive, state } from '@askrjs/askr';
import {
  watch,
  type WatchCallback,
  type WatchContext,
  type WatchSource,
  type WatchValues,
} from '@askrjs/askr/resources';

const enabled = state(false);
const count = state(1);
const label = derive(() => String(count()));
expectAssignable<WatchSource<boolean>>(enabled);
expectAssignable<WatchCallback<boolean>>((_value, _context) => {});
expectType<[boolean, number, string]>(
  null as unknown as WatchValues<[typeof enabled, typeof count, typeof label]>
);

expectType<void>(
  watch(enabled, (value, context) => {
    expectType<boolean>(value);
    expectType<WatchContext<boolean>>(context);
    expectType<boolean | undefined>(context.previous);
    expectType<AbortSignal>(context.signal);
  })
);

watch([enabled, count, label] as const, (value, context) => {
  expectType<[boolean, number, string]>(value);
  expectType<[boolean, number, string] | undefined>(context.previous);
});

expectError(watch(enabled(), () => {}));
expectError(watch([enabled(), count()] as const, () => {}));
