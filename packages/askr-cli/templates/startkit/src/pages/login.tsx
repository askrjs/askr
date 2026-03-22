import { state } from '@askrjs/askr';
import { Link } from '@askrjs/askr/router';
import { Button } from '@askrjs/askr-ui/button';
import { Field, FieldLabel } from '@askrjs/askr-ui/field';
import { Input } from '@askrjs/askr-ui/input';
import { LockKeyhole, Mail } from '@askrjs/icons-lucide';
import { signIn } from '../lib/mock-data';
import { showToast } from '../toast';

export default function LoginPage() {
  const [email, setEmail] = state('alex@example.com');
  const [password, setPassword] = state('askr1234');
  const [errorText, setErrorText] = state('');
  const [submitting, setSubmitting] = state(false);

  const validate = () => {
    if (!email().trim().includes('@')) {
      return 'Enter a valid email address.';
    }

    if (password().trim().length < 8) {
      return 'Password must be at least 8 characters.';
    }

    return '';
  };

  const submit = async (event: Event) => {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setErrorText(validationError);
      return;
    }

    setSubmitting(true);
    setErrorText('');

    try {
      await signIn({ email: email(), password: password() });
      showToast({
        title: 'Signed in',
        description: 'Welcome back. You can now access protected routes.',
      });
      window.location.assign('/dashboard');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Could not sign in.');
      setSubmitting(false);
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
            <Mail size={15} aria-hidden="true" />
            <Input
              type="email"
              value={email()}
              onInput={(event: Event) => setEmail((event.target as HTMLInputElement).value)}
            />
          </label>
        </Field>

        <Field id="login-password">
          <FieldLabel fieldId="login-password">Password</FieldLabel>
          <label class="input-row">
            <LockKeyhole size={15} aria-hidden="true" />
            <Input
              type="password"
              value={password()}
              onInput={(event: Event) => setPassword((event.target as HTMLInputElement).value)}
            />
          </label>
        </Field>

        {errorText() && (
          <p class="field-error" role="alert">
            {errorText()}
          </p>
        )}

        <Button type="submit" disabled={submitting()}>
          {submitting() ? 'Signing in...' : 'Sign in'}
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
              description: 'This is a starter example. Replace with your auth flow.',
            })
          }
        >
          Forgot password?
        </button>
      </div>
    </section>
  );
}
