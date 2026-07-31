import { resetRouteState, currentRouteRegistry } from '../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { For } from '../../../src/control';
import { resource } from '../../../src/runtime/operations';
import { navigate } from '../../../src/router/navigate';
import { group, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createControlledDeferred, settleAsyncWork } from './helpers';

type TeamMember = {
  id: string;
  name: string;
};

type TeamResponse = {
  members: TeamMember[];
};

describe('routed resource table app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/teams/alpha');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  it('should render only the newest route-param team when table requests resolve out of order', async () => {
    const alphaRequest = createControlledDeferred<TeamResponse>();
    const betaRequest = createControlledDeferred<TeamResponse>();
    const requests = new Map([
      ['alpha', alphaRequest],
      ['beta', betaRequest],
    ]);
    const signals = new Map<string, AbortSignal>();
    const starts: string[] = [];

    function TeamPage(params: { teamId: string }) {
      const team = resource<TeamResponse>(
        ({ signal }) => {
          starts.push(params.teamId);
          signals.set(params.teamId, signal);
          return requests.get(params.teamId)!.promise;
        },
        [params.teamId]
      );

      return (
        <section aria-label={`Team ${params.teamId}`}>
          <h1>{`Team ${params.teamId}`}</h1>
          <table>
            <caption>{`Members for ${params.teamId}`}</caption>
            <tbody>
              <For each={team.value?.members ?? []} by={(member) => member.id}>
                {(member) => (
                  <tr data-member-id={member.id}>
                    <td>{member.name}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </section>
      );
    }

    function AppShell({ children }: { children?: unknown }) {
      return (
        <main>
          <nav aria-label="Primary navigation">Teams</nav>
          {children as never}
        </main>
      );
    }

    group({ layout: AppShell }, () => {
      route('/teams/{teamId}', TeamPage);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const shell = container.querySelector('main');
    expect(starts).toEqual(['alpha']);
    expect(container.querySelector('[aria-label="Team alpha"]')).not.toBeNull();

    navigate('/teams/beta');
    flushScheduler();

    expect(container.querySelector('main')).toBe(shell);
    expect(signals.get('alpha')?.aborted).toBe(true);
    expect(starts).toEqual(['alpha', 'beta']);

    betaRequest.resolve({
      members: [{ id: 'b-1', name: 'Beta Operator' }],
    });
    await settleAsyncWork();

    const betaRow = container.querySelector(
      '[data-member-id="b-1"]'
    ) as HTMLTableRowElement;
    expect(betaRow?.textContent).toBe('Beta Operator');
    expect(container.textContent).not.toContain('Alpha Analyst');

    alphaRequest.resolve({
      members: [{ id: 'a-1', name: 'Alpha Analyst' }],
    });
    await settleAsyncWork();

    expect(container.querySelector('[aria-label="Team beta"]')).not.toBeNull();
    expect(container.querySelector('[data-member-id="b-1"]')).toBe(betaRow);
    expect(container.textContent).toContain('Beta Operator');
    expect(container.textContent).not.toContain('Alpha Analyst');
  });
});
