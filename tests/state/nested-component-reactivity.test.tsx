/**
 * Nested Component Reactivity Tests
 *
 * These tests verify that state updates in nested (inline-rendered) components
 * properly trigger DOM updates. This is a critical path that was previously broken.
 *
 * CONTEXT: Components rendered via createComponentElement + mountInstanceInline
 * need special handling in evaluate() because their target IS the component's element,
 * not a container holding the element.
 */

import { expect } from 'chai';
import { describe, it } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../helpers/test-renderer';

describe('nested component reactivity', () => {
  it('should update DOM when nested component state changes', () => {
    const { container, cleanup } = createTestContainer();

    const Counter = () => {
      const count = state(0);
      return (
        <div class="counter">
          <button id="inc" onClick={() => count.set(count() + 1)}>
            +
          </button>
          <span id="value">{count()}</span>
        </div>
      );
    };

    const App = () => (
      <div>
        <h1>App</h1>
        <Counter />
      </div>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const valueEl = container.querySelector('#value');
    const incBtn = container.querySelector('#inc') as HTMLButtonElement;

    expect(valueEl?.textContent).to.equal('0');

    incBtn.click();
    flushScheduler();

    expect(valueEl?.textContent).to.equal('1');

    incBtn.click();
    flushScheduler();

    expect(valueEl?.textContent).to.equal('2');

    cleanup();
  });

  it('should preserve element identity across nested component updates', () => {
    const { container, cleanup } = createTestContainer();

    const Counter = () => {
      const count = state(0);
      return (
        <div class="counter">
          <button onClick={() => count.set(count() + 1)}>
            Count: {count()}
          </button>
        </div>
      );
    };

    const App = () => (
      <div>
        <Counter />
      </div>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const button = container.querySelector('button') as HTMLButtonElement;
    const counterDiv = container.querySelector('.counter') as HTMLDivElement;

    expect(button.textContent?.trim()).to.equal('Count: 0');

    button.click();
    flushScheduler();

    // Element references should be preserved
    const buttonAfter = container.querySelector('button') as HTMLButtonElement;
    const counterDivAfter = container.querySelector(
      '.counter'
    ) as HTMLDivElement;

    expect(buttonAfter).to.equal(button); // Same element reference
    expect(counterDivAfter).to.equal(counterDiv); // Same element reference
    expect(button.textContent?.trim()).to.equal('Count: 1');

    cleanup();
  });

  it('should handle multiple nested components with independent state', () => {
    const { container, cleanup } = createTestContainer();

    const Counter = ({ id }: { id: string }) => {
      const count = state(0);
      return (
        <div class="counter" data-id={id}>
          <button onClick={() => count.set(count() + 1)}>+</button>
          <span class="value">{count()}</span>
        </div>
      );
    };

    const App = () => (
      <div>
        <Counter id="a" />
        <Counter id="b" />
        <Counter id="c" />
      </div>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const counters = container.querySelectorAll('.counter');
    expect(counters).to.have.length(3);

    // Click first counter twice
    const btn1 = counters[0].querySelector('button') as HTMLButtonElement;
    btn1.click();
    flushScheduler();
    btn1.click();
    flushScheduler();

    // Click second counter once
    const btn2 = counters[1].querySelector('button') as HTMLButtonElement;
    btn2.click();
    flushScheduler();

    // Third counter not clicked

    const values = Array.from(container.querySelectorAll('.value')).map(
      (el) => el.textContent
    );
    expect(values).to.deep.equal(['2', '1', '0']);

    cleanup();
  });

  it('should handle deeply nested components with state', () => {
    const { container, cleanup } = createTestContainer();

    const DeepCounter = () => {
      const count = state(0);
      return (
        <button id="deep" onClick={() => count.set(count() + 1)}>
          Deep: {count()}
        </button>
      );
    };

    const Middle = () => (
      <div class="middle">
        <DeepCounter />
      </div>
    );

    const App = () => (
      <div class="app">
        <Middle />
      </div>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const deepBtn = container.querySelector('#deep') as HTMLButtonElement;
    expect(deepBtn.textContent?.trim()).to.equal('Deep: 0');

    deepBtn.click();
    flushScheduler();

    expect(deepBtn.textContent?.trim()).to.equal('Deep: 1');

    cleanup();
  });

  it.skip('should handle nested component with complex DOM structure', () => {
    const { container, cleanup } = createTestContainer();

    const ComplexCounter = () => {
      const count = state(0);
      const double = () => count() * 2;

      return (
        <div class="complex">
          <div class="header">
            <h2>Counter</h2>
          </div>
          <div class="body">
            <button onClick={() => count.set(count() + 1)}>Increment</button>
            <p>
              Count: <span id="count">{count()}</span>
            </p>
            <p>
              Double: <span id="double">{double()}</span>
            </p>
          </div>
        </div>
      );
    };

    const App = () => (
      <main>
        <ComplexCounter />
      </main>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const btn = container.querySelector('button') as HTMLButtonElement;
    const countEl = container.querySelector('#count');
    const doubleEl = container.querySelector('#double');
    const complexDiv = container.querySelector('.complex') as HTMLElement;

    expect(countEl?.textContent).to.equal('0');
    expect(doubleEl?.textContent).to.equal('0');

    btn.click();
    flushScheduler();

    // Element identity should be preserved
    const complexDivAfter = container.querySelector('.complex') as HTMLElement;
    expect(complexDivAfter).to.equal(complexDiv);

    expect(countEl?.textContent).to.equal('1');
    expect(doubleEl?.textContent).to.equal('2');

    cleanup();
  });

  it.skip('should handle nested component returning different root element types', () => {
    const { container, cleanup } = createTestContainer();

    const Toggler = () => {
      const isDiv = state(true);
      const toggle = () => isDiv.set(!isDiv());

      if (isDiv()) {
        return (
          <div class="container" id="elem" onClick={toggle}>
            DIV
          </div>
        );
      } else {
        return (
          <span class="container" id="elem" onClick={toggle}>
            SPAN
          </span>
        );
      }
    };

    const App = () => (
      <div>
        <Toggler />
      </div>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const elem = container.querySelector('#elem') as HTMLElement;
    expect(elem.tagName).to.equal('DIV');
    expect(elem.textContent?.trim()).to.equal('DIV');

    elem.click();
    flushScheduler();

    // When the element type changes, the framework replaces the element
    // This is expected behavior - we can't morph a div into a span
    const elemAfter = container.querySelector('#elem') as HTMLElement;
    // expect(elemAfter).to.be.ok;
    expect(elemAfter.tagName).to.equal('SPAN');
    expect(elemAfter.textContent?.trim()).to.equal('SPAN');
    // Note: elemAfter !== elem because the element was replaced

    cleanup();
  });

  it('should handle nested component with event listeners preserved', () => {
    const { container, cleanup } = createTestContainer();

    let clickCount = 0;

    const Counter = () => {
      const count = state(0);
      const handleClick = () => {
        clickCount++;
        count.set(count() + 1);
      };

      return (
        <button id="btn" onClick={handleClick}>
          {count()}
        </button>
      );
    };

    const App = () => (
      <div>
        <Counter />
      </div>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    const originalBtn = btn;

    btn.click();
    flushScheduler();

    expect(clickCount).to.equal(1);
    expect(btn.textContent).to.equal('1');

    // Button should be the same element
    const btnAfter = container.querySelector('#btn') as HTMLButtonElement;
    expect(btnAfter).to.equal(originalBtn);

    btnAfter.click();
    flushScheduler();

    expect(clickCount).to.equal(2);
    expect(btnAfter.textContent).to.equal('2');

    cleanup();
  });

  it.skip('should handle refs in nested components', () => {
    const { container, cleanup } = createTestContainer();

    let capturedRef: HTMLButtonElement | null = null;

    const Counter = () => {
      const count = state(0);

      return (
        <button
          ref={(el) => (capturedRef = el as HTMLButtonElement)}
          onClick={() => count.set(count() + 1)}
        >
          {count()}
        </button>
      );
    };

    const App = () => (
      <div>
        <Counter />
      </div>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    // expect(capturedRef).to.be.ok;
    expect(capturedRef?.textContent).to.equal('0');

    capturedRef?.click();
    flushScheduler();

    // Ref should still point to the same element
    expect(capturedRef?.textContent).to.equal('1');

    const btnInDom = container.querySelector('button') as HTMLButtonElement;
    expect(btnInDom).to.equal(capturedRef);

    cleanup();
  });

  it('should handle sibling nested components', () => {
    const { container, cleanup } = createTestContainer();

    const CounterA = () => {
      const count = state(10);
      return (
        <button class="a" onClick={() => count.set(count() + 1)}>
          A: {count()}
        </button>
      );
    };

    const CounterB = () => {
      const count = state(20);
      return (
        <button class="b" onClick={() => count.set(count() + 1)}>
          B: {count()}
        </button>
      );
    };

    const App = () => (
      <div>
        <CounterA />
        <CounterB />
      </div>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const btnA = container.querySelector('.a') as HTMLButtonElement;
    const btnB = container.querySelector('.b') as HTMLButtonElement;

    expect(btnA.textContent?.trim()).to.equal('A: 10');
    expect(btnB.textContent?.trim()).to.equal('B: 20');

    btnA.click();
    flushScheduler();

    expect(btnA.textContent?.trim()).to.equal('A: 11');
    expect(btnB.textContent?.trim()).to.equal('B: 20'); // B unchanged

    btnB.click();
    flushScheduler();

    expect(btnA.textContent?.trim()).to.equal('A: 11'); // A unchanged
    expect(btnB.textContent?.trim()).to.equal('B: 21');

    cleanup();
  });
});
