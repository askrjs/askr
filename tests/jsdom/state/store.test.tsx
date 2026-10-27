import { describe, expect, it } from 'vite-plus/test';
import { store, unwrap } from '../../../src';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function mount(component: () => unknown) {
  const { container, cleanup } = createTestContainer();
  createIsland({ root: container, component: component as never });
  flushScheduler();
  return { container, cleanup };
}

describe('store()', () => {
  it('should track symbol properties and notify their readers', () => {
    const key = Symbol('count');
    let value!: { [key]: number };
    const { container, cleanup } = mount(() => {
      value = store({ [key]: 1 });
      return <p>{value[key]}</p>;
    });
    try {
      value[key] = 2;
      flushScheduler();
      expect(container.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('should preserve the value of frozen symbol properties', () => {
    const key = Symbol('child');
    const child = { n: 1 };
    const raw = Object.freeze({ [key]: child });
    const { container, cleanup } = mount(() => {
      const value = store(raw);
      return <p>{value[key].n}</p>;
    });
    try {
      expect(container.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });

  it('should track a property per signal so an unrelated property does not re-render', () => {
    let renders = 0;
    let s!: { x: number; y: number };
    const { container, cleanup } = mount(() => {
      renders++;
      s = store({ x: 1, y: 1 });
      return <p>{s.x}</p>;
    });
    try {
      const base = renders;
      s.y = 2;
      flushScheduler();
      expect(renders).toBe(base);
      s.x = 5;
      flushScheduler();
      expect(renders).toBe(base + 1);
      expect(container.textContent).toBe('5');
    } finally {
      cleanup();
    }
  });

  it('should notify readers when an accessor writes through the store proxy', () => {
    const raw = { x: 1 } as { x: number; alias: number };
    Object.defineProperty(raw, 'alias', {
      enumerable: true,
      configurable: true,
      get() {
        return this.x;
      },
      set(value: number) {
        this.x = value;
      },
    });
    let value!: typeof raw;
    const { container, cleanup } = mount(() => {
      value = store(raw);
      return <p>{value.x}</p>;
    });
    try {
      value.alias = 2;
      flushScheduler();
      expect(container.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('should notify nested accessor writes even when the setter then throws', () => {
    const raw = { x: 1 } as { x: number; alias: number };
    Object.defineProperty(raw, 'alias', {
      enumerable: true,
      configurable: true,
      set(value: number) {
        this.x = value;
        throw new Error('setter failed');
      },
    });
    let value!: typeof raw;
    const { container, cleanup } = mount(() => {
      value = store(raw);
      return <p>{value.x}</p>;
    });
    try {
      expect(() => {
        value.alias = 2;
      }).toThrow('setter failed');
      flushScheduler();
      expect(value.x).toBe(2);
      expect(container.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('should not notify when a property is assigned the same value', () => {
    let renders = 0;
    let s!: { x: number };
    const { cleanup } = mount(() => {
      renders++;
      s = store({ x: 1 });
      return <p>{s.x}</p>;
    });
    try {
      const base = renders;
      s.x = 1;
      flushScheduler();
      expect(renders).toBe(base);
    } finally {
      cleanup();
    }
  });

  it('should wrap nested objects lazily and keep per-path granularity', () => {
    let renders = 0;
    let s!: { a: { x: number; y: number }; b: { z: number } };
    const { container, cleanup } = mount(() => {
      renders++;
      s = store({ a: { x: 1, y: 1 }, b: { z: 1 } });
      return <p>{s.a.x}</p>;
    });
    try {
      const base = renders;
      s.a.y = 9;
      s.b.z = 9;
      flushScheduler();
      expect(renders).toBe(base);
      s.a.x = 2;
      flushScheduler();
      expect(container.textContent).toBe('2');
      expect(renders).toBe(base + 1);
      // Replacing the nested object notifies readers of the parent key.
      s.a = { x: 7, y: 7 };
      flushScheduler();
      expect(container.textContent).toBe('7');
    } finally {
      cleanup();
    }
  });

  it('should return the same proxy for the same target and unwrap to the raw object', () => {
    const raw = { child: { n: 1 } };
    let s!: typeof raw;
    const { cleanup } = mount(() => {
      s = store(raw);
      return <p>{s.child.n}</p>;
    });
    try {
      expect(s.child).toBe(s.child);
      expect(unwrap(s)).toBe(raw);
      expect(unwrap(s.child)).toBe(raw.child);
      expect(unwrap(raw)).toBe(raw);
      const other = { n: 2 };
      s.child = other;
      expect(unwrap(s.child)).toBe(other);
      expect((raw.child as unknown) === other).toBe(true);
      // Assigning a proxy stores the raw object.
      const proxy = s.child;
      s.child = proxy;
      expect(raw.child).toBe(other);
    } finally {
      cleanup();
    }
  });

  it('should keep the same store across renders and ignore a later initial value', () => {
    let first: unknown;
    let last: unknown;
    let tick!: { n: number };
    const { cleanup } = mount(() => {
      tick = store({ n: 0 });
      const s = store({ n: 0 });
      first ??= s;
      last = s;
      return <p>{tick.n}</p>;
    });
    try {
      tick.n = 1;
      flushScheduler();
      expect(last).toBe(first);
    } finally {
      cleanup();
    }
  });

  it('should notify readers of length and of an index on push', () => {
    let lengthRenders = 0;
    let indexRenders = 0;
    let list!: number[];
    const Len = () => {
      lengthRenders++;
      return <i>{list.length}</i>;
    };
    const Idx = () => {
      indexRenders++;
      return <b>{String(list[2])}</b>;
    };
    const { container, cleanup } = mount(() => {
      list = store([1, 2]);
      return (
        <div>
          <Len />
          <Idx />
        </div>
      );
    });
    try {
      const l = lengthRenders;
      const i = indexRenders;
      list.push(3);
      flushScheduler();
      expect(lengthRenders).toBe(l + 1);
      expect(indexRenders).toBe(i + 1);
      expect(container.textContent).toBe('33');
      list.push(4);
      flushScheduler();
      expect(indexRenders).toBe(i + 1);
      expect(lengthRenders).toBe(l + 2);
    } finally {
      cleanup();
    }
  });

  it('should not notify readers when an invalid array length write fails', () => {
    let renders = 0;
    let list!: number[];
    const { container, cleanup } = mount(() => {
      renders++;
      list = store([1, 2, 3]);
      return <p>{`${list.length}:${String(list[2])}`}</p>;
    });
    try {
      const before = renders;
      expect(() => {
        list.length = 1.5;
      }).toThrow(RangeError);
      flushScheduler();
      expect(list).toHaveLength(3);
      expect(container.textContent).toBe('3:3');
      expect(renders).toBe(before);
    } finally {
      cleanup();
    }
  });

  it('should track iteration and map through the whole array', () => {
    let list!: Array<{ id: number }>;
    const { container, cleanup } = mount(() => {
      list = store([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const ids: number[] = [];
      for (const item of list) ids.push(item.id);
      return (
        <p>
          {ids.join(',')}|{list.map((item) => item.id * 2).join(',')}
        </p>
      );
    });
    try {
      expect(container.textContent).toBe('1,2,3|2,4,6');
      list.splice(1, 1);
      flushScheduler();
      expect(container.textContent).toBe('1,3|2,6');
      list[0]!.id = 10;
      flushScheduler();
      expect(container.textContent).toBe('10,3|20,6');
      list.splice(1, 0, { id: 5 }, { id: 6 });
      flushScheduler();
      expect(container.textContent).toBe('10,5,6,3|20,10,12,6');
      list.length = 1;
      flushScheduler();
      expect(container.textContent).toBe('10|20');
    } finally {
      cleanup();
    }
  });

  it('should notify on delete and track keys and in', () => {
    let s!: Record<string, number>;
    const { container, cleanup } = mount(() => {
      s = store<Record<string, number>>({ a: 1 });
      return (
        <p>
          {Object.keys(s).join(',')}|{String('b' in s)}|{String(s.a)}
        </p>
      );
    });
    try {
      expect(container.textContent).toBe('a|false|1');
      s.b = 2;
      flushScheduler();
      expect(container.textContent).toBe('a,b|true|1');
      delete s.a;
      flushScheduler();
      expect(container.textContent).toBe('b|true|undefined');
      delete s.b;
      flushScheduler();
      expect(container.textContent).toBe('|false|undefined');
    } finally {
      cleanup();
    }
  });

  it('should reject writes during render like state.set()', () => {
    let outer!: { n: number };
    expect(() =>
      mount(() => {
        outer = store({ n: 0 });
        outer.n = 1;
        return <p>{outer.n}</p>;
      })
    ).toThrow(/cannot be called during component render/);
  });

  it('should render store reads on the server', () => {
    const Component = () => {
      const s = store({ name: 'Ada', tags: ['a', 'b'], nested: { n: 2 } });
      return (
        <p>
          {s.name}:{s.tags.join('+')}:{s.nested.n}
        </p>
      );
    };
    const html = renderToStringSync(() => <Component />);
    expect(html).toContain('Ada:a+b:2');
  });
});
