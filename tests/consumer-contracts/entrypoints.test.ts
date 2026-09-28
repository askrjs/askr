import { expect, test } from 'vitest';
import * as root from '@askrjs/askr';
import * as control from '@askrjs/askr/control';
import * as data from '@askrjs/askr/data';
import * as jsx from '@askrjs/askr/jsx-runtime';
import * as foundations from '@askrjs/askr/foundations';
import * as structures from '@askrjs/askr/foundations/structures';

test('should preserve shared public value identity across package subpaths', () => {
  expect(root.Fragment).toBe(jsx.Fragment);
  expect(root.jsx).toBe(jsx.jsx);
  expect(root.jsxs).toBe(jsx.jsxs);
  expect(foundations.Portal).toBe(structures.Portal);
  expect(foundations.Slot).toBe(structures.Slot);
});

test('should export control flow and data from their subpaths only', () => {
  const rootExports = root as Record<string, unknown>;
  for (const name of ['For', 'Show', 'Match', 'Case']) {
    expect(rootExports[name]).toBeUndefined();
    expect(typeof (control as Record<string, unknown>)[name]).toBe('function');
  }
  for (const name of ['createQuery', 'createQueryCollection', 'defineQuery']) {
    expect(rootExports[name]).toBeUndefined();
    expect(typeof (data as Record<string, unknown>)[name]).toBe('function');
  }
});
