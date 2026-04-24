export type RuntimeEnv = Record<string, string | undefined>;

type RuntimeEnvGlobal = typeof globalThis & {
  process?: {
    env?: RuntimeEnv;
  };
};

type BuildTimeEnv = Record<string, unknown> & {
  NODE_ENV?: unknown;
  MODE?: unknown;
  PROD?: unknown;
  DEV?: unknown;
};

function normalizeEnv(source?: Record<string, unknown>): RuntimeEnv {
  if (!source) {
    return {};
  }

  const normalized: RuntimeEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      normalized[key] = String(value);
    }
  }

  return normalized;
}

function getBuildTimeEnv(): RuntimeEnv {
  const metaEnv = (import.meta as ImportMeta & { env?: BuildTimeEnv }).env;
  const normalized = normalizeEnv(metaEnv);

  if (normalized.NODE_ENV == null && metaEnv) {
    if (typeof metaEnv.MODE === 'string' && metaEnv.MODE.length > 0) {
      normalized.NODE_ENV = metaEnv.MODE;
    } else if (metaEnv.PROD === true || metaEnv.PROD === 'true') {
      normalized.NODE_ENV = 'production';
    } else if (metaEnv.DEV === true || metaEnv.DEV === 'true') {
      normalized.NODE_ENV = 'development';
    }
  }

  return normalized;
}

function resolveNodeEnv(
  processNodeEnv: string | undefined,
  buildNodeEnv: string | undefined
): string | undefined {
  if (buildNodeEnv === 'production') {
    return 'production';
  }

  if (processNodeEnv != null) {
    return processNodeEnv;
  }

  if (buildNodeEnv === 'development') {
    return 'development';
  }

  return buildNodeEnv === 'test' ? undefined : buildNodeEnv;
}

export function getRuntimeEnv(): RuntimeEnv {
  const processEnv = (globalThis as RuntimeEnvGlobal).process?.env ?? {};
  const buildTimeEnv = getBuildTimeEnv();

  return {
    ...processEnv,
    ...buildTimeEnv,
    NODE_ENV: resolveNodeEnv(processEnv.NODE_ENV, buildTimeEnv.NODE_ENV),
  };
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
