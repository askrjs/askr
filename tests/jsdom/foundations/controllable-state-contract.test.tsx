import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createIsland } from '@askrjs/askr/boot';
import {
  controllableState,
  isControlled,
  makeControllable,
  resolveControllable,
} from '@askrjs/askr/foundations/state';
import { state } from '../../../src/runtime';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('controllable state contract helpers (FOUNDATIONS)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const next = createTestContainer();
    container = next.container;
    cleanup = next.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should treat only undefined as uncontrolled', () => {
    expect(isControlled(undefined)).toBe(false);
    expect(isControlled(null)).toBe(true);
    expect(isControlled(false)).toBe(true);
    expect(isControlled(0)).toBe(true);
  });

  it('should resolve controlled and uncontrolled values predictably', () => {
    expect(resolveControllable<number>(undefined, 2)).toEqual({
      value: 2,
      isControlled: false,
    });
    expect(resolveControllable<number | null>(null, 2)).toEqual({
      value: null,
      isControlled: true,
    });
  });

  it('should route makeControllable updates to onChange or internal state based on control mode', () => {
    const controlledOnChange = vi.fn();
    const controlledSetInternal = vi.fn();
    const controlled = makeControllable({
      value: 'value',
      defaultValue: 'fallback',
      onChange: controlledOnChange,
      setInternal: controlledSetInternal,
    });

    controlled.set('next');

    expect(controlled.isControlled).toBe(true);
    expect(controlledOnChange).toHaveBeenCalledWith('next');
    expect(controlledSetInternal).not.toHaveBeenCalled();

    const uncontrolledOnChange = vi.fn();
    const uncontrolledSetInternal = vi.fn();
    const uncontrolled = makeControllable({
      value: undefined as string | undefined,
      defaultValue: 'fallback',
      onChange: uncontrolledOnChange,
      setInternal: uncontrolledSetInternal,
    });

    uncontrolled.set('next');

    expect(uncontrolled.isControlled).toBe(false);
    expect(uncontrolledSetInternal).toHaveBeenCalledWith('next');
    expect(uncontrolledOnChange).toHaveBeenCalledWith('next');
  });

  it('should update uncontrolled state locally and emit onChange with the next value', () => {
    const onChange = vi.fn<(next: number) => void>();

    const App = () => {
      const count = controllableState({
        value: undefined as number | undefined,
        defaultValue: 1,
        onChange,
      });

      return (
        <button
          type="button"
          onClick={() => {
            count.set((value) => value + 1);
          }}
        >
          {count()}
        </button>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('1');

    button.click();
    flushScheduler();

    expect(button.textContent).toBe('2');
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('should ignore Object.is-equal updates in controlled mode', () => {
    const onChange = vi.fn<(next: number) => void>();

    const App = () => {
      const count = controllableState({
        value: 2,
        defaultValue: 1,
        onChange,
      });

      return (
        <button
          type="button"
          onClick={() => {
            count.set(2);
          }}
        >
          {count()}
        </button>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const button = container.querySelector('button') as HTMLButtonElement;
    button.click();
    flushScheduler();

    expect(button.textContent).toBe('2');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should preserve hook order given a controllable value when its mode changes', () => {
    let setValue!: (value: number | undefined) => void;
    const Child = (props: { value?: number }) => {
      const controlled = controllableState({
        value: props.value,
        defaultValue: 0,
      });
      const count = state(100);
      return <output data-value={`${controlled()}|${count()}`} />;
    };
    const App = () => {
      const value = state<number | undefined>(undefined);
      setValue = value.set;
      return <Child value={value()} />;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    setValue(5);
    expect(() => flushScheduler()).not.toThrow();
    expect(container.querySelector('output')?.dataset.value).toBe('5|100');
  });
});
