import { mergeProps } from '@askrjs/askr/foundations';
import { mapJsxTree } from '../../_internal/jsx';
import type {
  FieldLegendProps,
  FieldProps,
  FieldRowProps,
  FieldsetProps,
} from './field-types';
import {
  FieldCheckbox,
  FieldInput,
  FieldRadioGroup,
  FieldSelectTrigger,
  FieldSwitch,
} from './field-controls';
import { FieldDescription, FieldError, FieldLabel } from './field-text';
import type { InjectedFieldProps } from './field-shared';

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

  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== FieldLabel &&
      element.type !== FieldDescription &&
      element.type !== FieldError &&
      element.type !== FieldInput &&
      element.type !== FieldSelectTrigger &&
      element.type !== FieldCheckbox &&
      element.type !== FieldSwitch &&
      element.type !== FieldRadioGroup &&
      element.type !== FieldRow
    ) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        __fieldId: id,
        __fieldInvalid: invalid,
        __fieldRequired: required,
        __fieldDisabled: disabled,
      },
    };
  });

  const finalProps = mergeProps(rest, {
    ref,
    id,
    'data-slot': 'field',
    'data-invalid': invalid ? 'true' : undefined,
    'data-required': required ? 'true' : undefined,
    'data-disabled': disabled ? 'true' : undefined,
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

export function Fieldset(props: FieldsetProps) {
  const {
    children,
    ref,
    invalid = false,
    required = false,
    disabled = false,
    ...rest
  } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'fieldset',
    'data-invalid': invalid ? 'true' : undefined,
    'data-required': required ? 'true' : undefined,
    'data-disabled': disabled ? 'true' : undefined,
    disabled: disabled ? true : undefined,
  });

  return <fieldset {...finalProps}>{children}</fieldset>;
}

export function FieldLegend(props: FieldLegendProps) {
  const { children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'field-legend',
  });

  return <legend {...finalProps}>{children}</legend>;
}

export function FieldRow(props: FieldRowProps & InjectedFieldProps) {
  const {
    children,
    ref,
    __fieldId,
    __fieldInvalid,
    __fieldRequired,
    __fieldDisabled,
    ...rest
  } = props;

  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== FieldLabel &&
      element.type !== FieldDescription &&
      element.type !== FieldError &&
      element.type !== FieldInput &&
      element.type !== FieldSelectTrigger &&
      element.type !== FieldCheckbox &&
      element.type !== FieldSwitch &&
      element.type !== FieldRadioGroup
    ) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        __fieldId,
        __fieldInvalid,
        __fieldRequired,
        __fieldDisabled,
      },
    };
  });

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'field-row',
  });

  return <label {...finalProps}>{enhancedChildren}</label>;
}
