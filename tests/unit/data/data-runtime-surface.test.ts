import { expect, it } from 'vite-plus/test';
import { createDataRuntime } from '../../../src/data';

it('should keep test overrides out of the data runtime object', () => {
  const runtime = createDataRuntime();
  expect(Object.keys(runtime).sort()).toEqual(['queryCache', 'queryData']);
});
