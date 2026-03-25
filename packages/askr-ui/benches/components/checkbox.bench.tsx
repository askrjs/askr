import { bench, describe } from 'vite-plus/test';
import {
  Checkbox,
  type CheckboxAsChildProps,
  type CheckboxInputProps,
} from '../../src/components/checkbox';

describe('Checkbox benches', () => {
  bench('create native <input type="checkbox">', () => {
    Checkbox({} as CheckboxInputProps);
  });

  bench('create with checked state', () => {
    Checkbox({ checked: true } as CheckboxInputProps);
  });

  bench('create with indeterminate state', () => {
    Checkbox({ checked: true, indeterminate: true } as CheckboxInputProps);
  });

  bench('create with asChild and prop merging', () => {
    const child = <div />;
    Checkbox({
      asChild: true,
      children: child,
      checked: false,
      'data-test': 'ok',
      onPress: () => {},
    } as CheckboxAsChildProps);
  });

  bench('activation - dispatch click on native input (with handler)', () => {
    const fn = () => {};
    const el = Checkbox({
      onPress: fn,
    } as CheckboxInputProps) as unknown as Element;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  bench('activation - dispatch click on asChild child (with handler)', () => {
    const fn = () => {};
    const child = <div />;
    const el = Checkbox({
      asChild: true,
      children: child,
      onPress: fn,
      checked: false,
    } as CheckboxAsChildProps) as unknown as Element;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  bench('state transitions - checked false -> true -> false', () => {
    Checkbox({ checked: false } as CheckboxInputProps);
    Checkbox({ checked: true } as CheckboxInputProps);
    Checkbox({ checked: false } as CheckboxInputProps);
  });

  bench('state transitions - indeterminate toggling', () => {
    Checkbox({ checked: false, indeterminate: false } as CheckboxInputProps);
    Checkbox({ checked: true, indeterminate: true } as CheckboxInputProps);
    Checkbox({ checked: true, indeterminate: false } as CheckboxInputProps);
  });
});
