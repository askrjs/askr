/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { hydrateSPA } from '@askrjs/askr/boot';

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
  const submitGuard = state({ active: false });

  const submitSignup = (event: Event) => {
    event.preventDefault();

    const guard = submitGuard();
    if (guard.active || pending()) {
      return;
    }

    if (!email().includes('@') || !acceptedTerms()) {
      setError('Enter an email address and accept the terms.');
      setMessage('');
      return;
    }

    guard.active = true;
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
        guard.active = false;
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
  const routes = [{ path: '/signup', handler: SignupForm }];

  if (window.location.pathname !== '/signup') {
    window.history.replaceState({}, '', '/signup');
  }

  const { renderToStringSyncForUrl } = await import('@askrjs/askr/ssr');
  root.innerHTML = renderToStringSyncForUrl({
    url: `${window.location.pathname}${window.location.search}`,
    routes,
  });

  await hydrateSPA({ root, routes });
}
