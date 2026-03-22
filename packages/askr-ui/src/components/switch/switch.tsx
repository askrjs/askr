import {
  Slot,
  controllableState,
  mergeProps,
  pressable,
} from '@askrjs/askr/foundations';
import type { SwitchAsChildProps, SwitchButtonProps } from './switch.types';

export function Switch(props: SwitchButtonProps): JSX.Element;
export function Switch(props: SwitchAsChildProps): JSX.Element;
export function Switch(props: SwitchButtonProps | SwitchAsChildProps) {
  const {
    asChild,
    children,
    checked,
    defaultChecked = false,
    onCheckedChange,
    disabled = false,
    required = false,
    name,
    value = 'on',
    ref,
    type: typeProp,
    ...rest
  } = props;

  const checkedState = controllableState({
    value: checked,
    defaultValue: defaultChecked,
    onChange: onCheckedChange,
  });
  const currentChecked = checkedState();

  const interactionProps = pressable({
    disabled,
    onPress: () => checkedState.set(!checkedState()),
    isNativeButton: !asChild,
  });

  const finalProps = mergeProps(rest, {
    ...interactionProps,
    ref,
    role: 'switch',
    'aria-checked': currentChecked ? 'true' : 'false',
    'data-slot': 'switch',
    'data-disabled': disabled ? 'true' : undefined,
    'data-state': currentChecked ? 'checked' : 'unchecked',
  });

  const hiddenInput = name ? (
    <input
      type="checkbox"
      hidden
      aria-hidden="true"
      tabIndex={-1}
      name={name}
      value={value}
      checked={currentChecked}
      required={required}
      disabled={disabled}
    />
  ) : null;

  if (asChild) {
    return (
      <>
        {hiddenInput}
        <Slot asChild {...finalProps} children={children} />
      </>
    );
  }

  return (
    <>
      {hiddenInput}
      <button type={typeProp ?? 'button'} {...finalProps}>
        {children}
      </button>
    </>
  );
}
