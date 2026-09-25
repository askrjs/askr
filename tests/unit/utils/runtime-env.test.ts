import { describe, expect, it } from 'vite-plus/test';
import {
  getRuntimeEnvValue,
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
    withEnumerationCountingEnv({ ...process.env }, (enumerations) => {
      expect(isProductionEnvironment()).toBe(
        getRuntimeEnvValue('NODE_ENV') === 'production'
      );
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

  it('should observe process.env changes made after startup', () => {
    withEnumerationCountingEnv(
      { ...process.env, ASKR_RUNTIME_ENV_TEST_FLAG: '0' },
      () => {
        expect(isRuntimeEnvFlagEnabled('ASKR_RUNTIME_ENV_TEST_FLAG')).toBe(
          false
        );
        process.env.ASKR_RUNTIME_ENV_TEST_FLAG = 'true';
        expect(getRuntimeEnvValue('ASKR_RUNTIME_ENV_TEST_FLAG')).toBe('true');
        expect(isRuntimeEnvFlagEnabled('ASKR_RUNTIME_ENV_TEST_FLAG')).toBe(
          true
        );
      }
    );
  });
});
