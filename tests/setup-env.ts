import { afterEach, beforeEach } from 'vite-plus/test';
import { logger } from '../src/dev/logger';

// Ensure tests run in a deterministic dev-like environment regardless of
// the shell's NODE_ENV (bench/profiling commands may set it to 'production').
const BASE = 'development';

type WarningMatcher = RegExp | string;

const FRAMEWORK_WARNING_PATTERNS = [
  /\[askr\] Unused state variable detected/,
  /Missing keys on dynamic lists/,
  /Invalid For key detected/,
  /Duplicate For key detected/,
];
const DIAGNOSTIC_WARNING_PATTERNS = [/\[askr\] Slow render detected/];
const originalWarn = logger.warn;
const originalScrollTo = globalThis.window?.scrollTo;

let capturedFrameworkWarnings: string[] = [];
let allowedFrameworkWarnings: WarningMatcher[] = [];

function formatWarningArgs(args: unknown[]): string {
  return args
    .map((value) => {
      if (typeof value === 'string') {
        return value;
      }

      if (value instanceof Error) {
        return value.stack ?? value.message;
      }

      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(' ');
}

function isFrameworkWarning(message: string): boolean {
  return FRAMEWORK_WARNING_PATTERNS.some((pattern) => pattern.test(message));
}

function isDiagnosticWarning(message: string): boolean {
  return DIAGNOSTIC_WARNING_PATTERNS.some((pattern) => pattern.test(message));
}

function matchesAllowedWarning(message: string): boolean {
  return allowedFrameworkWarnings.some((matcher) =>
    typeof matcher === 'string'
      ? message.includes(matcher)
      : matcher.test(message)
  );
}

export function allowFrameworkWarnings(...matchers: WarningMatcher[]): void {
  allowedFrameworkWarnings.push(...matchers);
}

export function getCapturedFrameworkWarnings(): string[] {
  return capturedFrameworkWarnings.slice();
}

beforeEach(() => {
  process.env.NODE_ENV = BASE;
  capturedFrameworkWarnings = [];
  allowedFrameworkWarnings = [];

  if (typeof window !== 'undefined') {
    try {
      Object.defineProperty(window, 'scrollTo', {
        configurable: true,
        writable: true,
        value: () => {},
      });
    } catch {
      try {
        window.scrollTo = () => {};
      } catch {
        // Ignore environments where the property cannot be replaced.
      }
    }
  }

  logger.warn = (...args: unknown[]) => {
    const message = formatWarningArgs(args);
    if (isFrameworkWarning(message)) {
      capturedFrameworkWarnings.push(message);
      return;
    }
    if (isDiagnosticWarning(message)) {
      if (matchesAllowedWarning(message)) {
        capturedFrameworkWarnings.push(message);
      }
      return;
    }
    originalWarn(...args);
  };
});

afterEach(() => {
  process.env.NODE_ENV = BASE;
  logger.warn = originalWarn;

  if (typeof window !== 'undefined' && originalScrollTo) {
    try {
      Object.defineProperty(window, 'scrollTo', {
        configurable: true,
        writable: true,
        value: originalScrollTo,
      });
    } catch {
      try {
        window.scrollTo = originalScrollTo;
      } catch {
        // Ignore environments where the property cannot be restored.
      }
    }
  }

  const unexpectedWarnings = capturedFrameworkWarnings.filter(
    (message) => !matchesAllowedWarning(message)
  );

  capturedFrameworkWarnings = [];
  allowedFrameworkWarnings = [];

  if (unexpectedWarnings.length > 0) {
    throw new Error(
      `Unexpected framework warnings in test:\n${unexpectedWarnings.join('\n')}`
    );
  }
});
