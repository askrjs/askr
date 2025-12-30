import { bench, describe } from 'vitest';
import { mergeProps } from '../../src/foundations/utilities/mergeProps';

describe('mergeProps (FOUNDATIONS)', () => {
  const baseSmall = { className: 'base', id: 'main' };
  const injectedSmall = { className: 'injected', 'data-test': 'value' };

  const baseMedium = {
    className: 'base',
    id: 'main',
    role: 'button',
    tabIndex: 0,
    'aria-label': 'Click me',
  };
  const injectedMedium = {
    className: 'injected',
    'data-test': 'value',
    'data-id': '123',
    style: { color: 'red' },
    disabled: true,
  };

  const baseLarge = {
    className: 'base',
    id: 'main',
    role: 'button',
    tabIndex: 0,
    'aria-label': 'Click me',
    'aria-disabled': 'false',
    'data-foo': '1',
    'data-bar': '2',
    'data-baz': '3',
    onClick: () => {},
  };
  const injectedLarge = {
    className: 'injected',
    'data-test': 'value',
    'data-id': '123',
    'data-extra-1': 'a',
    'data-extra-2': 'b',
    'data-extra-3': 'c',
    'data-extra-4': 'd',
    style: { color: 'red' },
    disabled: true,
    title: 'Tooltip',
  };

  const handler1 = () => {};
  const handler2 = () => {};
  const baseWithHandlers = {
    className: 'base',
    onClick: handler1,
    onMouseEnter: handler1,
    onFocus: handler1,
  };
  const injectedWithHandlers = {
    className: 'injected',
    onClick: handler2,
    onMouseEnter: handler2,
    onKeyDown: handler2,
  };

  bench('merge small props (2 props each)', () => {
    mergeProps(baseSmall, injectedSmall);
  });

  bench('merge medium props (5 props each)', () => {
    mergeProps(baseMedium, injectedMedium);
  });

  bench('merge large props (10 props each)', () => {
    mergeProps(baseLarge, injectedLarge);
  });

  bench('merge with event handlers (3-4 handlers)', () => {
    mergeProps(baseWithHandlers, injectedWithHandlers);
  });

  bench('merge empty objects', () => {
    mergeProps({}, {});
  });

  bench('merge base only (no injected props)', () => {
    mergeProps(baseMedium, {});
  });

  bench('merge injected only (no base props)', () => {
    mergeProps({}, injectedMedium);
  });

  // Realistic scenario: component prop forwarding
  bench('realistic: button props merge', () => {
    const baseButtonProps = {
      type: 'button' as const,
      className: 'btn btn-primary',
      disabled: false,
      onClick: () => {},
    };
    const userProps = {
      className: 'custom-class',
      'aria-label': 'Submit',
      onClick: () => {},
    };
    mergeProps(baseButtonProps, userProps);
  });
});
