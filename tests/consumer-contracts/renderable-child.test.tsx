import { expect, test } from 'vitest';
import {
  defineScope,
  readScope,
  state,
  type RenderableChild,
  type State,
} from '@askrjs/askr';
import { Presence, layout } from '@askrjs/askr/foundations';
import { renderToString } from '@askrjs/askr/ssr';
import { render } from '@askrjs/askr/testing';

function Panel({ children }: { children?: RenderableChild }) {
  return <section data-panel="">{children}</section>;
}

test('should render readonly value children through presentation and layout slots', () => {
  const children: RenderableChild = Object.freeze([
    'text<',
    0,
    42,
    true,
    false,
    null,
    undefined,
    <strong>element</strong>,
    Object.freeze(['nested', Object.freeze([1, null, <em>end</em>])]),
  ]);
  const wrap = layout(({ children }: { children?: RenderableChild }) => (
    <Panel>
      <Presence present>{children}</Presence>
    </Panel>
  ));
  const App = () => <>{wrap(children)}</>;
  const view = render(App);
  try {
    const server = document.createElement('div');
    const html = renderToString(App);
    server.innerHTML = html;
    expect(html).toContain('text&lt;');
    for (const root of [view.root, server]) {
      expect(root.textContent).toBe('text<042elementnested1end');
      expect(root.querySelector('section')?.textContent).toBe(
        'text<042elementnested1end'
      );
      expect(root.querySelectorAll('strong')).toHaveLength(1);
      expect(root.querySelectorAll('em')).toHaveLength(1);
      expect(root.querySelectorAll('section')).toHaveLength(1);
    }
  } finally {
    view.cleanup();
  }
});

test('should retain explicit Scope factory children and their reactive ownership', () => {
  const Scope = defineScope('outside');
  let count!: State<number>;
  const Reader = () => <output>{readScope(Scope)}</output>;
  const App = () => {
    count = state(0);
    return (
      <Scope value="inside">
        {() => (
          <Panel>
            <Reader />
            <span>{count()}</span>
          </Panel>
        )}
      </Scope>
    );
  };
  const view = render(App);
  try {
    expect(view.root.textContent).toBe('inside0');
    count.set(2);
    view.flush();
    expect(view.root.textContent).toBe('inside2');
    const server = document.createElement('div');
    server.innerHTML = renderToString(App);
    expect(server.textContent).toBe('inside0');
  } finally {
    view.cleanup();
  }
});

test('should expose RenderableChild only as a type', async () => {
  expect(await import('@askrjs/askr')).not.toHaveProperty('RenderableChild');
});
