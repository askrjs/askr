import { afterEach, describe, expect, it } from 'vite-plus/test';
import { installRendererBridge } from '../../../src/boot/runtime-wiring';
import { createComponentInstance } from '../../../src/runtime';
import { beginComponentHostReplacement } from '../../../src/renderer/component/host-replacement';
import { writeHostOwners } from '../../../src/renderer/ownership/nodes';
import { createDOMNode } from '../../../src/renderer/dom';
import { syncComponentElement } from '../../../src/renderer/component/host';
import { getVNodeComponentInstance } from '../../../src/renderer/component/host-instances';
import { teardownNodeSubtree } from '../../../src/renderer/ownership/cleanup';
import {
  getCurrentCommitTransaction,
  registerCommitParticipant,
  runCommitTransaction,
} from '../../../src/runtime/transactions/access';

describe('component operation transaction boundary', () => {
  installRendererBridge();
  const containers: Element[] = [];
  afterEach(() => {
    for (const container of containers.splice(0))
      teardownNodeSubtree(container);
  });

  it('should close retained ownership before settlement callbacks mutate its input', () => {
    const container = document.createElement('div');
    containers.push(container);
    const host = document.createElement('span');
    container.appendChild(host);
    const owner = createComponentInstance('retained', () => null, {}, host);
    const departed = createComponentInstance('departed', () => null, {}, host);
    writeHostOwners(host, [departed, owner], departed);
    const retained = [owner];
    runCommitTransaction(() => {
      registerCommitParticipant({
        settle() {
          retained.push(departed);
        },
      });
      beginComponentHostReplacement(host, owner, host, retained).replace(
        () => document.createElement('strong'),
        () => {}
      );
    });
    expect(departed.owner.disposed).toBe(true);
    expect(owner.owner.disposed).toBe(false);
  });

  it.each([false, true])(
    'should restore retained execution after a failed update (nested=%s)',
    (nested) => {
      const failure = new Error('render failed');
      function Child(props: { fail: boolean }) {
        if (props.fail) throw failure;
        return <span>previous</span>;
      }
      const vnode = <Child fail={false} />;
      const container = document.createElement('div');
      containers.push(container);
      container.appendChild(createDOMNode(vnode)!);
      const host = container.querySelector('span')!;
      const instance = getVNodeComponentInstance(vnode)!;
      const previousProps = instance.props;
      const update = () =>
        syncComponentElement(host, vnode, Child, { fail: true });
      expect(() => (nested ? runCommitTransaction(update) : update())).toThrow(
        failure
      );
      expect(instance.props).toBe(previousProps);
      expect(instance.owner.disposed).toBe(false);
      expect(container.textContent).toBe('previous');
      expect(getCurrentCommitTransaction()).toBeNull();
      expect(syncComponentElement(host, vnode, Child, { fail: false })).toBe(
        host
      );
    }
  );

  it('should preserve outgoing owners when standalone adoption fails', () => {
    function Previous() {
      return <span>previous</span>;
    }
    const vnode = <Previous />;
    const container = document.createElement('div');
    containers.push(container);
    container.appendChild(createDOMNode(vnode)!);
    const host = container.querySelector('span')!;
    const owner = getVNodeComponentInstance(vnode)!;
    const failure = new Error('adoption failed');
    function Next() {
      throw failure;
    }
    const next = <Next />;
    expect(() => syncComponentElement(host, next, Next, {})).toThrow(failure);
    expect(owner.owner.disposed).toBe(false);
    expect(container.firstChild).toBe(host);
    expect(getVNodeComponentInstance(next)).toBeUndefined();
    expect(getCurrentCommitTransaction()).toBeNull();
  });

  it.each([false, true])(
    'should restore the old host after publication failure (nested=%s)',
    (nested) => {
      function Previous() {
        return <span>previous</span>;
      }
      const vnode = <Previous />;
      const container = document.createElement('div');
      containers.push(container);
      container.appendChild(createDOMNode(vnode)!);
      const host = container.querySelector('span')!;
      const owner = getVNodeComponentInstance(vnode)!;
      const failure = new Error('publication failed');
      function Next() {
        registerCommitParticipant({
          publish() {
            throw failure;
          },
        });
        return <strong>next</strong>;
      }
      const next = <Next />;
      const update = () => syncComponentElement(host, next, Next, {});
      expect(() => (nested ? runCommitTransaction(update) : update())).toThrow(
        failure
      );
      expect(container.firstChild).toBe(host);
      expect(container.textContent).toBe('previous');
      expect(owner.owner.disposed).toBe(false);
      expect(getVNodeComponentInstance(next)).toBeUndefined();
      expect(getCurrentCommitTransaction()).toBeNull();
    }
  );
});
