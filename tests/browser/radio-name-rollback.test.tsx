import { expect, test, vi } from 'vite-plus/test';
import { state } from '@askrjs/askr';
import { cleanupApp } from '@askrjs/askr/boot';
import { createIsland } from '../../test-utils/render/create-island';
import { flushScheduler } from '../../test-utils/render/test-renderer';

test.each(['name', 'type'] as const)(
  'should restore an uncontrolled radio peer after a failed %s change',
  (change) => {
    const container = document.body.appendChild(document.createElement('div'));
    let setUpdated!: (updated: boolean) => void;
    const view = (updated: boolean) => (
      <div>
        <input
          id="moving"
          type={change === 'type' && !updated ? 'checkbox' : 'radio'}
          name={change === 'name' && !updated ? 'source' : 'target'}
          checked
        />
        <input id="peer" type="radio" name="target" />
        <span title={updated ? 'new' : 'old'} />
      </div>
    );
    try {
      createIsland({
        root: container,
        component: () => {
          const updated = state(false);
          setUpdated = updated.set;
          return view(updated());
        },
      });
      flushScheduler();
      const moving = container.querySelector<HTMLInputElement>('#moving')!;
      const peer = container.querySelector<HTMLInputElement>('#peer')!;
      const span = container.querySelector('span')!;
      peer.checked = true;
      const failure = new Error('later write failed');
      const setAttribute = span.setAttribute.bind(span);
      const spy = vi
        .spyOn(span, 'setAttribute')
        .mockImplementation((name, value) => {
          if (name === 'title' && value === 'new') throw failure;
          setAttribute(name, value);
        });
      setUpdated(true);
      expect(() => flushScheduler()).toThrow(failure);
      expect(moving.name).toBe(change === 'name' ? 'source' : 'target');
      expect(moving.type).toBe(change === 'type' ? 'checkbox' : 'radio');
      expect(moving.checked).toBe(true);
      expect(peer.checked).toBe(true);
      spy.mockRestore();
      setUpdated(false);
      flushScheduler();
      setUpdated(true);
      flushScheduler();
      expect(moving.name).toBe('target');
      expect(peer.checked).toBe(false);
    } finally {
      cleanupApp(container);
      container.remove();
      vi.restoreAllMocks();
    }
  }
);
