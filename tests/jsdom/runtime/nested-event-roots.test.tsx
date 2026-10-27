import { describe, expect, it } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';
import { jsx } from '../../../src/jsx/jsx-runtime';

describe('nested delegated event roots', () => {
  it('should keep outer delegated handlers when a nested root has none for the event', () => {
    const outer = document.createElement('div');
    document.body.append(outer);
    const calls: string[] = [];
    const outerRoot = createRoot(outer);
    let innerRoot: ReturnType<typeof createRoot> | undefined;
    try {
      outerRoot.render(
        jsx('section', {
          onClick: () => calls.push('outer'),
          children: jsx('div', { id: 'inner' }),
        })
      );
      const inner = outer.querySelector('#inner')!;
      innerRoot = createRoot(inner);
      innerRoot.render(jsx('button', { children: 'go' }));
      inner
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(calls).toEqual(['outer']);
    } finally {
      innerRoot?.dispose();
      outerRoot.dispose();
      outer.remove();
    }
  });

  it('should dispatch handlers once across nested roots and permit redispatch', () => {
    const outer = document.createElement('div');
    document.body.append(outer);
    const calls: string[] = [];
    const outerRoot = createRoot(outer);
    let innerRoot: ReturnType<typeof createRoot> | undefined;
    try {
      outerRoot.render(
        jsx('section', {
          onClick: () => calls.push('outer'),
          children: jsx('div', { id: 'inner' }),
        })
      );
      const inner = outer.querySelector('#inner')!;
      innerRoot = createRoot(inner);
      innerRoot.render(
        jsx('button', { onClick: () => calls.push('inner'), children: 'go' })
      );
      const event = new MouseEvent('click', { bubbles: true });
      inner.querySelector('button')!.dispatchEvent(event);
      expect(calls).toEqual(['inner', 'outer']);
      calls.length = 0;
      inner.querySelector('button')!.dispatchEvent(event);
      expect(calls).toEqual(['inner', 'outer']);
    } finally {
      innerRoot?.dispose();
      outerRoot.dispose();
      outer.remove();
    }
  });
});
