import { afterEach, expect, test, vi } from 'vite-plus/test';
import { syncElementPropBindings } from '../../../src/renderer/prop-bindings';
import type { DOMElement } from '../../../src/renderer/types';
import {
  elementListeners,
  elementReactivePropsCleanup,
  type ListenerMapEntry,
  type ReactivePropCleanupEntry,
} from '../../../src/renderer/cleanup';

afterEach(() => vi.restoreAllMocks());

function listener(eventName: string): ListenerMapEntry {
  const handler = () => {};
  return { eventName, handler, original: handler, options: true };
}

test('should reconcile props in insertion order before pruning omitted bindings', () => {
  const element = document.createElement('div');
  element.setAttribute('data-stale', 'before');
  const operations: string[] = [];
  const listeners = new Map([
    ['click:capture', listener('click')],
    ['focus:capture', listener('focus')],
  ]);
  elementListeners.set(element, listeners);
  const reactive = new Map<string, ReactivePropCleanupEntry>([
    [
      'title',
      { fnRef: () => 'old', cleanup: () => operations.push('cleanup title') },
    ],
    [
      'data-keep',
      {
        fnRef: () => 'old',
        cleanup: () => operations.push('cleanup keep'),
        updateFn: () => operations.push('update keep'),
      },
    ],
    [
      'data-drop',
      { fnRef: () => 'old', cleanup: () => operations.push('cleanup drop') },
    ],
  ]);
  elementReactivePropsCleanup.set(element, reactive);
  const setAttribute = element.setAttribute.bind(element);
  const removeAttribute = element.removeAttribute.bind(element);
  vi.spyOn(element, 'setAttribute').mockImplementation((key, value) => {
    operations.push(`set ${key}`);
    setAttribute(key, value);
  });
  vi.spyOn(element, 'removeAttribute').mockImplementation((key) => {
    operations.push(`remove ${key}`);
    removeAttribute(key);
  });
  vi.spyOn(element, 'removeEventListener').mockImplementation((name) => {
    operations.push(`remove listener ${name}`);
  });
  vi.spyOn(element, 'addEventListener').mockImplementation((name) => {
    operations.push(`add listener ${name}`);
  });
  const nextCompute = () => 'next';
  const nextHandler = () => {};
  const props = {
    onClickCapture: null,
    title: 'next',
    'data-keep': nextCompute,
    onKeydownCapture: nextHandler,
  };

  syncElementPropBindings(
    element,
    (<div {...props} />) as DOMElement,
    props,
    false
  );

  expect(operations).toEqual([
    'remove listener click',
    'cleanup title',
    'set title',
    'update keep',
    'add listener keydown',
    'remove data-stale',
    'remove listener focus',
    'cleanup drop',
  ]);
  expect([...listeners.keys()]).toEqual(['keydown:capture']);
  expect(listeners.get('keydown:capture')?.original).toBe(nextHandler);
  expect([...reactive.keys()]).toEqual(['data-keep']);
  expect(reactive.get('data-keep')?.fnRef).toBe(nextCompute);
});

test('should stop at a throwing binding before later props and omitted-binding cleanup', () => {
  const element = document.createElement('div');
  element.setAttribute('title', 'before');
  const failure = new Error('binding update failed');
  const operations: string[] = [];
  const entry: ReactivePropCleanupEntry = {
    fnRef: () => 'before',
    cleanup: () => operations.push('cleanup'),
    updateFn: () => {
      operations.push('update');
      throw failure;
    },
  };
  const reactive = new Map([
    ['data-current', entry],
    [
      'data-omitted',
      { fnRef: () => 'before', cleanup: () => operations.push('omitted') },
    ],
  ]);
  elementReactivePropsCleanup.set(element, reactive);
  const originalCompute = entry.fnRef;
  const props = { 'data-current': () => 'next', title: 'after' };

  expect(() =>
    syncElementPropBindings(
      element,
      (<div {...props} />) as DOMElement,
      props,
      false
    )
  ).toThrow(failure);

  expect(operations).toEqual(['update']);
  expect(element.getAttribute('title')).toBe('before');
  expect(entry.fnRef).toBe(originalCompute);
  expect(reactive.has('data-omitted')).toBe(true);
});

test.each([false, true])(
  'should avoid reading the vnode type when reusing a reactive binding with changed compute %s',
  (changedCompute) => {
    const element = document.createElement('div');
    const compute = () => 'before';
    const update = vi.fn();
    elementReactivePropsCleanup.set(
      element,
      new Map([
        ['title', { fnRef: compute, cleanup: vi.fn(), updateFn: update }],
      ])
    );
    const props = { title: changedCompute ? () => 'after' : compute };
    const vnode = (<div {...props} />) as DOMElement;
    Object.defineProperty(vnode, 'type', {
      get() {
        throw new Error('vnode type was read');
      },
    });
    expect(() =>
      syncElementPropBindings(element, vnode, props, false)
    ).not.toThrow();
    expect(update).toHaveBeenCalledTimes(changedCompute ? 1 : 0);
  }
);

test('should clean up a replaced reactive binding before reading its vnode type', () => {
  const element = document.createElement('div');
  const operations: string[] = [];
  const failure = new Error('vnode type failed');
  elementReactivePropsCleanup.set(
    element,
    new Map([
      [
        'title',
        { fnRef: () => 'before', cleanup: () => operations.push('cleanup') },
      ],
    ])
  );
  const props = { title: () => 'after' };
  const vnode = (<div {...props} />) as DOMElement;
  Object.defineProperty(vnode, 'type', {
    get() {
      operations.push('type');
      throw failure;
    },
  });
  expect(() => syncElementPropBindings(element, vnode, props, false)).toThrow(
    failure
  );
  expect(operations).toEqual(['cleanup', 'type']);
});
