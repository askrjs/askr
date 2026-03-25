import { bench, describe } from 'vite-plus/test';
import {
  Toggle,
  type ToggleAsChildProps,
  type ToggleButtonProps,
} from '../../src/components/toggle';

describe('Toggle benches', () => {
  bench('create native <button>', () => {
    Toggle({ children: 'bench' } as ToggleButtonProps);
  });

  bench('create with pressed state', () => {
    Toggle({ children: 'bench', pressed: true } as ToggleButtonProps);
  });

  bench('create with asChild and prop merging', () => {
    const child = <div />;
    Toggle({
      asChild: true,
      children: child,
      pressed: false,
      'data-test': 'ok',
      onPress: () => {},
    } as ToggleAsChildProps);
  });

  bench('activation - dispatch click on native button (with handler)', () => {
    const fn = () => {};
    const el = Toggle({
      children: 'x',
      onPress: fn,
    } as ToggleButtonProps) as unknown as Element;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  bench('activation - dispatch click on asChild child (with handler)', () => {
    const fn = () => {};
    const child = <div />;
    const el = Toggle({
      asChild: true,
      children: child,
      onPress: fn,
      pressed: false,
    } as ToggleAsChildProps) as unknown as Element;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
});
