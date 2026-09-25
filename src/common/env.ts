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

function normalizeEnvValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  return undefined;
}

function getBuildTimeMetaEnv(): BuildTimeEnv | undefined {
  return (import.meta as ImportMeta & { env?: BuildTimeEnv }).env;
}

function getBuildTimeNodeEnv(
  metaEnv: BuildTimeEnv | undefined
): string | undefined {
  const nodeEnv = normalizeEnvValue(metaEnv?.NODE_ENV);
  if (nodeEnv != null || !metaEnv) {
    return nodeEnv;
  }
  if (typeof metaEnv.MODE === 'string' && metaEnv.MODE.length > 0) {
    return metaEnv.MODE;
  }
  if (metaEnv.PROD === true || metaEnv.PROD === 'true') {
    return 'production';
  }
  if (metaEnv.DEV === true || metaEnv.DEV === 'true') {
    return 'development';
  }
  return undefined;
}

function getBuildTimeEnv(): RuntimeEnv {
  const metaEnv = getBuildTimeMetaEnv();
  const normalized: RuntimeEnv = {};
  if (!metaEnv) {
    return normalized;
  }

  for (const [key, value] of Object.entries(metaEnv)) {
    const normalizedValue = normalizeEnvValue(value);
    if (normalizedValue !== undefined) {
      normalized[key] = normalizedValue;
    }
  }
  const nodeEnv = getBuildTimeNodeEnv(metaEnv);
  if (nodeEnv !== undefined) {
    normalized.NODE_ENV = nodeEnv;
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

/**
 * Resolves one variable exactly as `getRuntimeEnv()[name]` would, without
 * copying the environment. Enumerating `process.env` is costly on some hosts
 * (every enumeration copies the environment block on Windows), and these
 * checks run on hot paths such as every component render.
 */
function getRuntimeEnvValue(name: string): string | undefined {
  const processValue = (globalThis as RuntimeEnvGlobal).process?.env?.[name];
  const metaEnv = getBuildTimeMetaEnv();

  if (name === 'NODE_ENV') {
    return resolveNodeEnv(processValue, getBuildTimeNodeEnv(metaEnv));
  }

  return normalizeEnvValue(metaEnv?.[name]) ?? processValue;
}

export function isProductionEnvironment(): boolean {
  return getRuntimeEnvValue('NODE_ENV') === 'production';
}

export function isDevelopmentEnvironment(): boolean {
  return !isProductionEnvironment();
}

export function isRuntimeEnvFlagEnabled(name: string): boolean {
  const value = getRuntimeEnvValue(name);
  return value === '1' || value === 'true';
}
