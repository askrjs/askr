import type { RenderableChild } from '../common/vnode';
import type { JSXElement } from '../common/jsx';
import type { ObjectSchema } from '@askrjs/schema';
import { state } from '../runtime';
import { getCurrentRenderData } from '../common/render-context';
import {
  invalidateQueriesForRuntime,
  resolveDataRuntimeState,
} from '../data/data-runtime';
import { readActionFramework } from './runtime';

function csrfToken(): string | undefined {
  const value =
    getCurrentRenderData()?.framework.csrf ?? readActionFramework().csrf;
  return typeof value === 'string' ? value : undefined;
}

export interface ActionDescriptor<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly input: ObjectSchema<TInput>;
  readonly invalidates: readonly string[];
}
export function defineAction<TInput extends Record<string, unknown>>(options: {
  readonly id: string;
  readonly input: ObjectSchema<TInput>;
  readonly invalidates?: readonly string[];
}): ActionDescriptor<TInput> {
  if (!options.id) throw new Error('defineAction requires a stable id.');
  if (options.input.kind !== 'object')
    throw new Error('defineAction input must be an object schema.');
  return Object.freeze({
    id: options.id,
    input: options.input,
    invalidates: Object.freeze([...(options.invalidates ?? [])]),
  });
}
/** A native form bound to a declared action; it is not a synthetic event API. */
export function ActionForm<TInput extends Record<string, unknown>>({
  action,
  children,
  ...props
}: {
  readonly action: ActionDescriptor<TInput>;
  readonly children?: RenderableChild;
  readonly [key: string]: unknown;
}): JSXElement {
  const token = csrfToken();
  return (
    <form {...props} method="post">
      <input type="hidden" name="_askr_action" value={action.id} />
      {token ? <input type="hidden" name="_csrf" value={token} /> : null}
      {children}
    </form>
  );
}
export interface ActionValidationError {
  readonly kind: 'invalid';
  readonly action: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly issues: readonly unknown[];
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
}
export interface ActionStatus<TResult = unknown> {
  readonly pending: boolean;
  readonly result?: TResult;
  readonly error?: unknown;
}

function validationError(
  value: unknown,
  actionId: string
): ActionValidationError | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const replay = value as Partial<ActionValidationError>;
  if (replay.kind !== 'invalid' || replay.action !== actionId) return undefined;
  if (!replay.values || !Array.isArray(replay.issues) || !replay.fieldErrors)
    return undefined;
  return replay as ActionValidationError;
}

function initialStatus<TResult>(actionId: string): ActionStatus<TResult> {
  const replay = validationError(
    getCurrentRenderData()?.framework.action ?? readActionFramework().action,
    actionId
  );
  return replay ? { pending: false, error: replay } : { pending: false };
}

function normalizeActionRedirect(value: string): string {
  const current = new URL(location.href);
  const target = new URL(value, current);
  if (
    (target.protocol !== 'http:' && target.protocol !== 'https:') ||
    target.origin !== current.origin
  ) {
    throw new TypeError('Action redirects must stay on the current origin.');
  }
  return `${target.pathname}${target.search}${target.hash}`;
}

/** Returns a command handle, rather than a hook. */
export function action<
  TInput extends Record<string, unknown>,
  TResult = unknown,
>(descriptor: ActionDescriptor<TInput>) {
  const token = csrfToken();
  const runtime = resolveDataRuntimeState();
  const value = state<ActionStatus<TResult>>(
    initialStatus<TResult>(descriptor.id)
  );
  const setValue = value.set;
  let submissionGeneration = 0;
  return {
    state: value,
    async submit(input: TInput): Promise<TResult> {
      const generation = ++submissionGeneration;
      // Keep the last settled result visible while a replacement submission
      // is in flight. This is important for hydrated forms, where users may
      // submit again before the first request settles.
      setValue((previous) => ({ pending: true, result: previous.result }));
      try {
        const response = await fetch(location.href, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/vnd.askr.action+json;v=1',
            'x-askr-action': descriptor.id,
            ...(token ? { 'x-askr-csrf-token': token } : {}),
          },
          body: JSON.stringify(input),
        });
        const envelope = (await response.json()) as {
          result?: TResult;
          error?: unknown;
          invalidates?: unknown;
          redirect?: unknown;
          kind?: unknown;
          action?: unknown;
          values?: unknown;
          issues?: unknown;
          fieldErrors?: unknown;
        };
        if (!response.ok) {
          throw (
            envelope.error ??
            validationError(envelope, descriptor.id) ??
            new Error(`Action failed (${response.status}).`)
          );
        }
        const redirect =
          typeof envelope.redirect === 'string'
            ? normalizeActionRedirect(envelope.redirect)
            : undefined;
        const invalidates = Array.isArray(envelope.invalidates)
          ? envelope.invalidates.filter(
              (prefix): prefix is string => typeof prefix === 'string'
            )
          : descriptor.invalidates;
        for (const prefix of invalidates)
          invalidateQueriesForRuntime(runtime, prefix, true);
        if (generation === submissionGeneration) {
          setValue({ pending: false, result: envelope.result });
          if (redirect) location.assign(redirect);
        }
        return envelope.result as TResult;
      } catch (error) {
        if (generation === submissionGeneration) {
          setValue({ pending: false, error });
        }
        throw error;
      }
    },
  };
}
