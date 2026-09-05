import { expect, test, vi } from 'vite-plus/test';
import { createDOMNode } from '../../../src/renderer/dom-internal';
import { tryPatchStableForDirtyItem } from '../../../src/renderer/stable-patch';

test('should declining a stable patch leaves the existing attributes and text unchanged', () => {
  const dom = createDOMNode(
    <div title="before">
      old<span>tail</span>
    </div>
  ) as Element;
  const before = dom.outerHTML;
  const patched = tryPatchStableForDirtyItem({
    dom,
    vnode: (
      <div title="after">
        new<strong>tail</strong>
      </div>
    ),
  });
  expect(patched).toBe(false);
  expect(dom.outerHTML).toBe(before);
});

test('should decline components and incompatible descendants without refs or component execution', () => {
  const callback = vi.fn();
  const Component = vi.fn(() => <span>component</span>);
  const dom = createDOMNode(
    <div>
      <span>old</span>
    </div>
  ) as Element;
  expect(
    tryPatchStableForDirtyItem({
      dom,
      vnode: (
        <div ref={callback}>
          <strong>new</strong>
        </div>
      ),
    })
  ).toBe(false);
  expect(tryPatchStableForDirtyItem({ dom, vnode: <Component /> })).toBe(false);
  expect(Component).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});
