import { afterEach, describe, expect, it } from 'vitest';
import { createIsland } from '@askrjs/askr';
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '../../../src/components/field/field';

function mount(element: JSX.Element): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  createIsland({
    root: container,
    component: () => element,
  });
  return container;
}

function unmount(container: HTMLElement) {
  if (container.parentNode) {
    container.parentNode.removeChild(container);
  }
}

describe('Field — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  it('wires field metadata onto its control', () => {
    container = mount(
      <Field id="email" invalid required>
        <FieldLabel fieldId="email">Email</FieldLabel>
        <FieldControl asChild fieldId="email" invalid required>
          <input />
        </FieldControl>
        <FieldDescription fieldId="email">Used for login</FieldDescription>
        <FieldError fieldId="email">Required</FieldError>
      </Field>
    );

    const input = container.querySelector('input');
    const label = container.querySelector('label');

    expect(label?.textContent).toBe('Email');
    expect(input?.getAttribute('id')).toBe('email-control');
    expect(input?.getAttribute('aria-describedby')).toBe(
      'email-description email-error'
    );
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-required')).toBe('true');
  });

  it('throws when a field subcomponent is rendered without a field', () => {
    expect(() => mount(<FieldLabel>Orphan</FieldLabel>)).toThrow(
      'Field subcomponents require a shared fieldId when used with the current runtime'
    );
  });
});
