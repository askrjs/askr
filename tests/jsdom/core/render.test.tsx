import { describe, expect, it } from 'vitest';
import { createRoot } from '../../../src/core/dom/root';
import { state, derive } from '../../../src/core/api/state';
import { flushSync } from '../../../src/core/reactive/scheduler';

function mount(view: unknown) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(view);
  return { el, root };
}

describe('core renderer', () => {
  it('renders and updates a stateful component', () => {
    let setCount!: (n: number) => void;
    let renders = 0;
    function Counter() {
      renders++;
      const [count, set] = state(0);
      setCount = set as never;
      const double = derive(() => count() * 2);
      return (
        <p class="c">
          {count()} x2={double()}
        </p>
      );
    }
    const { el } = mount(<Counter />);
    expect(el.innerHTML).toBe('<p class="c">0 x2=0</p>');
    const p = el.firstChild;
    setCount(2);
    flushSync();
    expect(el.innerHTML).toBe('<p class="c">2 x2=4</p>');
    expect(el.firstChild).toBe(p);
    expect(renders).toBe(2);
  });

  it('keeps multi-node component output transparent and keyed moves stable', () => {
    let setItems!: (v: number[]) => void;
    function Pair() {
      return (
        <>
          <b>a</b>
          <i>b</i>
        </>
      );
    }
    function List() {
      const [items, set] = state([1, 2, 3]);
      setItems = set as never;
      return (
        <ul>
          {items().map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      );
    }
    const { el } = mount(
      <div>
        <Pair />|<List />
      </div>
    );
    expect(el.innerHTML).toBe(
      '<div><b>a</b><i>b</i>|<ul><li>1</li><li>2</li><li>3</li></ul></div>'
    );
    const lis = [...el.querySelectorAll('li')];
    setItems([3, 1, 2]);
    flushSync();
    expect(el.querySelector('ul')!.innerHTML).toBe(
      '<li>3</li><li>1</li><li>2</li>'
    );
    const after = [...el.querySelectorAll('li')];
    expect(after[0]).toBe(lis[2]);
    expect(after[1]).toBe(lis[0]);
    setItems([2]);
    flushSync();
    expect(el.querySelector('ul')!.innerHTML).toBe('<li>2</li>');
    expect(el.querySelector('li')).toBe(lis[1]);
  });

  it('updates function children and props without re-rendering the component', () => {
    let renders = 0;
    let setName!: (v: string) => void;
    function Greeting() {
      renders++;
      const [name, set] = state('a');
      setName = set as never;
      return <span title={() => name()}>{() => name()}</span>;
    }
    const { el } = mount(<Greeting />);
    expect(el.innerHTML).toBe('<span title="a">a</span>');
    setName('b');
    flushSync();
    expect(el.innerHTML).toBe('<span title="b">b</span>');
    expect(renders).toBe(1);
  });

  it('leaves committed DOM untouched when a re-render throws', () => {
    let setCount!: (n: number) => void;
    function Child(props: { n: number }) {
      if (props.n === 2) throw new Error('boom');
      return <i>{props.n}</i>;
    }
    function Parent() {
      const [n, set] = state(1);
      setCount = set as never;
      return (
        <div>
          <b>{n()}</b>
          <Child n={n()} />
        </div>
      );
    }
    const { el } = mount(<Parent />);
    const before = el.innerHTML;
    setCount(2);
    expect(() => flushSync()).toThrow('boom');
    expect(el.innerHTML).toBe(before);
    setCount(3);
    flushSync();
    expect(el.innerHTML).toBe('<div><b>3</b><i>3</i></div>');
  });

  it('dispatches events with batching', () => {
    function Button() {
      const [n, set] = state(0);
      return <button onClick={() => set(n() + 1)}>{n()}</button>;
    }
    const { el } = mount(<Button />);
    const button = el.querySelector('button')!;
    button.click();
    expect(button.textContent).toBe('1');
    button.click();
    expect(button.textContent).toBe('2');
    expect(el.querySelector('button')).toBe(button);
  });
});
