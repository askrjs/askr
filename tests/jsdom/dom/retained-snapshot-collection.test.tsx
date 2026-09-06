import { expect, test } from 'vite-plus/test';
import { state, type State } from '../../../src';
import {
  createDOMNode,
  updateElementFromVnode,
} from '../../../src/renderer/dom-internal';
import { teardownNodeSubtree } from '../../../src/renderer/ownership/cleanup';
import {
  getKeyMapForElement,
  populateKeyMapForElement,
} from '../../../src/renderer/reconciliation/keyed';
import {
  restoreRetainedElement,
  snapshotRetainedElement,
} from '../../../src/renderer/ownership/retained-element';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

test.each([false, true])(
  'should restore copied bindings with DOM capture disabled %s',
  (bindingsOnly) => {
    const { container, cleanup } = createTestContainer();
    const calls: string[] = [];
    const originalRef = { current: null as HTMLButtonElement | null };
    const replacementRef = { current: null as HTMLButtonElement | null };
    let value!: State<number>;
    function App() {
      value = state(1);
      return (
        <button
          data-phase="before"
          title={() => `before:${value()}`}
          onClickCapture={() => calls.push('capture before')}
          onClick={() => calls.push('bubble before')}
          ref={originalRef}
        >
          {'head'}
          <span key="middle">middle</span>
          {'tail'}
        </button>
      );
    }
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const button = container.querySelector('button')!;
      const originalChildren = Array.from(button.childNodes);
      const keyedChild = button.querySelector('span')!;
      populateKeyMapForElement(button);
      let controlValue = 'before value';
      let valueReads = 0;
      Object.defineProperty(button, 'value', {
        configurable: true,
        get() {
          valueReads++;
          return controlValue;
        },
        set(next: string) {
          controlValue = next;
        },
      });
      const snapshot = snapshotRetainedElement(button, bindingsOnly);
      expect(valueReads).toBe(bindingsOnly ? 0 : 1);
      updateElementFromVnode(
        button,
        <button
          data-phase="after"
          title={() => `after:${value()}`}
          onClickCapture={() => calls.push('capture after')}
          onClick={() => calls.push('bubble after')}
          ref={replacementRef}
        />,
        false
      );
      (originalChildren[0] as Text).data = 'changed head';
      const extra = document.createTextNode('extra');
      button.replaceChildren(
        originalChildren[2],
        originalChildren[1],
        originalChildren[0],
        extra
      );
      getKeyMapForElement(button)!.clear();
      controlValue = 'after value';
      restoreRetainedElement(button, snapshot, teardownNodeSubtree);
      flushScheduler();
      expect(Array.from(button.childNodes)).toEqual(
        bindingsOnly
          ? [
              originalChildren[2],
              originalChildren[1],
              originalChildren[0],
              extra,
            ]
          : originalChildren
      );
      expect((originalChildren[0] as Text).data).toBe(
        bindingsOnly ? 'changed head' : 'head'
      );
      expect(button.getAttribute('data-phase')).toBe(
        bindingsOnly ? 'after' : 'before'
      );
      expect(controlValue).toBe(bindingsOnly ? 'after value' : 'before value');
      expect(getKeyMapForElement(button)?.get('middle')).toBe(
        bindingsOnly ? undefined : keyedChild
      );
      expect(originalRef.current).toBe(button);
      expect(replacementRef.current).toBeNull();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(calls).toEqual(['capture before', 'bubble before']);
      value.set(2);
      flushScheduler();
      expect(button.title).toBe('before:2');
    } finally {
      cleanup();
    }
  }
);

