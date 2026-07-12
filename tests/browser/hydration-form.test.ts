import { expect, test, vi } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { userEvent } from 'vitest/browser';
import { loadBrowserHarness, setBrowserLocation } from './_helpers';

type Submission = {
  email: string;
  acceptedTerms: boolean;
};

function mockSignup(
  options: { delayMs?: number; release?: Promise<void> } = {}
): Submission[] {
  const submissions: Submission[] = [];

  vi.stubGlobal(
    'fetch',
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        email?: string;
        acceptedTerms?: boolean;
      };

      const submission = {
        email: body.email ?? '',
        acceptedTerms: body.acceptedTerms === true,
      };
      submissions.push(submission);

      if (options.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }

      if (options.release) {
        await options.release;
      }

      return new Response(JSON.stringify({ email: submission.email }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
  );

  return submissions;
}

test.describe('hydrated signup form workflow', () => {
  test.beforeEach(async () => {
    setBrowserLocation('/signup');
    const app = await loadBrowserHarness();
    await app.mountSignupHydrationScenario();
  });

  test('should attach hydrated form listeners and submit controlled values @smoke', async () => {
    let releaseSignup!: () => void;
    const signupReleased = new Promise<void>((resolve) => {
      releaseSignup = resolve;
    });
    const submissions = mockSignup({ release: signupReleased });

    await expect(
      page.getByRole('heading', { name: 'Join the newsletter' })
    ).toBeVisible();

    await page.getByLabelText('Email address').fill('reader@example.com');
    await page.getByRole('checkbox', { name: 'Accept terms' }).click();
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(
      page.getByRole('button', { name: 'Signing up...' })
    ).toBeDisabled();
    releaseSignup();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Welcome, reader@example.com.');
    expect(submissions).toEqual([
      { email: 'reader@example.com', acceptedTerms: true },
    ]);
  });

  test('should avoid duplicate signup submissions while pending', async () => {
    const submissions = mockSignup({ delayMs: 100 });

    const email = page.getByLabelText('Email address');
    await email.fill('once@example.com');
    await page.getByLabelText('Accept terms').click();

    await email.click();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');

    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Welcome, once@example.com.');
    expect(submissions).toHaveLength(1);
  });

  test('should validate hydrated form fields before submitting', async () => {
    const submissions = mockSignup();

    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Enter an email address and accept the terms.');
    expect(submissions).toHaveLength(0);
  });

  test('should submit the form from the keyboard after hydration', async () => {
    const submissions = mockSignup();

    await page.getByLabelText('Email address').fill('keyboard@example.com');
    await page.getByLabelText('Accept terms').click();
    await page.getByLabelText('Email address').click();
    await userEvent.keyboard('{Enter}');

    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Welcome, keyboard@example.com.');
    expect(submissions).toEqual([
      { email: 'keyboard@example.com', acceptedTerms: true },
    ]);
  });
});
// @askr-allow-real-timers -- browser integration uses network-style delays.
