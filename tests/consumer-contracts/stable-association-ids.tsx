import { NameField } from './stable-association-ids-fixture';

const field = (
  <NameField
    id="profile-main:42:name"
    label="Name"
    description="Shown to teammates"
  />
);
// @ts-expect-error the application owner must supply a stable identity
const missingId = <NameField label="Name" description="Shown to teammates" />;
// @ts-expect-error application identity is a string
const invalidId: Parameters<typeof NameField>[0]['id'] = 42;
void [field, missingId, invalidId];
