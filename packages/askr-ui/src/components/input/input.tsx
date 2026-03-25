import { getSignal, state } from '@askrjs/askr';
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

  const signal = getSignal();
  const isDisabled = disabled === true;
  const debounceState = state<{
    timer: ReturnType<typeof setTimeout> | null;
    cleanupRegistered: boolean;
  }>({
    timer: null,
    cleanupRegistered: false,
  });

  const clearDebounce = () => {
    const pending = debounceState().timer;
    if (pending !== null) {
      clearTimeout(pending);
      debounceState().timer = null;
    }
  };

  if (!debounceState().cleanupRegistered) {
    debounceState().cleanupRegistered = true;
    signal.addEventListener('abort', clearDebounce, { once: true });
  }

  const handleInput = (event: Event) => {
    const inputEvent = event as InputEvent;
    onInput?.(inputEvent);

    if (!onDebouncedInput || isDisabled) {
      clearDebounce();
      return;
    }

    const value = (inputEvent.target as HTMLInputElement).value;
    if (debounceMs <= 0) {
      clearDebounce();
      onDebouncedInput(value);
      return;
    }

    clearDebounce();
    debounceState().timer = setTimeout(() => {
      debounceState().timer = null;
      onDebouncedInput(value);
    }, debounceMs);
  };

  return (
    <Input {...rest} disabled={isDisabled} type={type} onInput={handleInput} />
  );
}
