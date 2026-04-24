export type RuntimeEnv = Record<string, string | undefined>;

type RuntimeEnvGlobal = typeof globalThis & {
  process?: {
    env?: RuntimeEnv;
  };
};

export function getRuntimeEnv(): RuntimeEnv {
  return (globalThis as RuntimeEnvGlobal).process?.env ?? {};
}

export function isProductionEnvironment(): boolean {
  return getRuntimeEnv().NODE_ENV === 'production';
}

export function isDevelopmentEnvironment(): boolean {
  return !isProductionEnvironment();
}

export function isRuntimeEnvFlagEnabled(name: string): boolean {
  const value = getRuntimeEnv()[name];
  return value === '1' || value === 'true';
}