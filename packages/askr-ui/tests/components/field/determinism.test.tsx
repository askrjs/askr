import { describe, it } from 'vite-plus/test';
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
import { expectDeterministicRender } from '../../determinism';

describe('Field - Determinism', () => {
  it('should render deterministic field markup', () => {
    expectDeterministicRender(() => (
      <Fieldset>
        <FieldLegend>Profile</FieldLegend>
        <Field id="email" invalid required>
          <FieldLabel>Email</FieldLabel>
          <FieldInput />
          <FieldDescription>Used for login</FieldDescription>
          <FieldError>Required</FieldError>
        </Field>
        <Field id="updates">
          <FieldRow>
            <span>Receive updates</span>
            <FieldCheckbox checked />
          </FieldRow>
        </Field>
        <Field id="alerts">
          <FieldRow>
            <span>Incident alerts</span>
            <FieldSwitch checked />
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
    ));
  });
});
