import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { logger } from '../../../src/common/logger';
import { createRoot } from '../../../src/core/dom/root';
import { renderToStringSync } from '../../../src/ssr';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

function messages(): string[] {
  return warn.mock.calls.map((call: unknown[]) => String(call[0]));
}

function mount(value: unknown): () => void {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(value);
  return () => root.dispose();
}

test('should warn once when a block element is nested in a paragraph', () => {
  const dispose = mount(
    <p>
      <section>a</section>
    </p>
  );
  dispose();
  mount(
    <p>
      <section>b</section>
    </p>
  )();
  const found = messages().filter((m) => m.includes('<section>'));
  expect(found).toHaveLength(1);
  expect(found[0]).toContain('<p>');
});

test('should warn about a table row without a tbody when rendering on the server', () => {
  renderToStringSync(() => (
    <table>
      <tr>
        <td>cell</td>
      </tr>
    </table>
  ));
  expect(
    messages().some((m) => m.includes('<tr>') && m.includes('<table>'))
  ).toBe(true);
});

test('should not warn about a row inside a tbody', () => {
  renderToStringSync(() => (
    <table>
      <tbody>
        <tr>
          <td>cell</td>
        </tr>
      </tbody>
    </table>
  ));
  expect(messages().filter((m) => m.includes('<tr>'))).toHaveLength(0);
});

test('should warn when a DOM node is passed as a child', () => {
  const node = document.createElement('span');
  mount(<div>{node as never}</div>)();
  mount(<div>{node as never}</div>)();
  const found = messages().filter((m) => m.includes('DOM node'));
  expect(found).toHaveLength(1);
});

test('should warn when a Promise is passed as a child', () => {
  mount(<div>{Promise.resolve('x') as never}</div>)();
  expect(messages().some((m) => m.includes('Promise'))).toBe(true);
});

test('should warn when only some siblings of a list are keyed', () => {
  const items = ['a', 'b', 'c'];
  function Partial() {
    return (
      <ul>
        {items.map((item, index) =>
          index === 0 ? <li key={item}>{item}</li> : <li>{item}</li>
        )}
      </ul>
    );
  }
  mount(<Partial />)();
  expect(
    messages().some((m) => m.includes('Partial') && m.includes('some'))
  ).toBe(true);
});

test('should warn about an event prop that matches no DOM event', () => {
  mount(<button {...({ onClck: () => {} } as object)}>x</button>)();
  const found = messages().filter((m) => m.includes('onClck'));
  expect(found).toHaveLength(1);
  expect(found[0]).toContain('onClick');
});

test('should not warn about known or custom element events', () => {
  mount(
    <div>
      <button onClick={() => {}} onPointerDown={() => {}}>
        x
      </button>
      <my-widget onCustomThing={() => {}} />
    </div>
  )();
  expect(messages().filter((m) => m.includes('Unknown event'))).toHaveLength(0);
});

test('should not warn in production', () => {
  process.env.NODE_ENV = 'production';
  mount(
    <article>
      <p>
        <aside>a</aside>
      </p>
      <button {...({ onNopeNope: () => {} } as object)}>x</button>
    </article>
  )();
  expect(messages()).toHaveLength(0);
});
