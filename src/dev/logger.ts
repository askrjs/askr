/**
 * Centralized logger interface
 * - Keeps production builds silent for debug/warn/info messages
 * - Ensures consistent behavior across the codebase
 * - Protects against missing `console` in some environments
 */

import { isProductionEnvironment } from '../common/env';

function callConsole(method: string, args: unknown[]): void {
  const c = typeof console !== 'undefined' ? (console as unknown) : undefined;
  if (!c) return;
  const fn = (c as Record<string, unknown>)[method];
  if (typeof fn === 'function') {
    try {
      (fn as (...a: unknown[]) => unknown).apply(console, args as unknown[]);
    } catch {
      // ignore logging errors
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
