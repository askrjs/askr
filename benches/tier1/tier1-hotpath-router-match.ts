import { bench, describe, expect } from 'vitest';
import { match } from '../../src/router/match';
import { tier1BenchOptions, verifyTier1Invariant } from '../shared/_shared';

const literalPath = '/products/details';
const literalPattern = '/products/details';
const paramPath = '/users/123/profile';
const paramPattern = '/users/{id}/profile';
const wildcardPath = '/docs/guides/install';
const wildcardPattern = '/docs/*/*';

verifyTier1Invariant('tier1 hotpath router match', () => {
  expect(match(literalPath, literalPattern).matched).toBe(true);
  expect(match(paramPath, paramPattern)).toEqual({
    matched: true,
    params: { id: '123' },
  });
  expect(match(wildcardPath, wildcardPattern)).toEqual({
    matched: true,
    params: { '*': 'install' },
  });
});

describe('tier1 router match', () => {
  bench(
    'match literal route segments',
    () => {
      match(literalPath, literalPattern);
    },
    tier1BenchOptions
  );

  bench(
    'match parameterized route segments',
    () => {
      match(paramPath, paramPattern);
    },
    tier1BenchOptions
  );

  bench(
    'match wildcard route segments',
    () => {
      match(wildcardPath, wildcardPattern);
    },
    tier1BenchOptions
  );
});
