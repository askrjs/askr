export type InjectedFieldProps = {
  __fieldId?: string;
  __fieldInvalid?: boolean;
  __fieldRequired?: boolean;
  __fieldDisabled?: boolean;
};

export type ResolvedFieldState = {
  baseId: string;
  describedBy?: string;
  resolvedInvalid: boolean;
  resolvedRequired: boolean;
  resolvedDisabled: boolean;
};

export function resolveFieldId(
  explicitId?: string,
  injectedFieldId?: string
): string {
  if (injectedFieldId) {
    return injectedFieldId;
  }

  if (explicitId) {
    return explicitId;
  }

  throw new Error(
    'Field subcomponents require a shared fieldId when used with the current runtime'
  );
}

export function resolveFieldState(props: {
  fieldId?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  __fieldId?: string;
  __fieldInvalid?: boolean;
  __fieldRequired?: boolean;
  __fieldDisabled?: boolean;
}): ResolvedFieldState {
  const resolvedInvalid = props.invalid ?? props.__fieldInvalid ?? false;
  const resolvedRequired = props.required ?? props.__fieldRequired ?? false;
  const resolvedDisabled = props.disabled ?? props.__fieldDisabled ?? false;
  const baseId = resolveFieldId(props.fieldId, props.__fieldId);
  const describedBy = [
    `${baseId}-description`,
    resolvedInvalid ? `${baseId}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    baseId,
    describedBy: describedBy || undefined,
    resolvedInvalid,
    resolvedRequired,
    resolvedDisabled,
  };
}
