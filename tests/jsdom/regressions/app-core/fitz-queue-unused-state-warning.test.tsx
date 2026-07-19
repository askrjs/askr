import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../../src/runtime/state';
import { createIsland } from '../../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';
import {
  allowFrameworkWarnings,
  getCapturedFrameworkWarnings,
} from '../../../setup-env';

type DeadLetterMessage = {
  messageId: number;
};

describe('Fitz Queue resource unused-state warning regression', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should not warn for action state read after the Queue data branch opens', () => {
    function ConfirmationDialog(props: {
      actionPending: boolean;
      confirmationKind: 'replay' | 'purge' | null;
      confirmationMessage: DeadLetterMessage | null;
      onRunAction: (
        kind: 'replay' | 'purge',
        message: DeadLetterMessage
      ) => void;
    }) {
      return props.confirmationMessage ? (
        <button
          id="confirm-action"
          disabled={props.actionPending}
          onClick={() =>
            props.onRunAction(
              props.confirmationKind!,
              props.confirmationMessage!
            )
          }
        >
          Confirm {props.confirmationKind}
        </button>
      ) : null;
    }

    function QueueResourcePage() {
      const data = state<DeadLetterMessage[] | null>(null);
      const compareRealm = state('default');
      const compareArea = state('ops');
      const compareResource = state('primary');
      const compareFamily = state('1');
      const actionMessageId = state<number | null>(null);
      const actionKind = state<'replay' | 'purge' | null>(null);
      const confirmMessage = state<DeadLetterMessage | null>(null);
      const confirmKind = state<'replay' | 'purge' | null>(null);

      const compareTarget = [
        compareRealm(),
        compareArea(),
        compareResource(),
        compareFamily(),
      ].join('/');
      const confirmationMessage = confirmMessage();
      const confirmationKind = confirmKind();
      const actionPending = actionKind() !== null;

      return (
        <main>
          <span id="compare-target">{compareTarget}</span>
          <button
            id="load-resource"
            onClick={() => data.set([{ messageId: 42 }])}
          >
            Load resource
          </button>
          {data() ? (
            <section>
              <span id="pending-action">
                {actionKind() ?? 'idle'}:{actionMessageId() ?? 'none'}
              </span>
              <button
                id="open-confirmation"
                onClick={() => {
                  confirmKind.set('replay');
                  confirmMessage.set({ messageId: 42 });
                }}
              >
                Replay
              </button>
              <ConfirmationDialog
                actionPending={actionPending}
                confirmationKind={confirmationKind}
                confirmationMessage={confirmationMessage}
                onRunAction={(kind, message) => {
                  actionKind.set(kind);
                  actionMessageId.set(message.messageId);
                }}
              />
            </section>
          ) : null}
        </main>
      );
    }

    createIsland({ root: container, component: QueueResourcePage });
    flushScheduler();

    (container.querySelector('#load-resource') as HTMLButtonElement).click();
    flushScheduler();
    (
      container.querySelector('#open-confirmation') as HTMLButtonElement
    ).click();
    flushScheduler();
    (container.querySelector('#confirm-action') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.querySelector('#pending-action')?.textContent).toBe(
      'replay:42'
    );
    expect(getCapturedFrameworkWarnings().join('\n')).not.toContain(
      'Unused state variable detected'
    );
  });

  it('should still warn for state that is never read during its component lifetime', () => {
    allowFrameworkWarnings(/Unused state variable detected/);

    function TrulyUnreadState() {
      state('never read');
      return <div>Rendered</div>;
    }

    createIsland({ root: container, component: TrulyUnreadState });
    flushScheduler();
    cleanup();
    cleanup = () => {};

    expect(getCapturedFrameworkWarnings().join('\n')).toContain(
      'Unused state variable detected'
    );
  });
});
