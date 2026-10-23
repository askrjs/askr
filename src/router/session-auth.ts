import type { AuthContext } from '@askrjs/auth';
import type { RouteAuthOptions, RouteAuthResolver } from '../common/router';
import { Signal } from '../core/reactive/graph';
import { resolveNavigationUrl } from '../common/url';
import { reportUncaughtErrorLater } from '../common/report-error';
import { navigateToPublicHref } from './navigate';
import { loadDocument } from './document-navigation';
import {
  registerSessionAuthState,
  type SessionRecovery,
} from './session-auth-state';

/** Client binding for the same-origin askr-server provider-session routes. */
export interface SessionAuthOptions {
  /** App-owned login page, default `/login`. */
  readonly loginPath?: string;
  /** Native transport for session resolution and logout. */
  readonly fetch?: typeof globalThis.fetch;
}

export interface SessionLoginOptions {
  readonly returnTo: string;
  readonly resource?: string;
  readonly scopes?: readonly string[];
}

/** Pass this exact object as the registry or boot `auth` configuration. */
export interface SessionAuth extends RouteAuthOptions {
  readonly resolve: RouteAuthResolver;
  readonly dehydrate: NonNullable<RouteAuthOptions['dehydrate']>;
  loginHref(provider: string, options: SessionLoginOptions): string;
  /** Local logout; provider logout/revocation remains an explicit server action. */
  logout(): Promise<void>;
  /** Handle a decoded 401 problem or an @askrjs/fetch result/error. */
  handleAuthFailure(failure: unknown): boolean;
}

type Snapshot = Omit<AuthContext, 'session'>;
type Problem = {
  code: 'interaction-required';
  reason: 'login' | 'consent';
  provider: string;
  resource?: string;
  scopes: string[];
};

const anonymous: AuthContext = Object.freeze({
  authenticated: false,
  principal: null,
  session: null,
  tenant: null,
  scopes: Object.freeze([]) as unknown as string[],
});
const CHANNEL = 'askr:provider-session:1';
const STORAGE = '__askr_provider_session_1';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function scopes(value: readonly string[]): string[] {
  return [...new Set(value)].sort();
}

/** Construct the same minimal allowlist as the server; never spread claims. */
function project(context: AuthContext): Snapshot {
  if (!context.authenticated) {
    return { authenticated: false, principal: null, tenant: null, scopes: [] };
  }
  if (typeof context.principal?.id !== 'string' || !context.principal.id) {
    throw new TypeError('[Askr] Malformed provider-session identity.');
  }
  const subject = context.principal.subject;
  return {
    authenticated: true,
    principal: {
      id: context.principal.id,
      ...(typeof subject === 'string' ? { subject } : {}),
    },
    tenant: typeof context.tenant === 'string' ? context.tenant : null,
    scopes: scopes(context.scopes ?? []),
  };
}

function parseSnapshot(value: unknown): AuthContext {
  if (
    !object(value) ||
    Object.keys(value).sort().join(',') !==
      'authenticated,principal,scopes,tenant' ||
    typeof value.authenticated !== 'boolean' ||
    !(value.tenant === null || typeof value.tenant === 'string') ||
    !strings(value.scopes) ||
    (value.authenticated
      ? !object(value.principal) ||
        typeof value.principal.id !== 'string' ||
        !value.principal.id ||
        Object.keys(value.principal).some(
          (key) => key !== 'id' && key !== 'subject'
        ) ||
        ('subject' in value.principal &&
          typeof value.principal.subject !== 'string')
      : value.principal !== null ||
        value.tenant !== null ||
        value.scopes.length !== 0)
  ) {
    throw new TypeError('[Askr] Malformed provider-session snapshot.');
  }
  const snapshot = project(value as unknown as AuthContext);
  if (snapshot.principal) Object.freeze(snapshot.principal);
  Object.freeze(snapshot.scopes);
  return Object.freeze({ ...snapshot, session: null });
}

function browserHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function localPath(value: string): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    throw new TypeError(
      '[Askr] Session auth requires a same-origin absolute path.'
    );
  }
  const url = resolveNavigationUrl(value);
  if (url.origin !== 'http://askr.invalid') {
    throw new TypeError(
      '[Askr] Session auth requires a same-origin absolute path.'
    );
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function providerId(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new TypeError('[Askr] Invalid provider id.');
  }
  return value;
}

function abortError(): DOMException {
  return new DOMException('The session operation was cancelled.', 'AbortError');
}

function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      reject(abortError());
    };
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', cancel);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', cancel);
        reject(error);
      }
    );
  });
}

function readProblem(failure: unknown): Problem | undefined {
  if (!object(failure)) return undefined;
  // Only a typed HTTP 401 result is accepted through the result/error adapter.
  const result = object(failure.result) ? failure.result : failure;
  const value =
    result.status === 401 && result.ok === false && result.kind === 'http'
      ? result.error
      : failure;
  if (
    !object(value) ||
    value.code !== 'interaction-required' ||
    (value.reason !== 'login' && value.reason !== 'consent') ||
    typeof value.provider !== 'string' ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(value.provider) ||
    !(
      value.resource === undefined ||
      (typeof value.resource === 'string' &&
        value.resource.length > 0 &&
        value.resource.length <= 2048)
    ) ||
    !strings(value.scopes) ||
    value.scopes.length > 128 ||
    value.scopes.some(
      (scope) => !scope || scope.length > 256 || /[\s"\\]/.test(scope)
    )
  )
    return undefined;
  return {
    code: 'interaction-required',
    reason: value.reason,
    provider: value.provider,
    ...(value.resource === undefined ? {} : { resource: value.resource }),
    scopes: scopes(value.scopes),
  };
}

/** Bind server provider sessions to router auth in SSR and the browser. */
export function createSessionAuth(
  options: SessionAuthOptions = {}
): SessionAuth {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options) ||
    (options.fetch !== undefined && typeof options.fetch !== 'function')
  ) {
    throw new TypeError('[Askr] Invalid session auth configuration.');
  }
  const loginPath = localPath(options.loginPath ?? '/login');
  const identity = new Signal<AuthContext | undefined>(undefined);
  const roots = new Map<object, () => void>();
  const mountedRoots = new Set<object>();
  let generation = 0;
  let cached: AuthContext | undefined;
  let pending:
    | { controller: AbortController; promise: Promise<AuthContext> }
    | undefined;
  let stopEvents: (() => void) | undefined;
  let channel: BroadcastChannel | undefined;
  let eventGeneration = 0;
  let recoveryTarget: SessionRecovery | undefined;
  let transitions = 0;
  let announced = false;

  const transport: typeof globalThis.fetch = (...args) =>
    (options.fetch ?? globalThis.fetch)(...args);
  const loginHref = (
    provider: string,
    request: SessionLoginOptions
  ): string => {
    const query = new URLSearchParams({
      returnTo: localPath(request.returnTo),
    });
    if (request.resource !== undefined) query.set('resource', request.resource);
    for (const scope of scopes(request.scopes ?? []))
      query.append('scope', scope);
    return `/auth/login/${providerId(provider)}?${query}`;
  };
  const publish = (kind: 'changed' | 'logout') => {
    const message = {
      protocol: 1,
      kind,
      nonce: globalThis.crypto.randomUUID(),
    };
    channel?.postMessage(message);
    if (!channel) {
      try {
        window.localStorage.setItem(STORAGE, JSON.stringify(message));
      } catch {
        /* Focus fallback. */
      }
    }
  };
  const retire = () => {
    const errors: unknown[] = [];
    transitions++;
    try {
      for (const callback of [...roots.values()]) {
        try {
          callback();
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      transitions--;
    }
    for (const error of errors) reportUncaughtErrorLater(error);
  };
  const invalidate = (value: AuthContext | undefined) => {
    generation++;
    const previous = pending;
    pending = undefined;
    cached = undefined;
    previous?.controller.abort();
    retire();
    cached = value;
    identity.write(value ?? anonymous);
  };
  const commit = (value: AuthContext) => {
    const previous = identity.peek();
    if (
      previous !== undefined &&
      JSON.stringify(project(previous)) !== JSON.stringify(project(value))
    ) {
      retire();
      if (mountedRoots.size)
        queueMicrotask(() =>
          navigateToPublicHref(browserHref(), { replace: true })
        );
    }
    cached = value;
    recoveryTarget = undefined;
    identity.write(value);
  };
  const session = (signal: AbortSignal): AuthContext | Promise<AuthContext> => {
    if (signal.aborted || transitions) throw abortError();
    if (cached) return cached;
    const entry = pending ?? {
      controller: new AbortController(),
      promise: undefined as unknown as Promise<AuthContext>,
    };
    if (!pending) {
      const ownGeneration = generation;
      const { controller } = entry;
      pending = entry;
      entry.promise = (async () => {
        try {
          const response = await transport(
            new Request(new URL('/auth/session', window.location.href), {
              credentials: 'same-origin',
              cache: 'no-store',
              redirect: 'error',
              signal: controller.signal,
            })
          );
          if (!response.ok)
            throw new Error('[Askr] Provider session request failed.');
          const value = parseSnapshot(await response.json());
          if (
            generation !== ownGeneration ||
            pending !== entry ||
            controller.signal.aborted
          )
            throw abortError();
          commit(value);
          return value;
        } finally {
          if (pending === entry) pending = undefined;
        }
      })();
    }
    // A synchronous transport failure can already have cleared pending.
    return waitFor(
      entry.promise,
      AbortSignal.any([signal, entry.controller.signal])
    );
  };
  const recover = (
    failure: unknown,
    returnTo: string
  ): SessionRecovery | undefined => {
    const problem = readProblem(failure);
    if (!problem) return undefined;
    // Reports of one failure share its recovery until the navigation to the
    // login target is issued; a failure after that computes a fresh target,
    // so a later 401 from another page returns there after login.
    if (recoveryTarget) return recoveryTarget;
    invalidate(anonymous);
    if (problem.reason === 'consent') {
      recoveryTarget = {
        href: loginHref(problem.provider, {
          returnTo,
          resource: problem.resource,
          scopes: problem.scopes,
        }),
        document: true,
      };
    } else {
      const target = new URL(localPath(loginPath), 'http://askr.invalid');
      target.searchParams.set('next', localPath(returnTo));
      recoveryTarget = {
        href: `${target.pathname}${target.search}${target.hash}`,
        document: false,
      };
    }
    const target = recoveryTarget;
    if (mountedRoots.size) {
      const ownGeneration = generation;
      queueMicrotask(() => {
        if (recoveryTarget === target) recoveryTarget = undefined;
        if (ownGeneration !== generation || !mountedRoots.size) return;
        if (target.document)
          loadDocument(
            new URL(target.href, window.location.href).href,
            'replace'
          );
        else navigateToPublicHref(target.href, { replace: true });
      });
    } else {
      // The caller navigates; nothing else can share this recovery.
      recoveryTarget = undefined;
    }
    return target;
  };
  const handleAuthFailure = (failure: unknown): boolean => {
    if (typeof window === 'undefined') return false;
    const target = recover(failure, browserHref());
    if (!target) return false;
    if (mountedRoots.size) return true;
    if (target.document)
      loadDocument(new URL(target.href, window.location.href).href, 'replace');
    else if (!roots.size) navigateToPublicHref(target.href, { replace: true });
    return true;
  };
  const attachEvents = () => {
    const ownEvents = ++eventGeneration;
    const changed = (value: unknown) => {
      if (
        ownEvents !== eventGeneration ||
        !roots.size ||
        !object(value) ||
        value.protocol !== 1 ||
        (value.kind !== 'changed' && value.kind !== 'logout')
      )
        return;
      recoveryTarget = undefined;
      // A channel message is only an invalidation hint. It may be delayed
      // past a newer login, so always consult the current server authority.
      invalidate(undefined);
      if (mountedRoots.size)
        navigateToPublicHref(browserHref(), { replace: true });
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== STORAGE || !event.newValue) return;
      try {
        changed(JSON.parse(event.newValue));
      } catch {
        /* Unrelated malformed storage value. */
      }
    };
    const focus = () => {
      if (!channel) changed({ protocol: 1, kind: 'changed' });
    };
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) changed({ protocol: 1, kind: 'changed' });
    };
    let wasHidden = document.visibilityState === 'hidden';
    const visibility = () => {
      const visible = document.visibilityState === 'visible';
      if (visible && wasHidden) changed({ protocol: 1, kind: 'changed' });
      wasHidden = !visible;
    };
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (event) => changed(event.data);
      }
    } catch {
      channel = undefined;
    }
    window.addEventListener('storage', storage);
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', pageshow);
    document.addEventListener('visibilitychange', visibility);
    stopEvents = () => {
      eventGeneration++;
      channel?.close();
      channel = undefined;
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', pageshow);
      document.removeEventListener('visibilitychange', visibility);
    };
  };

  const binding: SessionAuth = {
    loginPath,
    resolve: (context) =>
      context.mode === 'spa' ? session(context.signal) : anonymous,
    dehydrate: project,
    loginHref,
    async logout() {
      if (typeof window === 'undefined')
        throw new Error('[Askr] Session logout requires a browser.');
      // Invalidate before the network await; older GET completions cannot win.
      recoveryTarget = undefined;
      invalidate(anonymous);
      const ownGeneration = generation;
      // The server session is still alive when the request fails: drop the
      // anonymous assumption and re-resolve so the signed-in app returns.
      const restore = () => {
        if (ownGeneration !== generation) return;
        invalidate(undefined);
        navigateToPublicHref(browserHref(), { replace: true });
      };
      let response: Response;
      try {
        response = await transport(
          new Request(new URL('/auth/logout', window.location.href), {
            method: 'POST',
            credentials: 'same-origin',
            redirect: 'error',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          })
        );
      } catch (error) {
        restore();
        throw error;
      }
      if (!response.ok) {
        restore();
        throw new Error('[Askr] Provider logout request failed.');
      }
      if (ownGeneration !== generation) return;
      publish('logout');
      navigateToPublicHref(browserHref(), { replace: true });
    },
    handleAuthFailure,
  };
  registerSessionAuthState(binding, {
    read: () => identity.read(),
    capture() {
      const expected = generation;
      return () => {
        if (expected !== generation || transitions) throw abortError();
      };
    },
    adopt(context) {
      const value = parseSnapshot({
        authenticated: context.authenticated,
        principal: context.principal,
        tenant: context.tenant,
        scopes: context.scopes,
      });
      if (generation !== 0 || cached !== undefined) {
        return (
          cached !== undefined &&
          JSON.stringify(project(cached)) === JSON.stringify(project(value))
        );
      }
      commit(value);
      return true;
    },
    hasMountedRoots: () => mountedRoots.size > 0,
    isDocumentRecovery: () => recoveryTarget?.document === true,
    attach(root, callback, mounted = true) {
      roots.set(root, callback);
      if (mounted) mountedRoots.add(root);
      if (roots.size === 1) {
        attachEvents();
        // A new page binding announces presence once. Reattaching a cancelled
        // initial boot must not make two tabs invalidate one another forever.
        if (!announced) {
          announced = true;
          publish('changed');
        }
      }
      return (preserveIdentity = false) => {
        roots.delete(root);
        mountedRoots.delete(root);
        if (!roots.size) {
          stopEvents?.();
          stopEvents = undefined;
          if (!preserveIdentity && !transitions) invalidate(undefined);
        }
      };
    },
    recover,
  });
  return Object.freeze(binding);
}
