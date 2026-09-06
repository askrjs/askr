import { describe, expect, it } from 'vite-plus/test';
import {
  createComponentInstance,
  mountInstanceInline,
} from '../../../src/runtime';
import { restartComponentGeneration } from '../../../src/runtime/component/generation';
import { ownCleanup } from '../../../src/runtime/ownership/record';
import { cleanupInstanceIfPresent } from '../../../src/renderer/ownership/cleanup';
import { writeHostOwners } from '../../../src/renderer/ownership/nodes';
import { getOwnedRange } from '../../../src/renderer/ownership/ranges';

describe('replacement generation during cleanup', () => {
  it('should preserve host ownership published by a cleanup callback', () => {
    const host = document.createElement('div');
    const instance = createComponentInstance(
      'replace-during-cleanup',
      () => null,
      {},
      host
    );
    mountInstanceInline(instance, host);
    writeHostOwners(host, [instance], instance);
    const departed = instance.owner;
    let replacementCleanup = 0;
    ownCleanup(departed, () => {
      restartComponentGeneration(instance, () => null, false);
      mountInstanceInline(instance, host);
      writeHostOwners(host, [instance], instance);
      ownCleanup(instance.owner, () => {
        replacementCleanup++;
      });
    });
    cleanupInstanceIfPresent(host);
    expect(departed.disposed).toBe(true);
    expect(instance.owner.disposed).toBe(false);
    expect(getOwnedRange(instance)?.start).toBe(host);
    cleanupInstanceIfPresent(host);
    expect(replacementCleanup).toBe(1);
    expect(instance.owner.disposed).toBe(true);
  });
});
