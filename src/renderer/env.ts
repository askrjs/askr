type RuntimeEnv = Record<string, string | undefined>;

export function getRuntimeEnv(): RuntimeEnv {
  return globalThis.process?.env ?? {};
}
