import { expectError, expectType } from 'tsd';
import {
  derive,
  getSignal,
  selector,
  state,
  type Derived,
  type Selector,
  type State,
  type StateSetter,
  type StateTuple,
} from '@askrjs/askr';

const count = state(0);
const [countValue, setCountValue] = count;

expectType<State<number>>(countValue);
expectType<StateSetter<number>>(setCountValue);
expectType<StateTuple<number>>(count);
expectType<number>(countValue());

setCountValue(1);
setCountValue((value) => {
  expectType<number>(value);
  return value + 1;
});

expectError(setCountValue('wrong'));
expectError(
  setCountValue((value) => {
    expectType<number>(value);
    return 'wrong';
  })
);

type Formatter = (value: number) => string;

const formatterState = state<Formatter>((value) => value.toString());
const [formatter, setFormatter] = formatterState;

expectType<State<Formatter>>(formatter);
expectType<StateSetter<Formatter>>(setFormatter);
expectType<Formatter>(formatter());

setFormatter(() => (value) => value.toFixed(0));

const hexFormatter: Formatter = (value) => value.toString(16);
expectError(setFormatter(hexFormatter));
expectError(setFormatter(() => 'not-a-formatter'));

const nullableFormatterState = state<Formatter | null>(null);
const [, setNullableFormatter] = nullableFormatterState;

expectType<StateSetter<Formatter | null>>(setNullableFormatter);
setNullableFormatter(() => hexFormatter);
setNullableFormatter(() => null);
expectError(setNullableFormatter(hexFormatter));

const doubled = derive(() => countValue() * 2);
expectType<Derived<number>>(doubled);
expectType<number>(doubled());

const countText = derive(countValue, (value) => value.toString());
expectType<Derived<string | null>>(countText);
expectType<string | null>(countText());

const rounded = derive(
  () => countValue(),
  (value) => value.toFixed(0)
);
expectType<Derived<string | null>>(rounded);

expectError(derive(123));

const selectedId = state<number | null>(null);
const isSelected = selector(selectedId);
expectType<Selector<number | null>>(isSelected);
expectType<boolean>(isSelected(42));
expectType<boolean>(isSelected(null));
expectError(isSelected('42'));

const sameId = selector(selectedId, (left, right) => left === right);
expectType<Selector<number | null>>(sameId);
expectType<boolean>(sameId(1));

expectError(
  selector(selectedId, (left: string, right: string) => left === right)
);

expectType<AbortSignal>(getSignal());
