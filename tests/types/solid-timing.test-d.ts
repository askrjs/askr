import { expectType, expectError } from 'tsd';
import { debounce, throttle, raf } from '@askrjs/askr/fx';

function numeric(this: { value: number }, increment: number): number {
  return this.value + increment;
}
const receiver = { value: 1 };
const delayed = debounce(numeric, 10);
const limited = throttle(numeric, 10);
const framed = raf(numeric);
expectType<void>(delayed.call(receiver, 2));
expectType<void>(limited.call(receiver, 2));
expectType<void>(framed.call(receiver, 2));
expectError(delayed.call(receiver, 'wrong'));
expectError(limited.call({}, 2));
expectError(framed.call({}, 2));
expectType<void>(debounce(async () => 42, 10)());
