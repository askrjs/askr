import { describe, it } from 'vitest';
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '../../../src/components/field/field';
import { expectDeterministicRender } from '../../determinism';

describe('Field - Determinism', () => {
  it('should render deterministic field markup', () => {
    expectDeterministicRender(() => (
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
    ));
  });
});
