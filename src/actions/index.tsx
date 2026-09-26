import type { RenderableChild } from '../common/vnode';
import type { JSXElement } from '../common/jsx';
import type { ObjectSchema } from '@askrjs/schema';
import { state } from '../core/api/state';
import { getCurrentRenderData } from '../common/render-context';
import {
  invalidateQueriesForRuntime,
  resolveDataRuntimeState,
} from '../data/data-runtime';
import { readActionFramework } from './runtime';
import { isCurrentAsyncGeneration } from '../data/shared';
import { resolveNavigationUrl } from '../common/url';

const actionSubmissionGenerations = new WeakMap<object, number>();

function csrfToken(): string | undefined {
  const value =
    getCurrentRenderData()?.framework.csrf ?? readActionFramework().csrf;
  return typeof value === 'string' ? value : undefined;
}

/** A declared server action, built by {@link defineAction}, bound to a form via {@link ActionForm}. */
export interface ActionDescriptor<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly input: ObjectSchema<TInput>;
  readonly invalidates: readonly string[];
}
/** Declare a server action with a stable id, input schema, and query prefixes to invalidate on success. */
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
/** Server-replayed validation failure for an {@link ActionForm} submission. */
export interface ActionValidationError {
  readonly kind: 'invalid';
  readonly action: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly issues: readonly unknown[];
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
}
/** Pending/result/error status for an action, as reported by the `action()` hook. */
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

/**
 * Validate an action redirect and return its absolute URL. Path-like targets
 * that leave the origin, including dot segments that collapse to `//host`,
 * are refused by {@link resolveNavigationUrl}; explicit URLs on another origin
 * are refused here. The absolute form keeps `location.assign()` on the origin.
 */
function normalizeActionRedirect(value: string): string {
  const current = new URL(location.href);
  const target = resolveNavigationUrl(value, current.href);
  if (
    (target.protocol !== 'http:' && target.protocol !== 'https:') ||
    target.origin !== current.origin
  ) {
    throw new TypeError('Action redirects must stay on the current origin.');
  }
  return target.href;
}

/**
 * The `Error` an action submission rejects with for a failed or unreadable
 * response. The message always carries the HTTP status, plus a string
 * error, or the `detail`, `message`, or `title` of an error object or RFC 7807
 * problem body. The server value, or the body parse failure, is kept as
 * `cause`.
 */
function actionFailure(status: number, cause?: unknown): Error {
  let detail = typeof cause === 'string' ? cause : undefined;
  if (cause && typeof cause === 'object' && !(cause instanceof Error)) {
    const fields = cause as Record<string, unknown>;
    detail = [fields.detail, fields.message, fields.title].find(
      (field): field is string => typeof field === 'string'
    );
  }
  const error = new Error(
    detail
      ? `Action failed (${status}): ${detail}`
      : `Action failed (${status}).`
  );
  if (cause !== undefined) {
    (error as Error & { cause?: unknown }).cause = cause;
  }
  return error;
}

/**
 * Bind an action descriptor to the calling component and return its
 * `{ state, submit }` handle. `action()` allocates its status with `state()`,
 * so it follows the same rule: call it during component render, at the top
 * level and in the same order on every render. `submit()` itself may be
 * called from event handlers or other async work.
 */
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
  return {
    state: value,
    async submit(input: TInput): Promise<TResult> {
      const generation = (actionSubmissionGenerations.get(value) ?? 0) + 1;
      actionSubmissionGenerations.set(value, generation);
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
        let parsed: unknown;
        try {
          const body = await response.text();
          // A bodiless success (204/205 or an empty 2xx) is a completed
          // mutation with no result; it still runs declared invalidations.
          parsed = response.ok && body === '' ? undefined : JSON.parse(body);
        } catch (cause) {
          // A proxy or crashed server can answer with HTML or plain text;
          // keep the HTTP status visible rather than a JSON parse error.
          throw actionFailure(response.status, cause);
        }
        const envelope = (parsed ?? {}) as {
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
          if (envelope.error != null) {
            throw actionFailure(response.status, envelope.error);
          }
          // Otherwise report the body itself, such as a problem response.
          throw (
            validationError(envelope, descriptor.id) ??
            actionFailure(response.status, parsed ?? undefined)
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
        // Every successful server mutation invalidates its confirmed prefixes,
        // even when a newer submission owns the visible action state.
        for (const prefix of invalidates)
          invalidateQueriesForRuntime(runtime, prefix, true);
        if (
          isCurrentAsyncGeneration(
            actionSubmissionGenerations.get(value) ?? 0,
            generation
          )
        ) {
          setValue({ pending: false, result: envelope.result });
          if (redirect) location.assign(redirect);
        }
        return envelope.result as TResult;
      } catch (error) {
        if (
          isCurrentAsyncGeneration(
            actionSubmissionGenerations.get(value) ?? 0,
            generation
          )
        ) {
          setValue({ pending: false, error });
        }
        throw error;
      }
    },
  };
}
