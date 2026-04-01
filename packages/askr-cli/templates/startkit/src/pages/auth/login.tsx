import { state } from '@askrjs/askr';
import { Link, currentRoute, navigate } from '@askrjs/askr/router';
import { Button } from '@askrjs/askr-ui/button';
import { Field, FieldLabel } from '@askrjs/askr-ui/field';
import { Input } from '@askrjs/askr-ui/input';
import { LockKeyholeIcon, MailIcon } from '@askrjs/askr-lucide';
import { signIn } from '../../lib/mock-data';
import {
  dashboardRoute,
  normalizeProtectedRouteTarget,
} from '../../lib/routes';
import { showToast } from '../../toast';

export default function LoginPage() {
  const [emailState, setEmailState] = state('alex@example.com');
  const [passwordState, setPasswordState] = state('askr1234');
  const [errorTextState, setErrorTextState] = state('');
  const [submittingState, setSubmittingState] = state(false);
  const routeSnapshot = currentRoute();

  const redirectTarget = () =>
    normalizeProtectedRouteTarget(routeSnapshot.query.get('next')) ||
    dashboardRoute.href;

  const validate = () => {
    if (!emailState().trim().includes('@')) {
      return 'Enter a valid email address.';
    }

    if (passwordState().trim().length < 8) {
      return 'Password must be at least 8 characters.';
    }

    return '';
  };

  const submit = async (event: Event) => {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setErrorTextState(validationError);
      return;
    }

    setSubmittingState(true);
    setErrorTextState('');

    try {
      await signIn({ email: emailState(), password: passwordState() });
      showToast({
        title: 'Signed in',
        description: 'Welcome back. You can now access protected routes.',
      });
      navigate(redirectTarget(), { history: 'replace' });
    } catch (error) {
      setErrorTextState(
        error instanceof Error ? error.message : 'Could not sign in.'
      );
      setSubmittingState(false);
    }
  };

  return (
    <section class="auth-page panel">
      <h1>Sign in</h1>
      <p>Use your workspace account to continue.</p>

      <form class="auth-form" onSubmit={submit}>
        <Field id="login-email">
          <FieldLabel fieldId="login-email">Email</FieldLabel>
          <label class="input-row">
            <MailIcon size={15} aria-hidden="true" />
            <Input
              type="email"
              value={emailState()}
              onInput={(event: Event) =>
                setEmailState((event.target as HTMLInputElement).value)
              }
            />
          </label>
        </Field>

        <Field id="login-password">
          <FieldLabel fieldId="login-password">Password</FieldLabel>
          <label class="input-row">
            <LockKeyholeIcon size={15} aria-hidden="true" />
            <Input
              type="password"
              value={passwordState()}
              onInput={(event: Event) =>
                setPasswordState((event.target as HTMLInputElement).value)
              }
            />
          </label>
        </Field>

        {errorTextState() && (
          <p class="field-error" role="alert">
            {errorTextState()}
          </p>
        )}

        <Button type="submit" disabled={submittingState()}>
          {submittingState() ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div class="auth-links">
        <Link href="/">Back to landing</Link>
        <button
          type="button"
          class="link-button"
          onClick={() =>
            showToast({
              title: 'Reset link sent',
              description:
                'This is a starter example. Replace with your auth flow.',
            })
          }
        >
          Forgot password?
        </button>
      </div>
    </section>
  );
}
