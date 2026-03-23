import { beforeEach, afterEach } from 'vitest';

// Ensure tests run in a deterministic dev-like environment regardless of
// the shell's NODE_ENV (bench/profiling commands may set it to 'production').
const BASE = 'development';

beforeEach(() => {
  process.env.NODE_ENV = BASE;
});

afterEach(() => {
  process.env.NODE_ENV = BASE;
});
