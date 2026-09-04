import { expect, test } from 'vitest';
import * as root from '@askrjs/askr';
import * as control from '@askrjs/askr/control';
import * as data from '@askrjs/askr/data';
import * as jsx from '@askrjs/askr/jsx-runtime';
import * as foundations from '@askrjs/askr/foundations';
import * as structures from '@askrjs/askr/foundations/structures';

test('should preserve shared public value identity across package subpaths', () => {
  expect(root.For).toBe(control.For);
  expect(root.Show).toBe(control.Show);
  expect(root.Match).toBe(control.Match);
  expect(root.Case).toBe(control.Case);
  expect(root.createQuery).toBe(data.createQuery);
  expect(root.createQueryCollection).toBe(data.createQueryCollection);
  expect(root.Fragment).toBe(jsx.Fragment);
  expect(root.jsx).toBe(jsx.jsx);
  expect(root.jsxs).toBe(jsx.jsxs);
  expect(foundations.Portal).toBe(structures.Portal);
  expect(foundations.Slot).toBe(structures.Slot);
  expect(root.getDefaultRuntime()).toBeInstanceOf(root.AskrRuntime);
  expect(root.createRuntime().constructor).toBe(root.AskrRuntime);
});

test('should preserve consumer subclass fields when renderer configuration changes', () => {
  class ConsumerRuntime extends root.AskrRuntime {
    state = 'consumer-owned';
  }
  const runtime = new ConsumerRuntime();
  const replacement = root.createRuntime().renderer;
  runtime.configureRenderer(replacement);
  expect(runtime.renderer).toBe(replacement);
  expect(runtime.state).toBe('consumer-owned');
});
