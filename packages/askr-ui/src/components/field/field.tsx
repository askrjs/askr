import { Slot, mergeProps } from '@askrjs/askr/foundations';
import type {
  FieldControlAsChildProps,
  FieldControlProps,
  FieldDescriptionAsChildProps,
  FieldDescriptionProps,
  FieldErrorAsChildProps,
  FieldErrorProps,
  FieldLabelAsChildProps,
  FieldLabelProps,
  FieldProps,
} from './field.types';

function resolveFieldId(explicitId?: string): string {
  if (explicitId) {
    return explicitId;
  }

  throw new Error(
    'Field subcomponents require a shared fieldId when used with the current runtime'
  );
}

export function Field(props: FieldProps) {
  const {
    children,
    ref,
    id,
    invalid = false,
    required = false,
    disabled = false,
    ...rest
  } = props;

  const finalProps = mergeProps(rest, {
    ref,
    id,
    'data-slot': 'field',
    'data-invalid': invalid ? 'true' : undefined,
    'data-required': required ? 'true' : undefined,
    'data-disabled': disabled ? 'true' : undefined,
  });

  return <div {...finalProps}>{children}</div>;
}

export function FieldLabel(props: FieldLabelProps): JSX.Element;
export function FieldLabel(props: FieldLabelAsChildProps): JSX.Element;
export function FieldLabel(props: FieldLabelProps | FieldLabelAsChildProps) {
  const { asChild, children, ref, fieldId, ...rest } = props;
  const baseId = resolveFieldId(fieldId);
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'field-label',
    for: `${baseId}-control`,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <label {...finalProps}>{children}</label>;
}

export function FieldDescription(props: FieldDescriptionProps): JSX.Element;
export function FieldDescription(
  props: FieldDescriptionAsChildProps
): JSX.Element;
export function FieldDescription(
  props: FieldDescriptionProps | FieldDescriptionAsChildProps
) {
  const { asChild, children, ref, fieldId, ...rest } = props;
  const baseId = resolveFieldId(fieldId);
  const finalProps = mergeProps(rest, {
    ref,
    id: `${baseId}-description`,
    'data-slot': 'field-description',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function FieldError(props: FieldErrorProps): JSX.Element;
export function FieldError(props: FieldErrorAsChildProps): JSX.Element;
export function FieldError(props: FieldErrorProps | FieldErrorAsChildProps) {
  const { asChild, children, ref, fieldId, ...rest } = props;
  const baseId = resolveFieldId(fieldId);
  const finalProps = mergeProps(rest, {
    ref,
    id: `${baseId}-error`,
    'data-slot': 'field-error',
    role: 'alert',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function FieldControl(props: FieldControlProps): JSX.Element;
export function FieldControl(props: FieldControlAsChildProps): JSX.Element;
export function FieldControl(
  props: FieldControlProps | FieldControlAsChildProps
) {
  const {
    asChild,
    children,
    ref,
    fieldId,
    invalid = false,
    required = false,
    disabled = false,
    ...rest
  } = props;
  const baseId = resolveFieldId(fieldId);
  const describedBy = [
    `${baseId}-description`,
    invalid ? `${baseId}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const finalProps = mergeProps(rest, {
    ref,
    id: `${baseId}-control`,
    'aria-describedby': describedBy || undefined,
    'data-slot': 'field-control',
    'data-disabled': disabled ? 'true' : undefined,
    'data-invalid': invalid ? 'true' : undefined,
    'data-required': required ? 'true' : undefined,
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-required': required ? 'true' : undefined,
    'aria-disabled': disabled ? 'true' : undefined,
    disabled: disabled ? true : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
