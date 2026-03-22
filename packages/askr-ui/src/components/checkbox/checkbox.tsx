import { Slot, mergeProps } from '@askrjs/askr/foundations';
import type {
  CheckboxInputProps,
  CheckboxAsChildProps,
  PressEvent,
} from './checkbox.types';

/**
 * Headless Checkbox component
 *
 * ## Responsibilities
 * - Apply aria-checked for checkbox state signaling
 * - Handle indeterminate state via aria-checked='mixed'
 * - Forward props and refs to native input or child element
 * - Delegate keyboard/mouse interaction to native input semantics
 *
 * ## Non-Responsibilities
 * - Custom keyboard event handling (native inputs handle this)
 * - Custom pointer event handling (delegated to onPress via wrapper)
 *
 * ## Invariants
 * - MUST NOT add role="button" (native inputs are role="checkbox")
 * - checked state is CONTROLLED (consumer manages state)
 * - indeterminate overrides checked for aria-checked value
 * - For asChild, consumer MUST provide role="checkbox"
 *
 * @example Native checkbox input
 * ```tsx
 * const [checked, setChecked] = useState(false);
 * <Checkbox checked={checked} onPress={() => setChecked(!checked)} />
 * ```
 *
 * @example Polymorphic rendering (asChild)
 * ```tsx
 * <Checkbox asChild checked={agreed} onPress={toggleAgree}>
 *   <div role="checkbox">I agree to terms</div>
 * </Checkbox>
 * ```
 *
 * @example Indeterminate state (partial selection)
 * ```tsx
 * <Checkbox checked={someChecked} indeterminate={!allChecked && someChecked} onPress={toggleAll}>
 *   Select All
 * </Checkbox>
 * ```
 */
export function Checkbox(props: CheckboxInputProps): JSX.Element;
export function Checkbox(props: CheckboxAsChildProps): JSX.Element;
export function Checkbox(props: CheckboxInputProps | CheckboxAsChildProps) {
  const {
    asChild,
    children,
    onPress,
    checked = false,
    indeterminate = false,
    disabled = false,
    required = false,
    name,
    value,
    ref,
    ...rest
  } = props;

  const ariaChecked = indeterminate ? 'mixed' : checked ? 'true' : 'false';
  const dataState = indeterminate
    ? 'indeterminate'
    : checked
      ? 'checked'
      : 'unchecked';

  if (asChild) {
    const interactionProps = disabled
      ? {
          'aria-disabled': 'true' as const,
          tabIndex: -1,
        }
      : {
          onClick: onPress
            ? (e: Event) => {
                onPress(e as PressEvent);
              }
            : undefined,
          onKeyDown: onPress
            ? (e: KeyboardEvent) => {
                if (e.key === ' ') {
                  e.preventDefault();
                }
                if (e.key === 'Enter') {
                  onPress(e as unknown as PressEvent);
                }
              }
            : undefined,
          onKeyUp: onPress
            ? (e: KeyboardEvent) => {
                if (e.key === ' ') {
                  onPress(e as unknown as PressEvent);
                }
              }
            : undefined,
          tabIndex: 0,
        };

    const finalProps = mergeProps(rest, {
      ...interactionProps,
      'aria-checked': ariaChecked,
      'data-slot': 'checkbox',
      'data-disabled': disabled ? 'true' : undefined,
      'data-state': dataState,
      ref,
    });

    return <Slot asChild {...finalProps} children={children} />;
  }

  const finalProps = mergeProps(rest, {
    ref,
    onClick: onPress
      ? (e: Event) => {
          onPress(e as PressEvent);
        }
      : undefined,
    'aria-checked': indeterminate ? undefined : ariaChecked,
    'aria-disabled': disabled ? 'true' : undefined,
    'data-slot': 'checkbox',
    'data-disabled': disabled ? 'true' : undefined,
    'data-state': dataState,
  });

  return (
    <input
      type="checkbox"
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      required={required}
      name={name}
      value={value}
      {...finalProps}
    />
  );
}
