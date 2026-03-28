import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createIsland } from '@askrjs/askr';
import {
  Field,
  FieldCheckbox,
  FieldDescription,
  FieldError,
  FieldInput,
  FieldLegend,
  FieldLabel,
  FieldRadioGroup,
  FieldRow,
  FieldSwitch,
  Fieldset,
} from '../../../src/components/composites/field/field';
import { RadioGroupItem } from '../../../src/components/primitives/radio-group/radio-group';

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
        <FieldLabel>Email</FieldLabel>
        <FieldInput />
        <FieldDescription>Used for login</FieldDescription>
        <FieldError>Required</FieldError>
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

  it('should allow nested field text when fieldId is explicit', () => {
    container = mount(
      <Field id="alerts">
        <div>
          <FieldLabel fieldId="alerts">Incident alerts</FieldLabel>
          <FieldDescription fieldId="alerts">
            Receive critical service incident notifications.
          </FieldDescription>
        </div>
        <FieldSwitch fieldId="alerts" checked />
      </Field>
    );

    const label = container.querySelector('[data-slot="field-label"]');
    const description = container.querySelector(
      '[data-slot="field-description"]'
    );
    const switchButton = container.querySelector('[data-slot="field-switch"]');

    expect(label?.getAttribute('for')).toBe('alerts-control');
    expect(description?.getAttribute('id')).toBe('alerts-description');
    expect(switchButton?.getAttribute('aria-describedby')).toBe(
      'alerts-description'
    );
  });

  it('throws when a field subcomponent is rendered without a field', () => {
    expect(() => mount(<FieldLabel>Orphan</FieldLabel>)).toThrow(
      'Field subcomponents require a shared fieldId when used with the current runtime'
    );
  });

  it('renders semantic field grouping primitives', () => {
    container = mount(
      <Fieldset disabled>
        <FieldLegend>Notifications</FieldLegend>
        <FieldRow>
          <span>Email alerts</span>
          <input type="checkbox" />
        </FieldRow>
      </Fieldset>
    );

    const fieldset = container.querySelector('fieldset');
    const legend = container.querySelector('legend');
    const row = container.querySelector('label');

    expect(fieldset?.getAttribute('data-slot')).toBe('fieldset');
    expect(fieldset?.hasAttribute('disabled')).toBe(true);
    expect(legend?.textContent).toBe('Notifications');
    expect(row?.getAttribute('data-slot')).toBe('field-row');
  });

  it('wires choice controls through the field API', () => {
    container = mount(
      <Fieldset>
        <Field id="terms" required>
          <FieldRow>
            <span>Accept terms</span>
            <FieldCheckbox checked />
          </FieldRow>
        </Field>
        <Field id="alerts">
          <FieldRow>
            <span>Incident alerts</span>
            <FieldSwitch checked />
          </FieldRow>
        </Field>
        <Field id="size" invalid>
          <FieldLabel>Size</FieldLabel>
          <FieldRadioGroup value="m">
            <RadioGroupItem value="s">Small</RadioGroupItem>
            <RadioGroupItem value="m">Medium</RadioGroupItem>
          </FieldRadioGroup>
          <FieldError>Pick a size</FieldError>
        </Field>
      </Fieldset>
    );

    const checkbox = container.querySelector('input[type="checkbox"]');
    const switchButton = container.querySelector('[data-slot="field-switch"]');
    const radioGroup = container.querySelector(
      '[data-slot="field-radio-group"]'
    );

    expect(checkbox?.getAttribute('id')).toBe('terms-control');
    expect(checkbox?.getAttribute('aria-required')).toBe('true');
    expect(switchButton?.getAttribute('id')).toBe('alerts-control');
    expect(radioGroup?.getAttribute('aria-invalid')).toBe('true');
    expect(radioGroup?.getAttribute('aria-describedby')).toBe(
      'size-description size-error'
    );
  });
});
