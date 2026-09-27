import { expectAssignable, expectError, expectType } from 'tsd';
import { derive, state } from '@askrjs/askr';
import {
  Case,
  For,
  Match,
  Show,
  type CaseProps,
  type ForGetterProps,
  type ForProps,
  type MatchProps,
  type ShowProps,
} from '@askrjs/askr/control';
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

// `each` accepts a state getter: its items are the state's elements, not the
// [getter, setter] pair a State also iterates as for destructuring.
type EachRow = { id: number; label: string };
function StateEach() {
  const rows = state<EachRow[]>([]);
  return (
    <For each={rows} by={(row) => row.id}>
      {(row) => {
        expectType<EachRow>(row);
        return <p>{row.label}</p>;
      }}
    </For>
  );
}
function ArrayEach() {
  const rows: EachRow[] = [];
  return (
    <For each={rows} by={(row) => row.id}>
      {(row) => {
        expectType<EachRow>(row);
        return <p>{row.label}</p>;
      }}
    </For>
  );
}
function GetterEach() {
  return (
    <For each={() => [] as EachRow[]} by={(row) => row.id}>
      {(row) => {
        expectType<EachRow>(row);
        return <p>{row.label}</p>;
      }}
    </For>
  );
}
void [StateEach, ArrayEach, GetterEach];

// `when` accepts a state getter: the child receives the state's value.
type WhenUser = { name: string };
function StateWhen() {
  const user = state<WhenUser | null>(null);
  return (
    <Show when={user}>
      {(value) => {
        expectType<WhenUser>(value);
        return <p>{value.name}</p>;
      }}
    </Show>
  );
}
void StateWhen;

// A nullable state getter or derive() result is a getter source too; the
// runtime renders nothing for null and undefined.
function NullableStateEach() {
  const rows = state<EachRow[] | null>(null);
  return (
    <For each={rows} by={(row) => row.id}>
      {(row) => {
        expectType<EachRow>(row);
        return <p>{row.label}</p>;
      }}
    </For>
  );
}
function IndexedStateEach() {
  const rows = state<EachRow[] | undefined>(undefined);
  return (
    <For each={rows} byIndex>
      {(row, index) => {
        expectType<EachRow>(row);
        return <p>{index()}</p>;
      }}
    </For>
  );
}
void [NullableStateEach, IndexedStateEach];
// A getter that does not return a list is rejected, not read as an array.
function NonListEach() {
  const count = state(0);
  return expectError(
    <For each={count} byIndex>
      {() => <p />}
    </For>
  );
}
void NonListEach;

// derive(source, map) results can be null before the source resolves.
function DerivedEach() {
  const source = state<EachRow[] | null>(null);
  const rows = derive(source, (list) => list);
  return (
    <For each={rows} by={(row) => row.id}>
      {(row) => {
        expectType<EachRow>(row);
        return <p>{row.label}</p>;
      }}
    </For>
  );
}
void DerivedEach;

// ForGetterProps types wrapper props whose list comes from a getter.
expectAssignable<ForGetterProps<EachRow, number>>({
  each: () => [] as EachRow[],
  by: (row: EachRow) => row.id,
  children: (row: EachRow) => <p>{row.label}</p>,
});
expectError<ForGetterProps<EachRow>>({
  each: [] as EachRow[],
  byIndex: true,
  children: () => null,
});
