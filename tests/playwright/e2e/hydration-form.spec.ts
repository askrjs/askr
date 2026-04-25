import { expect, test, type Page, type Route } from '@playwright/test';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mockSignup(
  page: Page,
  options: { delayMs?: number; release?: Promise<void> } = {}
): Promise<Array<{ email: string; acceptedTerms: boolean }>> {
  const submissions: Array<{ email: string; acceptedTerms: boolean }> = [];

  await page.route('**/api/signup', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      email?: string;
      acceptedTerms?: boolean;
    };
    const submission = {
      email: body.email ?? '',
      acceptedTerms: body.acceptedTerms === true,
    };
    submissions.push(submission);

    if (options.delayMs) {
      await wait(options.delayMs);
    }
    if (options.release) {
      await options.release;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: submission.email }),
    });
  });

  return submissions;
}

test.describe('hydrated signup form workflow', () => {
  test('should attach hydrated form listeners and submit controlled values @smoke', async ({
    page,
  }) => {
    let releaseSignup!: () => void;
    const signupReleased = new Promise<void>((resolve) => {
      releaseSignup = resolve;
    });
    const submissions = await mockSignup(page, { release: signupReleased });

    await page.goto('/signup');

    await expect(
      page.getByRole('heading', { name: 'Join the newsletter' })
    ).toBeVisible();

    await page.getByLabel('Email address').fill('reader@example.com');
    await page.getByLabel('Accept terms').check();
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(
      page.getByRole('button', { name: 'Signing up...' })
    ).toBeDisabled();
    releaseSignup();
    await expect(page.getByRole('status')).toHaveText(
      'Welcome, reader@example.com.'
    );
    expect(submissions).toEqual([
      { email: 'reader@example.com', acceptedTerms: true },
    ]);
  });

  test('should avoid duplicate signup submissions while pending', async ({
    page,
  }) => {
    const submissions = await mockSignup(page, { delayMs: 100 });

    await page.goto('/signup');

    const email = page.getByLabel('Email address');
    await email.fill('once@example.com');
    await page.getByLabel('Accept terms').check();

    await email.press('Enter');
    await email.press('Enter');

    await expect(page.getByRole('status')).toHaveText(
      'Welcome, once@example.com.'
    );
    expect(submissions).toHaveLength(1);
  });

  test('should validate hydrated form fields before submitting', async ({
    page,
  }) => {
    const submissions = await mockSignup(page);

    await page.goto('/signup');

    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Enter an email address and accept the terms.'
    );
    expect(submissions).toHaveLength(0);
  });
});
