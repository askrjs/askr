import { within } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';
import { render } from '@askrjs/askr/testing';

// Public imports must support strict Bundler and NodeNext consumers.
export function accessibleTestingTypes() {
  const view = render(() => <button type="button">{'Save'}</button>);
  const user = userEvent.setup({ document: view.container.ownerDocument });
  const interaction: Promise<void> = user.click(
    within(view.container).getByRole('button', { name: 'Save' })
  );
  void interaction;
  view.cleanup();
}
