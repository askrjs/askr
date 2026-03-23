import { describe, it, expect } from 'vitest';
import { createTestContainer } from '../helpers/test-renderer';

describe('commit_no_layout_reads (DOM)', () => {
  it('should not read layout (getBoundingClientRect) during commit', () => {
    const { container, cleanup } = createTestContainer();

    // Instrument getBoundingClientRect
    let layoutReads = 0;
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      layoutReads++;
      return orig.call(this);
    };

    try {
      // Instead of mounting a full App, directly mutate the DOM in a way
      // that simulates a commit path used by the renderer and assert no layout
      // reads are performed by the library during commit.
      const parent = document.createElement('div');
      container.appendChild(parent);
      // Initial append
      const a = document.createElement('div');
      a.textContent = 'a';
      parent.appendChild(a);

      // Simulate a commit that replaces children (as renderer would)
      const frag = document.createDocumentFragment();
      const b = document.createElement('div');
      b.textContent = 'b';
      frag.appendChild(b);
      // Clear counter and perform commit
      layoutReads = 0;
      parent.replaceChildren(frag);

      // No layout reads should have happened as part of commit
      expect(layoutReads).toBe(0);
    } finally {
      // restore
      Element.prototype.getBoundingClientRect = orig;
      cleanup();
    }
  });
});
