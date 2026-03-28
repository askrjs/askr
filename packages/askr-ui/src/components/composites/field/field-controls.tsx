import { Checkbox } from '../../primitives/checkbox';
import { Input } from '../../primitives/input';
import { RadioGroup } from '../../primitives/radio-group';
import { SelectTrigger } from '../../primitives/select';
import { Switch } from '../../primitives/switch';
import type {
  FieldCheckboxProps,
  FieldInputProps,
  FieldRadioGroupProps,
  FieldSelectTriggerProps,
  FieldSwitchProps,
} from './field-types';
import type { InjectedFieldProps } from './field-shared';
import { resolveFieldState } from './field-shared';

export function FieldInput(props: FieldInputProps & InjectedFieldProps) {
  const {
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
    ...rest
  } = props;
  const {
    baseId,
    describedBy,
    resolvedInvalid,
    resolvedRequired,
    resolvedDisabled,
  } = resolveFieldState({
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
  });

  return (
    <Input
      {...rest}
      id={`${baseId}-control`}
      aria-describedby={describedBy}
      aria-invalid={resolvedInvalid ? 'true' : undefined}
      aria-required={resolvedRequired ? 'true' : undefined}
      aria-disabled={resolvedDisabled ? 'true' : undefined}
      disabled={resolvedDisabled}
      required={resolvedRequired}
      data-slot="field-input"
      data-invalid={resolvedInvalid ? 'true' : undefined}
      data-required={resolvedRequired ? 'true' : undefined}
      data-disabled={resolvedDisabled ? 'true' : undefined}
    />
  );
}

export function FieldSelectTrigger(
  props: FieldSelectTriggerProps & InjectedFieldProps
) {
  const {
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
    ...rest
  } = props;
  const {
    baseId,
    describedBy,
    resolvedInvalid,
    resolvedRequired,
    resolvedDisabled,
  } = resolveFieldState({
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
  });

  return (
    <SelectTrigger
      {...rest}
      id={`${baseId}-control`}
      aria-describedby={describedBy}
      aria-invalid={resolvedInvalid ? 'true' : undefined}
      aria-required={resolvedRequired ? 'true' : undefined}
      aria-disabled={resolvedDisabled ? 'true' : undefined}
      disabled={resolvedDisabled}
      data-slot="field-select-trigger"
      data-invalid={resolvedInvalid ? 'true' : undefined}
      data-required={resolvedRequired ? 'true' : undefined}
      data-disabled={resolvedDisabled ? 'true' : undefined}
    />
  );
}

export function FieldCheckbox(props: FieldCheckboxProps & InjectedFieldProps) {
  const {
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
    ...rest
  } = props;
  const {
    baseId,
    describedBy,
    resolvedInvalid,
    resolvedRequired,
    resolvedDisabled,
  } = resolveFieldState({
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
  });

  return (
    <Checkbox
      {...rest}
      id={`${baseId}-control`}
      aria-describedby={describedBy}
      aria-invalid={resolvedInvalid ? 'true' : undefined}
      aria-required={resolvedRequired ? 'true' : undefined}
      aria-disabled={resolvedDisabled ? 'true' : undefined}
      disabled={resolvedDisabled}
      required={resolvedRequired}
      data-slot="field-checkbox"
      data-invalid={resolvedInvalid ? 'true' : undefined}
      data-required={resolvedRequired ? 'true' : undefined}
      data-disabled={resolvedDisabled ? 'true' : undefined}
    />
  );
}

export function FieldSwitch(props: FieldSwitchProps & InjectedFieldProps) {
  const {
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
    ...rest
  } = props;
  const {
    baseId,
    describedBy,
    resolvedInvalid,
    resolvedRequired,
    resolvedDisabled,
  } = resolveFieldState({
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
  });

  return (
    <Switch
      {...rest}
      id={`${baseId}-control`}
      aria-describedby={describedBy}
      aria-invalid={resolvedInvalid ? 'true' : undefined}
      aria-required={resolvedRequired ? 'true' : undefined}
      aria-disabled={resolvedDisabled ? 'true' : undefined}
      disabled={resolvedDisabled}
      required={resolvedRequired}
      data-slot="field-switch"
      data-invalid={resolvedInvalid ? 'true' : undefined}
      data-required={resolvedRequired ? 'true' : undefined}
      data-disabled={resolvedDisabled ? 'true' : undefined}
    />
  );
}

export function FieldRadioGroup(
  props: FieldRadioGroupProps & InjectedFieldProps
) {
  const {
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
    ...rest
  } = props;
  const {
    baseId,
    describedBy,
    resolvedInvalid,
    resolvedRequired,
    resolvedDisabled,
  } = resolveFieldState({
    fieldId,
    invalid,
    required,
    disabled,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
  });

  return (
    <RadioGroup
      {...rest}
      id={`${baseId}-control`}
      aria-describedby={describedBy}
      aria-invalid={resolvedInvalid ? 'true' : undefined}
      aria-required={resolvedRequired ? 'true' : undefined}
      aria-disabled={resolvedDisabled ? 'true' : undefined}
      disabled={resolvedDisabled}
      data-slot="field-radio-group"
      data-invalid={resolvedInvalid ? 'true' : undefined}
      data-required={resolvedRequired ? 'true' : undefined}
      data-disabled={resolvedDisabled ? 'true' : undefined}
    />
  );
}
