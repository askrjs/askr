import { describe, expect, it } from 'vite-plus/test';
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
import { FIELD_A11Y_CONTRACT } from '../../../src/components/composites/field/field-a11y';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('Field - Accessibility', () => {
  it('should have no automated axe violations given composed field control', async () => {
    await expectNoAxeViolations(
      <Field id="email" required>
        <FieldLabel>Email</FieldLabel>
        <FieldInput />
        <FieldDescription>Used for login</FieldDescription>
      </Field>
    );
  });

  it('should wire label and descriptions onto the control', () => {
    const container = mount(
      <Field id="email" invalid required>
        <FieldLabel>Email</FieldLabel>
        <FieldInput />
        <FieldDescription>Used for login</FieldDescription>
        <FieldError>Required</FieldError>
      </Field>
    );

    try {
      const control = container.querySelector('input');
      expect(control?.getAttribute('aria-describedby')).toBe(
        `email${FIELD_A11Y_CONTRACT.DESCRIPTION_ID_SUFFIX} email${FIELD_A11Y_CONTRACT.ERROR_ID_SUFFIX}`
      );
      expect(control?.getAttribute(FIELD_A11Y_CONTRACT.INVALID_ATTRIBUTE)).toBe(
        'true'
      );
      expect(
        control?.getAttribute(FIELD_A11Y_CONTRACT.REQUIRED_ATTRIBUTE)
      ).toBe('true');
    } finally {
      unmount(container);
    }
  });

  it('should have no automated axe violations for grouped controls', async () => {
    await expectNoAxeViolations(
      <Fieldset>
        <FieldLegend>Preferences</FieldLegend>
        <Field id="alerts">
          <FieldRow>
            <span>Incident alerts</span>
            <FieldSwitch checked />
          </FieldRow>
        </Field>
        <Field id="terms">
          <FieldRow>
            <span>Accept terms</span>
            <FieldCheckbox checked />
          </FieldRow>
        </Field>
        <Field id="size">
          <FieldLabel>Size</FieldLabel>
          <FieldRadioGroup value="m">
            <RadioGroupItem value="s">Small</RadioGroupItem>
            <RadioGroupItem value="m">Medium</RadioGroupItem>
          </FieldRadioGroup>
        </Field>
      </Fieldset>
    );
  });
});
