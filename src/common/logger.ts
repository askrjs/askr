/**
 * Shared logger interface for runtime and tooling code.
 *
 * Debug, info, and warn stay silent in production. Errors always log.
 */

import { isProductionEnvironment } from './env';

function callConsole(method: string, args: unknown[]): void {
  const c = typeof console !== 'undefined' ? (console as unknown) : undefined;
  if (!c) return;
  const fn = (c as Record<string, unknown>)[method];
  if (typeof fn === 'function') {
    try {
      (fn as (...a: unknown[]) => unknown).apply(console, args as unknown[]);
    } catch {
      // Ignore logging failures.
    }
  }
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (isProductionEnvironment()) return;
    callConsole('debug', args);
  },

  info: (...args: unknown[]) => {
    if (isProductionEnvironment()) return;
    callConsole('info', args);
  },

  warn: (...args: unknown[]) => {
    if (isProductionEnvironment()) return;
    callConsole('warn', args);
  },

  error: (...args: unknown[]) => {
    callConsole('error', args);
  },
};
