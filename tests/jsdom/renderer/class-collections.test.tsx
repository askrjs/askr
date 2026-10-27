import { expect, test } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { renderToStringSync } from '../../../src/ssr';

test('should render class arrays and objects on the client', () => {
  const { container, cleanup } = createTestContainer();
  const on = true;
  const off = false;
  try {
    createIsland({
      root: container,
      component: () => (
        <p
          class={[
            'a',
            { b: on, c: off },
            null,
            undefined,
            false,
            ['d', { e: on }],
          ]}
        >
          x
        </p>
      ),
    });
    flushScheduler();
    expect(container.querySelector('p')!.getAttribute('class')).toBe('a b d e');
  } finally {
    cleanup();
  }
});

test('should render class arrays and objects on the server', () => {
  const html = renderToStringSync(() => (
    <p className={['a', { b: true, c: false }, null]}>x</p>
  ));
  expect(html).toBe('<p class="a b">x</p>');
});

test('should omit the class attribute for an empty class collection', () => {
  expect(renderToStringSync(() => <p class={[null, { a: false }]}>x</p>)).toBe(
    '<p>x</p>'
  );
});

test('should update owned tokens when a class collection changes', () => {
  const { container, cleanup } = createTestContainer();
  let active!: State<boolean>;
  try {
    createIsland({
      root: container,
      component: () => {
        active = state(false);
        return <p class={['base', { active: active() }]}>x</p>;
      },
    });
    flushScheduler();
    const p = container.querySelector('p')!;
    p.classList.add('ext');
    expect(p.getAttribute('class')).toBe('base ext');
    active.set(true);
    flushScheduler();
    expect(p.classList.contains('active')).toBe(true);
    expect(p.classList.contains('ext')).toBe(true);
    active.set(false);
    flushScheduler();
    expect(p.classList.contains('active')).toBe(false);
    expect(p.classList.contains('base')).toBe(true);
    expect(p.classList.contains('ext')).toBe(true);
  } finally {
    cleanup();
  }
});
