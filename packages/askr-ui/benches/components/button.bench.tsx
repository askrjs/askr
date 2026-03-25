import { bench, describe } from 'vite-plus/test';
import { Button, type ButtonButtonProps } from '../../src/components/button';

describe('Button benches', () => {
  bench('create native <button>', () => {
    Button({ children: 'bench' } as unknown as ButtonButtonProps);
  });

  bench('create with asChild and prop merging', () => {
    const child = document.createElement('div');
    Button({
      asChild: true,
      children: child,
      'data-test': 'ok',
      onPress: () => {},
    } as unknown as ButtonButtonProps);
  });

  bench('activation - dispatch click on native button (with handler)', () => {
    const fn = () => {};
    const el = Button({
      children: 'x',
      onPress: fn,
    } as unknown as ButtonButtonProps) as unknown as HTMLElement;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  bench('activation - dispatch click on asChild child (with handler)', () => {
    const fn = () => {};
    const child = document.createElement('div');
    const el = Button({
      asChild: true,
      children: child,
      onPress: fn,
    } as unknown as ButtonButtonProps) as unknown as HTMLElement;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
});
