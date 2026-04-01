import { state } from '@askrjs/askr';
import { Button } from '@askrjs/askr-ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from '@askrjs/askr-ui/dialog';
import { Field, FieldLabel } from '@askrjs/askr-ui/field';
import { Input } from '@askrjs/askr-ui/input';
import { Inline } from '@askrjs/askr-ui/inline';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from '@askrjs/askr-ui/select';
import { Switch } from '@askrjs/askr-ui/switch';
import { SaveIcon } from '@askrjs/askr-lucide';
import PageHeader from '../../components/page-header';
import {
  appearanceMode,
  setAppearance,
  type AppearanceMode,
} from '../../lib/mock-data';
import { showToast } from '../../toast';

export default function SettingsPage() {
  const [fullNameState, setFullNameState] = state('Alex Morgan');
  const [emailState, setEmailState] = state('alex@example.com');
  const [timezoneState, setTimezoneState] = state('utc');
  const [marketingEmailsState, setMarketingEmailsState] = state(false);
  const [incidentAlertsState, setIncidentAlertsState] = state(true);
  const [validationErrorState, setValidationErrorState] = state('');
  const [savingState, setSavingState] = state(false);

  const save = async () => {
    if (!fullNameState().trim()) {
      setValidationErrorState('Full name is required.');
      return;
    }

    if (!emailState().trim().includes('@')) {
      setValidationErrorState('Email must be valid.');
      return;
    }

    setValidationErrorState('');
    setSavingState(true);

    await new Promise((resolve) => setTimeout(resolve, 260));

    setSavingState(false);
    showToast({
      title: 'Settings saved',
      description:
        'Profile and preference values were persisted in mock state.',
    });
  };

  return (
    <section class="stack-lg">
      <PageHeader
        title="Settings"
        description="Profile settings, workspace preferences, and production form patterns."
        actions={
          <Button onPress={() => void save()} disabled={savingState()}>
            <SaveIcon size={14} aria-hidden="true" />{' '}
            {savingState() ? 'Saving...' : 'Save changes'}
          </Button>
        }
      />

      <div class="settings-grid">
        <section class="panel stack-md">
          <h2>Profile</h2>

          <Field id="profile-name">
            <FieldLabel fieldId="profile-name">Full name</FieldLabel>
            <Input
              value={fullNameState()}
              onInput={(event: Event) =>
                setFullNameState((event.target as HTMLInputElement).value)
              }
            />
          </Field>

          <Field id="profile-email">
            <FieldLabel fieldId="profile-email">Email</FieldLabel>
            <Input
              type="email"
              value={emailState()}
              onInput={(event: Event) =>
                setEmailState((event.target as HTMLInputElement).value)
              }
            />
          </Field>

          <Field id="profile-timezone">
            <FieldLabel fieldId="profile-timezone">Timezone</FieldLabel>
            <Select value={timezoneState()} onValueChange={setTimezoneState}>
              <SelectTrigger aria-label="Timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectPortal>
                <SelectContent>
                  <SelectItem value="utc">UTC</SelectItem>
                  <SelectItem value="pst">Pacific Time</SelectItem>
                  <SelectItem value="est">Eastern Time</SelectItem>
                </SelectContent>
              </SelectPortal>
            </Select>
          </Field>

          {validationErrorState() && (
            <p class="field-error" role="alert">
              {validationErrorState()}
            </p>
          )}
        </section>

        <section class="panel stack-md">
          <h2>Preferences</h2>

          <label class="switch-row">
            <div>
              <strong>Incident alerts</strong>
              <p class="muted">
                Receive critical service incident notifications.
              </p>
            </div>
            <Switch
              checked={incidentAlertsState()}
              onCheckedChange={setIncidentAlertsState}
            />
          </label>

          <label class="switch-row">
            <div>
              <strong>Marketing emails</strong>
              <p class="muted">Product updates and launch notes.</p>
            </div>
            <Switch
              checked={marketingEmailsState()}
              onCheckedChange={setMarketingEmailsState}
            />
          </label>

          <Field id="appearance-mode">
            <FieldLabel fieldId="appearance-mode">Appearance mode</FieldLabel>
            <Select
              value={appearanceMode()}
              onValueChange={(value) => setAppearance(value as AppearanceMode)}
            >
              <SelectTrigger aria-label="Appearance mode">
                <SelectValue placeholder="Appearance" />
              </SelectTrigger>
              <SelectPortal>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="harbor">Harbor</SelectItem>
                  <SelectItem value="ink">Ink</SelectItem>
                </SelectContent>
              </SelectPortal>
            </Select>
          </Field>

          <Inline align="center" gap="var(--ak-space-sm)" wrap="wrap">
            <Button class="button-secondary" disabled>
              Disabled action example
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button class="button-secondary">Open modal example</Button>
              </DialogTrigger>
              <DialogPortal>
                <DialogOverlay />
                <DialogContent class="panel stack-md">
                  <DialogTitle>Reset workspace preferences?</DialogTitle>
                  <DialogDescription>
                    This is a modal wiring example. Connect this to real
                    persistence logic.
                  </DialogDescription>
                  <div class="inline-end">
                    <DialogClose asChild>
                      <Button class="button-secondary">Cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        onPress={() =>
                          showToast({
                            title: 'Preferences reset',
                            description:
                              'Demonstration modal action completed.',
                          })
                        }
                      >
                        Confirm reset
                      </Button>
                    </DialogClose>
                  </div>
                </DialogContent>
              </DialogPortal>
            </Dialog>
          </Inline>
        </section>
      </div>
    </section>
  );
}
