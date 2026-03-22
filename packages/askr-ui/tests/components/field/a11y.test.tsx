import { describe, expect, it } from 'vitest';
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '../../../src/components/field/field';
import { FIELD_A11Y_CONTRACT } from '../../../src/components/field/field.a11y';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('Field - Accessibility', () => {
  it('should have no automated axe violations given composed field control', async () => {
    await expectNoAxeViolations(
      <Field id="email" required>
        <FieldLabel fieldId="email">Email</FieldLabel>
        <FieldControl asChild fieldId="email" required children={<input />} />
        <FieldDescription fieldId="email">Used for login</FieldDescription>
      </Field>
    );
  });

  it('should wire label and descriptions onto the control', () => {
    const container = mount(
      <Field id="email" invalid required>
        <FieldLabel fieldId="email">Email</FieldLabel>
        <FieldControl
          asChild
          fieldId="email"
          invalid
          required
          children={<input />}
        />
        <FieldDescription fieldId="email">Used for login</FieldDescription>
        <FieldError fieldId="email">Required</FieldError>
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
});
