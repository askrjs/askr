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
expectAssignable<ForProps<number>>({
  each: [],
  by: (item) => item,
  fallback: [<span key="first">empty</span>, <span key="second">list</span>],
  children: (item) => <span>{item}</span>,
});
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

const readonlyCatalog = [
  { id: 'docs', label: 'Docs' },
  { id: 'api', label: 'API' },
] as const;
type ReadonlyCatalogItem = (typeof readonlyCatalog)[number];

expectAssignable<ForProps<ReadonlyCatalogItem>>({
  each: readonlyCatalog,
  by: (item) => item.id,
  children: (item) => <span>{item.label}</span>,
});
expectAssignable<ForProps<ReadonlyCatalogItem>>({
  each: () => readonlyCatalog,
  by: (item) => item.id,
  children: (item) => <span>{item.label}</span>,
});

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
expectError(
  For<number>({
    each: [1, 2, 3],
    by: (item: number) => item,
    fallback: { invalid: true },
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
expectAssignable<ShowProps<string | null>>({
  when: 'ready' as string | null,
  fallback: [<span key="first">loading</span>, <span key="second">user</span>],
  children: <span>ready</span>,
});
expectAssignable<JSXElement>(
  <Show when={'ready' as string | null} fallback={<span>loading</span>}>
    {(value) => {
      expectType<string>(value);
      return <span>{value}</span>;
    }}
  </Show>
);

expectType<JSXElement>(
  Show<boolean>({
    when: true as boolean,
    children: (value) => {
      expectType<true>(value);
      return <span>{value ? 'yes' : 'no'}</span>;
    },
  })
);

expectAssignable<JSXElement>(
  <Show when={'' as '' | 'ready' | null} fallback={<span>loading</span>}>
    {(value) => {
      expectType<'ready'>(value);
      return <span>{value}</span>;
    }}
  </Show>
);

expectAssignable<JSXElement>(
  <Show when={0 as 0 | 1 | null} fallback={<span>loading</span>}>
    {(value) => {
      expectType<1>(value);
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

expectError(
  Show<boolean>({
    when: true as boolean,
    children: (value: false) => <span>{String(value)}</span>,
  })
);
expectError(
  Show<boolean>({
    when: true as boolean,
    fallback: { invalid: true },
    children: <span>ready</span>,
  })
);

const matchProps: MatchProps = {
  key: 'ready',
  when: true,
  children: <span>ready</span>,
};

expectAssignable<MatchProps>(matchProps);
expectType<null>(Match(matchProps));
expectAssignable<MatchProps>({
  when: true,
  children: [<span key="first">ready</span>, <span key="second">now</span>],
});
expectType<null>(
  Match({
    when: true,
    children: () => <span>ready</span>,
  })
);
expectType<null>(
  Match({
    when: true,
    children: () => [
      <span key="first">ready</span>,
      <span key="second">now</span>,
    ],
  })
);

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
expectAssignable<CaseProps>({
  fallback: [
    <span key="first">fallback</span>,
    <span key="second">state</span>,
  ],
});
expectType<JSXElement>(Case(caseProps));

expectAssignable<JSXElement>(
  <Case fallback={<span>fallback</span>}>
    <Match when={false}>hidden</Match>
    <Match key="ready" when="ready">
      <span>ready</span>
    </Match>
  </Case>
);
expectAssignable<JSXElement>(
  <Case fallback={<span>fallback</span>}>
    <Match when={true}>{() => <span>ready</span>}</Match>
  </Case>
);

expectError(
  Match({
    key: true,
    when: true,
    children: <span>bad</span>,
  })
);
expectError(
  Match({
    when: true,
    children: (value: string) => <span>{value}</span>,
  })
);
expectError(
  Match({
    when: true,
    children: () => ({ invalid: true }),
  })
);
expectError(
  Case({
    fallback: { invalid: true },
    children: <Match when={true}>ready</Match>,
  })
);