test('should restore empty and populated element snapshots independently across repeated rollback', () => {
  const empty = document.createElement('div');
  const populated = createDOMNode(
    <section title="before">before</section>
  ) as Element;
  const emptySnapshot = snapshotRetainedElement(empty);
  const populatedSnapshot = snapshotRetainedElement(populated);
  const originalText = populated.firstChild;
  for (let iteration = 0; iteration < 2; iteration++) {
    empty.setAttribute('title', 'added');
    empty.textContent = 'added';
    populated.setAttribute('title', 'after');
    populated.textContent = 'after';
    restoreRetainedElement(populated, populatedSnapshot, teardownNodeSubtree);
    restoreRetainedElement(empty, emptySnapshot, teardownNodeSubtree);
    expect(empty.getAttributeNames()).toEqual([]);
    expect(empty.childNodes).toHaveLength(0);
    expect(populated.getAttribute('title')).toBe('before');
    expect(populated.firstChild).toBe(originalText);
    expect(populated.textContent).toBe('before');
  }
});

test('should retain live text-index capture when a text getter changes the next sibling', () => {
  const element = document.createElement('div');
  const first = document.createTextNode('first');
  const second = document.createTextNode('second');
  const added = document.createTextNode('added');
  element.append(first, second);
  Object.defineProperty(first, 'data', {
    configurable: true,
    get() {
      second.remove();
      element.appendChild(added);
      return 'captured first';
    },
  });
  const snapshot = snapshotRetainedElement(element);
  Reflect.deleteProperty(first, 'data');
  first.data = 'changed';
  added.data = 'changed';
  restoreRetainedElement(element, snapshot, teardownNodeSubtree);
  expect(Array.from(element.childNodes)).toEqual([first, second]);
  expect(first.data).toBe('captured first');
  expect(added.data).toBe('added');
});

test('should capture text after form getters while retaining the earlier attributes and child order', () => {
  const element = createDOMNode(
    <section data-phase="before">
      {'head'}
      <span>middle</span>
      {'tail'}
    </section>
  ) as Element;
  const originalChildren = Array.from(element.childNodes);
  const head = originalChildren[0] as Text;
  const added = document.createTextNode('added by getter');
  const controlWrites: unknown[] = [];
  Object.defineProperties(element, {
    value: {
      configurable: true,
      get() {
        head.data = 'during value';
        element.setAttribute('data-phase', 'during value');
        element.appendChild(added);
        return 'captured value';
      },
      set(value: string) {
        controlWrites.push(value);
      },
    },
    checked: {
      configurable: true,
      get() {
        head.data = 'during checked';
        return true;
      },
      set(value: boolean) {
        controlWrites.push(value);
      },
    },
  });
  const snapshot = snapshotRetainedElement(element);
  head.data = 'after capture';
  added.data = 'changed added text';
  element.replaceChildren(added, ...originalChildren.toReversed());
  const cleaned: Node[] = [];
  restoreRetainedElement(element, snapshot, (node) => cleaned.push(node));
  expect(Array.from(element.childNodes)).toEqual(originalChildren);
  expect(element.getAttribute('data-phase')).toBe('before');
  expect(head.data).toBe('during checked');
  expect(added.data).toBe('added by getter');
  expect(cleaned).toEqual([added]);
  expect(controlWrites).toEqual(['captured value', true]);
});

test.each([false, true])(
  'should preserve live attribute capture when a getter removes the next attribute %s',
  (removeNext) => {
    const element = createDOMNode(
      <section data-first="first" data-next="next" />
    ) as Element;
    const first = element.getAttributeNode('data-first')!;
    Object.defineProperty(first, 'value', {
      configurable: true,
      get() {
        if (removeNext) element.removeAttribute('data-next');
        element.setAttribute('data-added', 'added during capture');
        return 'captured first';
      },
    });
    const snapshot = snapshotRetainedElement(element);
    Reflect.deleteProperty(first, 'value');
    for (const attribute of Array.from(element.attributes))
      element.removeAttribute(attribute.name);
    element.setAttribute('data-after', 'after');
    restoreRetainedElement(element, snapshot, teardownNodeSubtree);
    expect(element.getAttribute('data-first')).toBe('captured first');
    expect(element.getAttribute('data-next')).toBe(removeNext ? null : 'next');
    expect(element.getAttribute('data-added')).toBe('added during capture');
    expect(element.hasAttribute('data-after')).toBe(false);
  }
);
