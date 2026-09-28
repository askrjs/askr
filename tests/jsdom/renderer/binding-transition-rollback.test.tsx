import { describe, expect, it, vi } from 'vite-plus/test';
import { Signal } from '../../../src/core/reactive/graph';
import { createRoot } from '../../../src/core/dom/root';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

describe('binding transition rollback', () => {
  function failAttributeWrite(second: Element): Error {
    const setAttribute = second.setAttribute.bind(second);
    const failure = new Error('later attribute write failed');
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });
    return failure;
  }

  function view(className: string | (() => string), mode: string) {
    return (
      <>
        <div id="first" className={className as never}>
          first
        </div>
        <button id="second" data-mode={mode}>
          second
        </button>
      </>
    );
  }

  function viewWithoutClassBinding(mode: string) {
    return (
      <>
        <div id="first">first</div>
        <button id="second" data-mode={mode}>
          second
        </button>
      </>
    );
  }

  it('should restore a binding when its replacement render aborts', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const className = new Signal('old');
    root.render(view(() => className.read(), 'old'));
    const first = container.querySelector('#first')!;
    const second = container.querySelector('#second')!;
    const failure = failAttributeWrite(second);
    const prepared = root.prepare(view('new', 'new'));

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('class')).toBe('old');

    className.write('later');
    flushScheduler();
    expect(first.getAttribute('class')).toBe('later');
    root.dispose();
  });

  it('should keep an old binding when a replacement binding commit aborts', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const oldValue = new Signal('old');
    const newValue = new Signal('replacement');
    root.render(view(() => oldValue.read(), 'old'));
    const first = container.querySelector('#first')!;
    const second = container.querySelector('#second')!;
    const failure = failAttributeWrite(second);

    const prepared = root.prepare(view(() => newValue.read(), 'new'));
    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('class')).toBe('old');

    oldValue.write('later');
    flushScheduler();
    expect(first.getAttribute('class')).toBe('later');
    root.dispose();
  });

  it('should keep a removed binding when its render aborts', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const className = new Signal('old');
    root.render(view(() => className.read(), 'old'));
    const first = container.querySelector('#first')!;
    const second = container.querySelector('#second')!;
    const failure = failAttributeWrite(second);

    const prepared = root.prepare(viewWithoutClassBinding('new'));
    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('class')).toBe('old');

    className.write('later');
    flushScheduler();
    expect(first.getAttribute('class')).toBe('later');
    root.dispose();
  });

  it('should remove a provisional binding when its render aborts', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const value = new Signal('bound');
    root.render(view('old', 'old'));
    const first = container.querySelector('#first')!;
    const second = container.querySelector('#second')!;
    const failure = failAttributeWrite(second);

    const prepared = root.prepare(view(() => value.read(), 'new'));
    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('class')).toBe('old');

    value.write('later');
    flushScheduler();
    expect(first.getAttribute('class')).toBe('old');
    root.dispose();
  });
});
