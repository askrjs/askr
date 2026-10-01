import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { For } from '../../../src/control';
import { state, type State } from '../../../src/core/api/state';
import { createRoot, type Root } from '../../../src/core/dom/root';
import {
  clearScheduler,
  flushSync,
} from '../../../src/core/reactive/scheduler';

let root: Root | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  root?.dispose();
  root = undefined;
  clearScheduler();
});

class Account {
  #label: string;

  constructor(
    readonly id: number,
    label: string
  ) {
    this.#label = label;
  }

  get label(): string {
    return this.#label;
  }

  describe(): string {
    return `${this.id}:${this.#label}`;
  }
}

describe('For instance items', () => {
  it('should render native Date methods and keeps positional row identity when the date changes', () => {
    const container = document.createElement('div');
    const initial = new Date('2020-01-01T00:00:00Z');
    const replacement = new Date('2025-01-01T00:00:00Z');
    let dates!: State<Date[]>;
    const received: Date[] = [];
    const renderDate = (date: Date) => {
      received.push(date);
      return <output>{`${date.getUTCFullYear()}:${date.getTime()}`}</output>;
    };
    function App() {
      dates = state([initial]);
      return (
        <For each={dates} byIndex>
          {renderDate}
        </For>
      );
    }

    root = createRoot(container);
    root.render(<App />);
    flushSync();
    const output = container.querySelector('output');
    expect(output?.textContent).toBe(`2020:${initial.getTime()}`);
    expect(received.at(-1)).toBe(initial);

    dates.set([replacement]);
    flushSync();

    expect(container.querySelector('output')).toBe(output);
    expect(output?.textContent).toBe(`2025:${replacement.getTime()}`);
    expect(received.at(-1)).toBe(replacement);
  });

  it('should preserve class identity, private accessors, and method receivers', () => {
    const container = document.createElement('div');
    const account = new Account(1, 'Alpha');
    let received!: Account;
    root = createRoot(container);

    root.render(
      <For each={[account]} by={(item) => item.id}>
        {(item) => {
          received = item;
          return <output>{`${item.label}/${item.describe()}`}</output>;
        }}
      </For>
    );

    expect(container.textContent).toBe('Alpha/1:Alpha');
    expect(received).toBe(account);
    expect(received.describe).toBe(account.describe);
  });

  it('should keep keyed row state and current class data through replacement and reorder', () => {
    const container = document.createElement('div');
    const first = new Account(1, 'Alpha');
    const second = new Account(2, 'Beta');
    let accounts!: State<Account[]>;
    const renderAccount = (item: Account) => {
      const count = state(0);
      return (
        <button
          data-id={String(item.id)}
          onClick={() => count.set((value) => value + 1)}
        >
          {() => `${item.describe()}:${count()}`}
        </button>
      );
    };
    function App() {
      accounts = state([first, second]);
      return (
        <For each={accounts} by={(item) => item.id}>
          {renderAccount}
        </For>
      );
    }

    root = createRoot(container);
    root.render(<App />);
    flushSync();
    const alpha = container.querySelector<HTMLButtonElement>('[data-id="1"]')!;
    const beta = container.querySelector<HTMLButtonElement>('[data-id="2"]')!;
    alpha.click();
    flushSync();
    expect(alpha.textContent).toBe('1:Alpha:1');

    accounts.set([
      new Account(2, 'Beta updated'),
      new Account(1, 'Alpha updated'),
    ]);
    flushSync();

    expect(container.querySelector('[data-id="1"]')).toBe(alpha);
    expect(container.querySelector('[data-id="2"]')).toBe(beta);
    expect(container.querySelectorAll('button')[0]).toBe(beta);
    expect(alpha.textContent).toBe('1:Alpha updated:1');
    expect(beta.textContent).toBe('2:Beta updated:0');
    alpha.click();
    flushSync();
    expect(alpha.textContent).toBe('1:Alpha updated:2');
    expect(first.describe()).toBe('1:Alpha');
  });

  it('should render Map methods and updates an instance in a retained positional row', () => {
    const container = document.createElement('div');
    let maps!: State<Array<Map<string, string>>>;
    const renderMap = (item: Map<string, string>) => (
      <output>{item.get('label')}</output>
    );
    function App() {
      maps = state([new Map([['label', 'Alpha']])]);
      return (
        <For each={maps} byIndex>
          {renderMap}
        </For>
      );
    }

    root = createRoot(container);
    root.render(<App />);
    const output = container.querySelector('output');
    expect(output?.textContent).toBe('Alpha');

    maps.set([new Map([['label', 'Beta']])]);
    flushSync();

    expect(container.querySelector('output')).toBe(output);
    expect(output?.textContent).toBe('Beta');
  });

  it('should update between plain records and class instances under one positional key', () => {
    const container = document.createElement('div');
    let items!: State<Array<{ label: string } | Account>>;
    const renderItem = (item: { label: string } | Account) => (
      <output>{item instanceof Account ? item.describe() : item.label}</output>
    );
    function App() {
      items = state<Array<{ label: string } | Account>>([{ label: 'plain' }]);
      return (
        <For each={items} byIndex>
          {renderItem}
        </For>
      );
    }

    root = createRoot(container);
    root.render(<App />);
    const output = container.querySelector('output');
    expect(output?.textContent).toBe('plain');

    items.set([new Account(1, 'instance')]);
    flushSync();
    expect(output?.textContent).toBe('1:instance');

    items.set([{ label: 'plain again' }]);
    flushSync();
    expect(container.querySelector('output')).toBe(output);
    expect(output?.textContent).toBe('plain again');
  });

  it('should keep null-prototype records on the live overlay path', () => {
    const container = document.createElement('div');
    type RecordItem = { label: string; badge?: string };
    const makeItem = (label: string): RecordItem =>
      Object.assign(Object.create(null), { label }) as RecordItem;
    const initial = makeItem('Alpha');
    const replacement = makeItem('Beta');
    let items!: State<RecordItem[]>;
    let received!: RecordItem;
    const renderItem = (item: RecordItem) => {
      received = item;
      item.badge ??= `badge:${item.label}`;
      return <output>{`${item.label}/${item.badge}`}</output>;
    };
    function App() {
      items = state([initial]);
      return (
        <For each={items} byIndex>
          {renderItem}
        </For>
      );
    }

    root = createRoot(container);
    root.render(<App />);
    const proxy = received;
    expect(Object.getPrototypeOf(proxy)).toBeNull();
    expect(proxy).not.toBe(initial);
    expect(initial.badge).toBeUndefined();
    expect(container.textContent).toBe('Alpha/badge:Alpha');

    items.set([replacement]);
    flushSync();

    expect(received).toBe(proxy);
    expect(container.textContent).toBe('Beta/badge:Alpha');
    expect(replacement.badge).toBeUndefined();
  });

  it('should restore class row data after structural commit abort and accepts a later retry', () => {
    const container = document.createElement('div');
    const initial = new Account(1, 'committed');
    const rejected = new Account(1, 'discarded');
    const renderAccount = (item: Account) => {
      const count = state(0);
      return (
        <button onClick={() => count.set((value) => value + 1)}>
          {() => `${item.describe()}:${count()}`}
        </button>
      );
    };
    const tree = (item: Account, extra = false) => (
      <>
        <For each={[item]} by={(account) => account.id}>
          {renderAccount}
        </For>
        {extra ? <i>extra</i> : null}
      </>
    );
    root = createRoot(container);
    root.render(tree(initial));
    flushSync();
    const button = container.querySelector('button')!;
    button.click();
    flushSync();
    expect(button.textContent).toBe('1:committed:1');

    const prepared = root.prepare(tree(rejected, true));
    const failure = new Error('structural placement failed');
    const insertion = vi
      .spyOn(container, 'insertBefore')
      .mockImplementationOnce(() => {
        throw failure;
      });
    expect(() => prepared.commit()).toThrow(failure);
    expect(prepared.aborted).toBe(true);
    insertion.mockRestore();
    flushSync();

    expect(container.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('1:committed:1');
    expect(container.querySelector('i')).toBeNull();
    button.click();
    flushSync();
    expect(button.textContent).toBe('1:committed:2');

    root.render(tree(rejected, true));
    flushSync();
    expect(container.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('1:discarded:2');
    expect(container.querySelector('i')?.textContent).toBe('extra');
  });
});
