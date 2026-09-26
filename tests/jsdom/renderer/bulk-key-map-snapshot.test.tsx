import { describe, expect, it } from 'vite-plus/test';
import { performBulkPositionalKeyedTextUpdate } from '../../../src/renderer/children/children-fastpath';
import {
  keyedElements,
  populateKeyMapForElement,
} from '../../../src/renderer/reconciliation/keyed';

describe('bulk keyed map snapshots', () => {
  it('should publish a new map without mutating the previous snapshot', () => {
    const parent = document.createElement('ul');
    const child = document.createElement('li');
    child.textContent = 'old';
    parent.appendChild(child);

    const previous = new Map<string | number, Element>([['old', child]]);
    keyedElements.set(parent, previous);

    performBulkPositionalKeyedTextUpdate(parent, [
      { key: 'new', vnode: <li>new</li> },
    ]);

    expect(Array.from(previous.entries())).toEqual([['old', child]]);
    expect(keyedElements.get(parent)).not.toBe(previous);
    expect(keyedElements.get(parent)?.get('new')).toBe(child);
  });
});

describe('keyed map population errors', () => {
  it('should surface a failed DOM scan without publishing a partial map', () => {
    const parent = document.createElement('ul');
    const child = document.createElement('li');
    parent.appendChild(child);
    const failure = new Error('text read failed');
    Object.defineProperty(child, 'textContent', {
      get: () => {
        throw failure;
      },
    });

    expect(() => populateKeyMapForElement(parent)).toThrow(failure);
    expect(keyedElements.get(parent)).toBeUndefined();
  });
});
