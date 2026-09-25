import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { runRetainedElementUpdate } from '../../../src/renderer/ownership/retained-element';
import { captureRootHost } from '../../../src/renderer/ownership/root-snapshot';
import {
  discardTransaction,
  getCurrentCommitTransaction,
  suspendTransaction,
} from '../../../src/runtime/transactions/access';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

afterEach(() => {
  const transaction = getCurrentCommitTransaction();
  if (transaction) {
    discardTransaction(transaction);
    suspendTransaction(transaction);
  }
});

function createUse(): Element {
  const use = document.createElementNS(SVG_NAMESPACE, 'use');
  use.setAttributeNS(XLINK_NAMESPACE, 'xlink:href', '#shape');
  return use;
}

describe('namespaced attribute rollback', () => {
  it('should restore xlink:href in its namespace when a retained element update rolls back', () => {
    const use = createUse();

    expect(() =>
      runRetainedElementUpdate(use, vi.fn(), () => {
        use.removeAttribute('xlink:href');
        throw new Error('update failed');
      })
    ).toThrow('update failed');

    expect(use.getAttributeNS(XLINK_NAMESPACE, 'href')).toBe('#shape');
  });

  it('should restore xlink:href in its namespace when a root host snapshot is restored', () => {
    const root = document.createElement('div');
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    const use = createUse();
    svg.appendChild(use);
    root.appendChild(svg);

    const snapshot = captureRootHost(root);
    use.removeAttribute('xlink:href');
    expect(snapshot.restore()).toEqual([]);

    expect(use.getAttributeNS(XLINK_NAMESPACE, 'href')).toBe('#shape');
  });
});
