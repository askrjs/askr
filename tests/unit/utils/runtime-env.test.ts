import { describe, expect, it } from 'vite-plus/test';
import {
  getRuntimeEnv,
  isProductionEnvironment,
  isRuntimeEnvFlagEnabled,
} from '../../../src/common/env';

type ProcessEnv = Record<string, string | undefined>;

// Enumerating process.env is expensive on some hosts (notably Windows, where
// every enumeration copies the whole environment block), and the runtime
// checks the environment on hot paths such as every component render.
function withEnumerationCountingEnv<T>(
  values: ProcessEnv,
  run: (enumerations: () => number) => T
): T {
  let enumerations = 0;
  const env = new Proxy(values, {
    ownKeys(target) {
      enumerations++;
      return Reflect.ownKeys(target);
    },
  });
  const original = process.env;
  process.env = env as NodeJS.ProcessEnv;
  try {
    return run(() => enumerations);
  } finally {
    process.env = original;
  }
}

describe('runtime environment', () => {
  it('should resolve the environment mode without enumerating process.env', () => {
    const expected = withEnumerationCountingEnv(
      { ...process.env },
      () => getRuntimeEnv().NODE_ENV === 'production'
    );

    withEnumerationCountingEnv({ ...process.env }, (enumerations) => {
      expect(isProductionEnvironment()).toBe(expected);
      expect(enumerations()).toBe(0);
    });
  });

  it('should read a runtime flag without enumerating process.env', () => {
    withEnumerationCountingEnv(
      { ...process.env, ASKR_RUNTIME_ENV_TEST_FLAG: '1' },
      (enumerations) => {
        expect(isRuntimeEnvFlagEnabled('ASKR_RUNTIME_ENV_TEST_FLAG')).toBe(
          true
        );
        expect(isRuntimeEnvFlagEnabled('ASKR_RUNTIME_ENV_MISSING_FLAG')).toBe(
          false
        );
        expect(enumerations()).toBe(0);
      }
    );
  });

  it('should resolve the same values as the full environment snapshot', () => {
    withEnumerationCountingEnv(
      { ...process.env, ASKR_RUNTIME_ENV_TEST_FLAG: 'true' },
      () => {
        const snapshot = getRuntimeEnv();
        expect(isProductionEnvironment()).toBe(
          snapshot.NODE_ENV === 'production'
        );
        expect(isRuntimeEnvFlagEnabled('ASKR_RUNTIME_ENV_TEST_FLAG')).toBe(
          snapshot.ASKR_RUNTIME_ENV_TEST_FLAG === 'true'
        );
      }
    );
  });
});
