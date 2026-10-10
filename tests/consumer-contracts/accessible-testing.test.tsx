import { expect, test } from 'vitest';
import { within, waitFor } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';
import { createDataRuntime, disposeDataRuntime } from '@askrjs/askr/data';
import { render } from '@askrjs/askr/testing';
import {
  makeAccessibleForm,
  makeAccessibleResults,
} from './accessible-testing-fixture.js';

test('should compose scoped accessible queries and awaited realistic interactions across independent views', async () => {
  let firstEvents = 0;
  let secondEvents = 0;
  const first = render(
    makeAccessibleForm('first', () => {
      firstEvents++;
    })
  );
  const second = render(
    makeAccessibleForm('second', () => {
      secondEvents++;
    })
  );
  const user = userEvent.setup({ document: first.container.ownerDocument });
  const a = within(first.container);
  const b = within(second.container);
  try {
    const input = a.getByRole('textbox', {
      name: 'Display name',
    }) as HTMLInputElement;
    expect(
      a.getByRole('textbox', {
        name: 'Display name',
        description: 'Public name',
      })
    ).toBe(input);
    expect(a.getByLabelText('Display name')).toBe(input);
    expect(a.getByRole('heading', { name: 'Profile' }).tagName).toBe('H1');
    expect(input.getAttribute('aria-describedby')).toBe('first-description');
    expect(a.getByText('Public name').id).toBe('first-description');
    await user.clear(input);
    await user.type(input, 'Axxa');
    expect(input.value).toBe('Axxa');
    expect((b.getByLabelText('Display name') as HTMLInputElement).value).toBe(
      'Ada'
    );
    input.setSelectionRange(1, 3);
    await user.keyboard('d');
    first.flush();
    expect(input.value).toBe('Ada');
    expect((b.getByLabelText('Display name') as HTMLInputElement).value).toBe(
      'Ada'
    );
    await user.tab();
    expect(document.activeElement).toBe(
      a.getByRole('button', { name: 'Save' })
    );
    await user.keyboard('{Enter}');
    first.flush();
    expect(a.getByRole('status').textContent).toBe('Saved Ada (1)');
    await user.keyboard(' ');
    first.flush();
    expect(a.getByRole('status').textContent).toBe('Saved Ada (2)');
    await user.click(a.getByRole('button', { name: 'Unavailable' }));
    first.flush();
    expect(a.getByRole('status').textContent).toBe('Saved Ada (2)');
    a.getByRole('button', { name: 'Save' }).focus();
    await user.tab();
    expect(document.activeElement).toBe(
      a.getByRole('button', { name: 'Open actions' })
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      a.getByRole('button', { name: 'Save' })
    );
    await user.click(a.getByRole('button', { name: 'Open actions' }));
    first.flush();
    await user.tab();
    expect(document.activeElement).toBe(
      within(a.getByRole('dialog', { name: 'Actions' })).getByRole('button', {
        name: 'Close',
      })
    );
    await user.keyboard('{Escape}');
    first.flush();
    expect(a.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(
      a.getByRole('button', { name: 'Open actions' })
    );
    expect(b.getByRole('status').textContent).toBe('Not saved');
    first.cleanup();
    first.cleanup();
    expect(document.body.contains(first.container)).toBe(false);
    window.dispatchEvent(new Event('askr-accessible-form'));
    expect(firstEvents).toBe(0);
    expect(secondEvents).toBe(1);
    await user.click(b.getByRole('button', { name: 'Save' }));
    second.flush();
    expect(b.getByRole('status').textContent).toBe('Saved Ada (1)');
  } finally {
    first.cleanup();
    second.cleanup();
  }
});

test('should settle explicit async data work, retry errors and retire one isolated owner', async () => {
  type Pending = {
    signal: AbortSignal;
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  };
  const pending: Pending[] = [];
  const otherPending: Pending[] = [];
  const fetcher = (queue: Pending[]) => (signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      queue.push({ signal, resolve, reject });
    });
  const runtime = createDataRuntime();
  const otherRuntime = createDataRuntime();
  const view = render(makeAccessibleResults(fetcher(pending)), {
    dataRuntime: runtime,
  });
  const other = render(makeAccessibleResults(fetcher(otherPending)), {
    dataRuntime: otherRuntime,
  });
  const queries = within(view.container);
  const survivor = within(other.container);
  const user = userEvent.setup({ document: view.container.ownerDocument });
  const settle = async (assertion: () => void) =>
    waitFor(
      () => {
        view.flush();
        other.flush();
        assertion();
      },
      { container: document.body }
    );
  try {
    await settle(() => {
      expect(pending).toHaveLength(1);
      expect(otherPending).toHaveLength(1);
    });
    view.flush();
    expect(queries.getByRole('status').textContent).toBe('Loading results');
    pending[0]!.reject(new Error('offline'));
    await settle(() => {
      expect(queries.getByRole('alert').textContent).toBe(
        'Could not load results'
      );
    });
    expect(survivor.queryByRole('alert')).toBeNull();
    await user.click(queries.getByRole('button', { name: 'Retry' }));
    await settle(() => {
      expect(pending).toHaveLength(2);
    });
    pending[1]!.resolve('First ready');
    otherPending[0]!.resolve('Survivor ready');
    await settle(() => {
      expect(queries.getByRole('status').textContent).toBe('First ready');
      expect(survivor.getByRole('status').textContent).toBe('Survivor ready');
    });
    await user.click(queries.getByRole('button', { name: 'Retry' }));
    await settle(() => {
      expect(pending).toHaveLength(3);
    });
    view.cleanup();
    disposeDataRuntime(runtime);
    expect(pending[2]!.signal.aborted).toBe(true);
    pending[2]!.resolve('Late retired value');
    await Promise.resolve();
    await Promise.resolve();
    other.flush();
    expect(document.body.contains(view.container)).toBe(false);
    expect(survivor.getByRole('status').textContent).toBe('Survivor ready');
  } finally {
    view.cleanup();
    other.cleanup();
    disposeDataRuntime(runtime);
    disposeDataRuntime(otherRuntime);
  }
});
