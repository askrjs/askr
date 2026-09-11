import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { StateTuple, state } from './state.js';
import { RenderableChild } from './context.js';
import { on } from './lifecycle.js';
import { invalidate } from './data.js';

/** A declared server action, built by {@link defineAction}, bound to a form via {@link ActionForm}. */
interface ActionDescriptor<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly input: ObjectSchema<TInput>;
  readonly invalidates: readonly string[];
}

/** Declare a server action with a stable id, input schema, and query prefixes to invalidate on success. */
declare function defineAction<TInput extends Record<string, unknown>>(options: {
  readonly id: string;
  readonly input: ObjectSchema<TInput>;
  readonly invalidates?: readonly string[];
}): ActionDescriptor<TInput>;

/** A native form bound to a declared action; it is not a synthetic event API. */
declare function ActionForm<TInput extends Record<string, unknown>>({
  action,
  children,
  ...props
}: {
  readonly action: ActionDescriptor<TInput>;
  readonly children?: RenderableChild;
  readonly [key: string]: unknown;
}): JSXElement;

/** Server-replayed validation failure for an {@link ActionForm} submission. */
interface ActionValidationError {
  readonly kind: 'invalid';
  readonly action: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly issues: readonly unknown[];
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
}

/** Pending/result/error status for an action, as reported by the `action()` hook. */
interface ActionStatus<TResult = unknown> {
  readonly pending: boolean;
  readonly result?: TResult;
  readonly error?: unknown;
}

/** Returns a command handle, rather than a hook. */
declare function action<
  TInput extends Record<string, unknown>,
  TResult = unknown,
>(
  descriptor: ActionDescriptor<TInput>
): {
  state: StateTuple<ActionStatus<TResult>>;
  submit(input: TInput): Promise<TResult>;
};
export {
  ActionDescriptor,
  defineAction,
  ActionForm,
  ActionValidationError,
  ActionStatus,
  action,
};
