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
  const debounceTimer = state<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRegistered = state(false);

  const clearDebounce = () => {
    const pending = debounceTimer();
    if (pending !== null) {
      clearTimeout(pending);
      debounceTimer.set(null);
    }
  };

  if (!cleanupRegistered()) {
    cleanupRegistered.set(true);
    signal.addEventListener(
      'abort',
      () => {
        clearDebounce();
      },
      { once: true }
    );
  }

  const handleInput = (event: Event) => {
    const inputEvent = event as InputEvent;
    onInput?.(inputEvent);

    if (!onDebouncedInput || isDisabled) {
      clearDebounce();
      return;
    }

    const value = inputEvent.currentTarget.value;
    if (debounceMs <= 0) {
      clearDebounce();
      onDebouncedInput(value);
      return;
    }

    clearDebounce();
    debounceTimer.set(
      setTimeout(() => {
        debounceTimer.set(null);
        onDebouncedInput(value);
      }, debounceMs)
    );
  };

  return (
    <Input {...rest} disabled={isDisabled} type={type} onInput={handleInput} />
  );
}
