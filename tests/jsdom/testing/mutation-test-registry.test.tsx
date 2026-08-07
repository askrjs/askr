import { describe, expect, it } from 'vite-plus/test';
import { createDataRuntime, createMutation } from '../../../src/data';
import { createRouteRegistry, route } from '../../../src/router';
import {
  createMutationTestRegistry,
  mutationState,
  renderRoute,
} from '../../../src/testing';

describe('mutation test registry', () => {
  it('should resolve a mutable fixture by canonical mutation key', async () => {
    const mutations = createMutationTestRegistry();
    const fixture = mutationState<string, boolean>();
    mutations.set('queue/replay', fixture);
    const routes = createRouteRegistry(() => {
      route('/', () => {
        const mutation = createMutation({
          key: 'queue/replay',
          action: async () => false,
        });
        return (
          <output>
            {mutation.status}:{String(mutation.result)}
          </output>
        );
      });
    });
    const rendered = await renderRoute({
      registry: routes,
      dataRuntime: mutations.runtime,
    });

    expect(rendered.container.textContent).toBe('idle:null');
    fixture.setPending();
    rendered.flush();
    expect(rendered.container.textContent).toBe('pending:null');

    const execution = fixture.execute('dead-letter-1');
    fixture.succeed(true);
    await expect(execution).resolves.toBe(true);
    rendered.flush();

    expect(fixture.inputs).toEqual(['dead-letter-1']);
    expect(rendered.container.textContent).toBe('success:true');
    rendered.cleanup();
  });

  it('should support deterministic error, abort, and reset transitions', async () => {
    const fixture = mutationState<string, boolean>();
    const failed = fixture.execute('failed');
    fixture.fail(new Error('replay failed'));

    await expect(failed).rejects.toThrow('replay failed');
    expect(fixture.status).toBe('error');
    expect(fixture.error).toEqual(new Error('replay failed'));

    const aborted = fixture.execute('aborted');
    fixture.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(fixture.status).toBe('idle');

    fixture.succeed(true);
    fixture.reset();
    expect(fixture).toMatchObject({
      status: 'idle',
      pending: false,
      error: null,
      result: null,
    });
  });

  it('should keep overrides scoped and reset fixtures on registry cleanup', () => {
    const mutations = createMutationTestRegistry();
    const fixture = mutationState.success<unknown, boolean>(true);
    mutations.set('account/save', fixture);

    const overridden = createMutation({
      key: 'account/save',
      runtime: mutations.runtime,
      action: async () => false,
    });
    const isolated = createMutation({
      key: 'account/save',
      runtime: createDataRuntime(),
      action: async () => false,
    });

    expect(overridden).toBe(fixture);
    expect(isolated).not.toBe(fixture);

    mutations.clear();
    expect(fixture.status).toBe('idle');
    expect(
      createMutation({
        key: 'account/save',
        runtime: mutations.runtime,
        action: async () => false,
      })
    ).not.toBe(fixture);
  });
});
