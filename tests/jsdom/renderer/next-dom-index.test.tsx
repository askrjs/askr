import { expect, test, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

function Row(props: { label: string; badge: boolean }) {
  return (
    <>
      {props.badge ? <b>!</b> : null}
      <li>{props.label}</li>
    </>
  );
}

test('should find the next sibling DOM without scanning the sibling list', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const labels = Array.from({ length: 300 }, (_, i) => `row ${i}`);
  const view = (badge: boolean) => (
    <ul>
      {labels.map((label) => (
        <Row key={label} label={label} badge={badge} />
      ))}
    </ul>
  );
  root.render(view(false));
  const indexOf = vi.spyOn(Array.prototype, 'indexOf');
  try {
    root.render(view(true));
    root.render(view(false));
    const scans = indexOf.mock.contexts.filter(
      (list: unknown) => Array.isArray(list) && list.length >= 100
    );
    expect(scans).toHaveLength(0);
    expect(container.querySelectorAll('li')).toHaveLength(300);
    expect(container.querySelectorAll('b')).toHaveLength(0);
  } finally {
    indexOf.mockRestore();
    root.dispose();
  }
});

test('should keep rows in order when badges appear in the middle', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const view = (badges: Set<number>) => (
    <ul>
      {[0, 1, 2, 3, 4].map((i) => (
        <Row key={i} label={`r${i}`} badge={badges.has(i)} />
      ))}
    </ul>
  );
  root.render(view(new Set()));
  root.render(view(new Set([1, 3])));
  expect(container.querySelector('ul')!.textContent).toBe('r0!r1r2!r3r4');
  root.dispose();
});
