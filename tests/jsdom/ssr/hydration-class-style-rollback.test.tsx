import { describe, expect, it, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

describe('class and style rollback', () => {
  function failSecondAttributeWrite(second: Element): Error {
    const setAttribute = second.setAttribute.bind(second);
    const failure = new Error('later hydration attribute write failed');
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });
    return failure;
  }

  it('should restore an adopted class when a later attribute write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<div id="first" class="old">first</div>' +
      '<button id="second" data-mode="old">second</button>';
    const first = container.querySelector('#first')!;
    const second = container.querySelector('#second')!;
    const failure = failSecondAttributeWrite(second);
    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare(
      <>
        <div id="first" className="new">
          first
        </div>
        <button id="second" data-mode="new">
          second
        </button>
      </>
    );

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('class')).toBe('old');
    root.dispose();
  });

  it('should restore adopted styles when a later attribute write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<div id="first" style="color: red">first</div>' +
      '<button id="second" data-mode="old">second</button>';
    const first = container.querySelector<HTMLElement>('#first')!;
    const second = container.querySelector('#second')!;
    const failure = failSecondAttributeWrite(second);
    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare(
      <>
        <div id="first" style={{ color: 'blue' }}>
          first
        </div>
        <button id="second" data-mode="new">
          second
        </button>
      </>
    );

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.style.color).toBe('red');
    root.dispose();
  });

  it('should restore an updated class when a later attribute write fails', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <>
        <div id="first" className="old">
          first
        </div>
        <button id="second" data-mode="old">
          second
        </button>
      </>
    );
    const first = container.querySelector('#first')!;
    const second = container.querySelector('#second')!;
    const failure = failSecondAttributeWrite(second);
    const prepared = root.prepare(
      <>
        <div id="first" className="new">
          first
        </div>
        <button id="second" data-mode="new">
          second
        </button>
      </>
    );

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('class')).toBe('old');
    root.dispose();
  });

  it('should restore updated styles when a later attribute write fails', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <>
        <div id="first" style={{ color: 'red' }}>
          first
        </div>
        <button id="second" data-mode="old">
          second
        </button>
      </>
    );
    const first = container.querySelector<HTMLElement>('#first')!;
    const second = container.querySelector('#second')!;
    const failure = failSecondAttributeWrite(second);
    const prepared = root.prepare(
      <>
        <div id="first" style={{ color: 'blue' }}>
          first
        </div>
        <button id="second" data-mode="new">
          second
        </button>
      </>
    );

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.style.color).toBe('red');
    root.dispose();
  });
});
