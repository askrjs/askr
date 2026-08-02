import { afterEach, describe, expect, it } from 'vite-plus/test';
import { defineScope, readScope, state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import { findHostInstanceByType } from '../../../src/renderer/component-host-instances';
import type { ComponentFunction } from '../../../src/runtime';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('nested scope descendant identity', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('should retain nested interactive descendants when an outer scope updates', () => {
    const ThemeScope = defineScope({ theme: 'default' });
    let setOuterTheme!: (theme: string) => void;

    function Scope(props: {
      name: 'outer' | 'inner';
      initial: string;
      children?: unknown;
    }) {
      const theme = state(props.initial);
      if (props.name === 'outer') setOuterTheme = theme.set;

      return (
        <ThemeScope value={{ theme: theme() }}>
          <div data-scope={props.name}>{props.children}</div>
        </ThemeScope>
      );
    }

    function Probe(props: { name: string }) {
      return <span data-probe={props.name}>{readScope(ThemeScope).theme}</span>;
    }

    function App() {
      return (
        <Scope name={'outer'} initial={'light'}>
          <Probe name={'outer'} />
          <Scope name={'inner'} initial={'tabby'}>
            <select data-inner-picker={'true'}>
              <option value={'tabby'}>Tabby</option>
              <option value={'calico'}>Calico</option>
            </select>
            <Probe name={'inner'} />
          </Scope>
        </Scope>
      );
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    createIsland({ root: container, component: App });
    flushScheduler();

    const innerPicker = container.querySelector('[data-inner-picker]');
    const innerScope = container.querySelector('[data-scope="inner"]');
    expect(innerPicker?.isConnected).toBe(true);

    setOuterTheme('dark');
    flushScheduler();

    expect(container.querySelector('[data-probe="outer"]')?.textContent).toBe(
      'dark'
    );
    expect(container.querySelector('[data-probe="inner"]')?.textContent).toBe(
      'tabby'
    );
    expect(container.querySelector('[data-scope="inner"]')).toBe(innerScope);
    expect(container.querySelector('[data-inner-picker]')).toBe(innerPicker);
    expect(innerPicker?.isConnected).toBe(true);
  });

  it('should remove an intrinsic host when its context provider is replaced by an empty provider', () => {
    const FirstScope = defineScope('first');
    const SecondScope = defineScope('second');
    let showFirst!: (value: boolean) => void;

    function App() {
      const first = state(true);
      showFirst = first.set;

      return first() ? (
        <FirstScope value={'first'}>
          <button data-stale-scope-host={'true'}>{'first'}</button>
        </FirstScope>
      ) : (
        <SecondScope value={'second'}>{null}</SecondScope>
      );
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.querySelector('[data-stale-scope-host]')).not.toBeNull();

    showFirst(false);
    flushScheduler();

    expect(container.querySelector('[data-stale-scope-host]')).toBeNull();
  });

  it('should not reuse one keyed context provider as a different provider', () => {
    const FirstScope = defineScope('first-default');
    const SecondScope = defineScope('second-default');
    let showSecond!: (value: boolean) => void;

    function FirstProbe() {
      return <output data-first-provider={'true'}>{readScope(FirstScope)}</output>;
    }

    function SecondProbe() {
      return (
        <output data-second-provider={'true'}>{readScope(SecondScope)}</output>
      );
    }

    function App() {
      const second = state(false);
      showSecond = second.set;

      return second() ? (
        <SecondScope value={'second-live'}>
          <SecondProbe />
        </SecondScope>
      ) : (
        <FirstScope value={'first-live'}>
          <FirstProbe />
        </FirstScope>
      );
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.querySelector('[data-first-provider]')?.textContent).toBe(
      'first-live'
    );
    const secondVNode = SecondScope({ value: 'second-live', children: null });
    expect(
      findHostInstanceByType(
        container.querySelector('[data-first-provider]')!,
        (secondVNode as { type: ComponentFunction }).type,
        secondVNode
      )
    ).toBeNull();

    showSecond(true);
    flushScheduler();

    expect(container.querySelector('[data-first-provider]')).toBeNull();
    expect(container.querySelector('[data-second-provider]')?.textContent).toBe(
      'second-live'
    );
  });
});
