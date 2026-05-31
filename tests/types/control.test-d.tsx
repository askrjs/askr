import { expectAssignable, expectError, expectType } from 'tsd';
import {
  Case,
  For,
  Match,
  Show,
  type CaseProps,
  type ForProps,
  type MatchProps,
  type ShowProps,
} from '@askrjs/askr';
import type { JSXElement } from '@askrjs/askr/foundations';

const keyedForProps: ForProps<number> = {
  each: [1, 2, 3],
  by: (item) => item,
  fallback: <span>empty</span>,
  children: (item, index) => {
    expectType<number>(item);
    expectType<number>(index());
    return <span>{item}</span>;
  },
};

expectAssignable<ForProps<number>>(keyedForProps);
expectType<JSXElement>(For(keyedForProps));
expectAssignable<JSXElement>(
  <For
    each={[1, 2, 3]}
    by={(item: number) => item}
    fallback={<span>empty</span>}
  >
    {(item: number, index) => {
      expectType<number>(item);
      expectType<number>(index());
      return <span>{item + index()}</span>;
    }}
  </For>
);

expectError(
  For<number>({
    each: [1, 2, 3],
    by: (item: number) => item,
    byIndex: true,
    children: () => <span />,
  })
);

expectError(
  For<number>({
    each: [1, 2, 3],
    children: () => <span />,
  })
);

expectError(
  For<number>({
    each: [1, 2, 3],
    by: (item: number) => item > 1,
    children: () => <span />,
  })
);

const showProps: ShowProps<string | null> = {
  when: 'ready' as string | null,
  fallback: <span>loading</span>,
  children: (value) => {
    expectType<string>(value);
    return <span>{value}</span>;
  },
};

expectAssignable<ShowProps<string | null>>(showProps);
expectType<JSXElement>(Show(showProps));
expectAssignable<JSXElement>(
  <Show when={'ready' as string | null} fallback={<span>loading</span>}>
    {(value) => {
      expectType<string>(value);
      return <span>{value}</span>;
    }}
  </Show>
);

expectError(
  Show<string | null>({
    when: 'ready' as string | null,
    children: (value: number) => value as never,
  })
);

const matchProps: MatchProps = {
  key: 'ready',
  when: true,
  children: <span>ready</span>,
};

expectAssignable<MatchProps>(matchProps);
expectType<null>(Match(matchProps));

const caseProps: CaseProps = {
  fallback: <span>fallback</span>,
  children: [
    <Match when={false}>hidden</Match>,
    <Match key="ready" when="ready">
      <span>ready</span>
    </Match>,
  ],
};

expectAssignable<CaseProps>(caseProps);
expectType<JSXElement>(Case(caseProps));

expectAssignable<JSXElement>(
  <Case fallback={<span>fallback</span>}>
    <Match when={false}>hidden</Match>
    <Match key="ready" when="ready">
      <span>ready</span>
    </Match>
  </Case>
);

expectError(
  Match({
    key: true,
    when: true,
    children: <span>bad</span>,
  })
);
