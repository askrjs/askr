/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { hydrateSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';
import { renderToString } from '@askrjs/askr/ssr';

type SignupResponse = {
  email: string;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function SignupForm() {
  const [email, setEmail] = state('');
  const [acceptedTerms, setAcceptedTerms] = state(false);
  const [pending, setPending] = state(false);
  const [message, setMessage] = state('');
  const [error, setError] = state('');

  const submitSignup = (event: Event) => {
    event.preventDefault();

    if (pending()) {
      return;
    }

    if (!email().includes('@') || !acceptedTerms()) {
      setError('Enter an email address and accept the terms.');
      setMessage('');
      return;
    }

    setPending(true);
    setError('');
    setMessage('');

    void (async () => {
      try {
        const [response] = await Promise.all([
          fetch('/api/signup', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              email: email(),
              acceptedTerms: acceptedTerms(),
            }),
          }),
          wait(250),
        ]);

        if (!response.ok) {
          throw new Error('Signup failed');
        }

        const result = (await response.json()) as SignupResponse;
        setMessage(`Welcome, ${result.email}.`);
      } catch {
        setError('Signup failed. Try again.');
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <section aria-label="Signup">
      <h1>Join the newsletter</h1>
      <form
        aria-label="Newsletter signup"
        noValidate={true}
        onSubmit={submitSignup}
      >
        <label>
          Email address
          <input
            type="email"
            value={email()}
            onInput={(event: Event) =>
              setEmail((event.target as HTMLInputElement).value)
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={acceptedTerms()}
            onChange={(event: Event) =>
              setAcceptedTerms((event.target as HTMLInputElement).checked)
            }
          />
          Accept terms
        </label>
        <p role="alert" hidden={!error()}>
          {error()}
        </p>
        <p role="status" hidden={!message()}>
          {message()}
        </p>
        <button type="submit" disabled={pending()}>
          {pending() ? 'Signing up...' : 'Sign up'}
        </button>
      </form>
    </section>
  );
}

export async function mountHydrationFormScenario(
  root: HTMLElement
): Promise<void> {
  const registry = createRouteRegistry(() => {
    route('/signup', SignupForm);
  });

  if (window.location.pathname !== '/signup') {
    window.history.replaceState({}, '', '/signup');
  }

  root.innerHTML = renderToString({
    url: `${window.location.pathname}${window.location.search}`,
    registry,
  });

  await hydrateSPA({ root, registry });
}
