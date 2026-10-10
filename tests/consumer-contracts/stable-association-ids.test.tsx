import { expect, test } from 'vitest';
import { cleanupApp, hydrateSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';
import { renderRouteRequestToString, renderToString } from '@askrjs/askr/ssr';
import { flush } from '@askrjs/askr/testing';
import { createIdScreen, idRegistry } from './stable-association-ids-fixture';

function root() {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return element;
}

function associations(element: HTMLElement) {
  for (const input of element.querySelectorAll('input')) {
    const label = document.getElementById(
      input.getAttribute('aria-labelledby')!
    );
    const description = document.getElementById(
      input.getAttribute('aria-describedby')!
    );
    expect(label).toBeInstanceOf(HTMLLabelElement);
    expect((label as HTMLLabelElement).control).toBe(input);
    expect(description?.textContent).toMatch(/^Visible to .+ teammates$/);
    expect(element.contains(label)).toBe(true);
    expect(element.contains(description!)).toBe(true);
  }
  const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
}

test('should retain supplied associations and keyed nodes through hydration and reordering', async () => {
  const element = root();
  const screen = createIdScreen('profile-main', ['a/b %', 'beta']);
  const registry = idRegistry(screen.Screen);
  try {
    element.innerHTML = renderToString({ url: window.location.href, registry });
    const original = [...element.querySelectorAll('[id]')];
    associations(element);
    await hydrateSPA({
      root: element,
      registry,
      hydrate: { verifyMarkup: true },
    });
    expect([...element.querySelectorAll('[id]')]).toEqual(original);
    const input = element.querySelector('input')!;
    input.value = 'Ada';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flush();
    expect(screen.edits()).toBe(1);
    expect(element.querySelector('output')?.textContent).toBe('Ada');
    screen.reverse();
    flush();
    expect(
      [...element.querySelectorAll('input')].map((node) => node.id)
    ).toEqual([
      'profile-main:beta:display-name',
      'profile-main:a%2Fb%20%25:display-name',
    ]);
    for (const node of original)
      expect(document.getElementById(node.id)).toBe(node);
    expect(input.value).toBe('Ada');
    associations(element);
  } finally {
    cleanupApp(element);
    element.remove();
  }
});

test('should isolate the same record in two independently hydrated root namespaces', async () => {
  const roots = [root(), root()];
  const screens = [
    createIdScreen('main', ['same']),
    createIdScreen('sidebar', ['same']),
  ];
  try {
    for (let index = 0; index < roots.length; index += 1) {
      const registry = idRegistry(screens[index].Screen);
      roots[index].innerHTML = renderToString({
        url: window.location.href,
        registry,
      });
      await hydrateSPA({
        root: roots[index],
        registry,
        hydrate: { verifyMarkup: true },
      });
    }
    roots.forEach(associations);
    const first = roots[0].querySelector('input')!;
    first.value = 'one';
    first.dispatchEvent(new Event('input', { bubbles: true }));
    flush();
    expect(roots[0].querySelector('output')?.textContent).toBe('one');
    expect(roots[1].querySelector('output')?.textContent).toBe('');
    cleanupApp(roots[0]);
    roots[0].remove();
    const survivor = roots[1].querySelector('input')!;
    survivor.value = 'two';
    survivor.dispatchEvent(new Event('input', { bubbles: true }));
    flush();
    expect(roots[1].querySelector('output')?.textContent).toBe('two');
    expect(screens.map((screen) => screen.edits())).toEqual([1, 1]);
    associations(roots[1]);
  } finally {
    for (const element of roots) {
      cleanupApp(element);
      element.remove();
    }
  }
});

test('should preserve request namespaces when SSR requests finish in reverse order', async () => {
  let finishFirst!: () => void;
  let markStarted!: () => void;
  let firstCompleted = false;
  const entered = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const first = createIdScreen('request-first', ['same']);
  const second = createIdScreen('request-second', ['same']);
  const firstRegistry = createRouteRegistry(() =>
    route('/', first.Screen, {
      preload: () => {
        markStarted();
        return gate;
      },
    })
  );
  const secondRegistry = createRouteRegistry(() => route('/', second.Screen));
  const pending = renderRouteRequestToString({
    url: '/',
    registry: firstRegistry,
  }).then((result) => {
    firstCompleted = true;
    return result;
  });
  try {
    await entered;
    const secondResult = await renderRouteRequestToString({
      url: '/',
      registry: secondRegistry,
    });
    expect(secondResult.kind).toBe('render');
    if (secondResult.kind !== 'render')
      throw new Error('expected second render');
    expect(secondResult.html).toContain(
      'id="request-second:same:display-name"'
    );
    expect(secondResult.html).not.toContain('request-first');
    expect(firstCompleted).toBe(false);
    finishFirst();
    const firstResult = await pending;
    expect(firstCompleted).toBe(true);
    expect(firstResult.kind).toBe('render');
    if (firstResult.kind !== 'render') throw new Error('expected first render');
    expect(firstResult.html).toContain('id="request-first:same:display-name"');
    expect(firstResult.html).not.toContain('request-second');
  } finally {
    finishFirst();
    await pending;
  }
});

test('should reject different server and hydration identity inputs with markup verification', async () => {
  const element = root();
  try {
    const server = idRegistry(createIdScreen('server', ['same']).Screen);
    const client = idRegistry(createIdScreen('client', ['same']).Screen);
    element.innerHTML = renderToString({
      url: window.location.href,
      registry: server,
    });
    const input = element.querySelector('input');
    await expect(
      hydrateSPA({
        root: element,
        registry: client,
        hydrate: { verifyMarkup: true },
      })
    ).rejects.toThrow('Hydration mismatch');
    expect(element.querySelector('input')).toBe(input);
    expect(input?.id).toBe('server:same:display-name');
  } finally {
    cleanupApp(element);
    element.remove();
  }
});
