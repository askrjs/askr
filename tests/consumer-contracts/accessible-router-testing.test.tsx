import { expect, test } from 'vitest';
import { within } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';
import { createRouteRegistry, route } from '@askrjs/askr/router';
import { renderRoute } from '@askrjs/askr/testing';
import { makeAccessibleForm } from './accessible-testing-fixture.js';

// This file gets its own SPA realm. Component harness tests own an islands realm.
test('should use the same accessible recipe with the native routed screen', async () => {
  const Form = makeAccessibleForm('route');
  const registry = createRouteRegistry(() => {
    route('/profile', Form);
  });
  const view = await renderRoute({ registry, url: '/profile' });
  const user = userEvent.setup({ document: view.container.ownerDocument });
  const queries = within(view.container);
  try {
    await user.clear(queries.getByLabelText('Display name'));
    await user.type(
      queries.getByRole('textbox', { name: 'Display name' }),
      'Grace'
    );
    await user.click(queries.getByRole('button', { name: 'Save' }));
    view.flush();
    expect(queries.getByRole('status').textContent).toBe('Saved Grace (1)');
  } finally {
    view.cleanup();
  }
});
