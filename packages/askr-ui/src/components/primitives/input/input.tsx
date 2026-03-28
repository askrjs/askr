import { debounceEvent } from '@askrjs/askr/fx';
import { Slot, focusable, mergeProps } from '@askrjs/askr/foundations';
import type {
  DebouncedInputProps,
  InputAsChildProps,
  InputEvent,
  InputInputProps,
} from './input.types';

export function Input(props: InputInputProps): JSX.Element;
export function Input(props: InputAsChildProps): JSX.Element;
export function Input(props: InputInputProps | InputAsChildProps) {
  const { asChild, children, disabled = false, ref, tabIndex, ...rest } = props;

  const focusProps = focusable({ disabled, tabIndex });
  const finalProps = mergeProps(rest, {
    ...focusProps,
    'data-slot': 'input',
    'data-disabled': disabled ? 'true' : undefined,
    ref,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <input {...finalProps} disabled={disabled} />;
}

export function DebouncedInput(props: DebouncedInputProps) {
  const {
    debounceMs = 180,
    onDebouncedInput,
    onInput,
    type = 'search',
    disabled = false,
    ...rest
  } = props;

  const isDisabled = disabled === true;
  const emitDebouncedInput =
    onDebouncedInput && debounceMs > 0
      ? debounceEvent(debounceMs, (event) => {
          onDebouncedInput((event.target as HTMLInputElement).value);
        })
      : null;

  const handleInput = (event: Event) => {
    const inputEvent = event as InputEvent;
    onInput?.(inputEvent);

    if (!onDebouncedInput || isDisabled) {
      emitDebouncedInput?.cancel();
      return;
    }

    const value = (inputEvent.target as HTMLInputElement).value;
    if (debounceMs <= 0) {
      emitDebouncedInput?.cancel();
      onDebouncedInput(value);
      return;
    }

    emitDebouncedInput?.(inputEvent);
  };

  return (
    <Input {...rest} disabled={isDisabled} type={type} onInput={handleInput} />
  );
}
