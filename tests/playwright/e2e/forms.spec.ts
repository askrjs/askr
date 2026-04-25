import { expect, test } from '@playwright/test';

test.describe('account settings form workflow', () => {
  test('should edit, submit, and reset a controlled settings form @smoke', async ({
    page,
  }) => {
    await page.goto('/?scenario=forms');

    await page.getByLabel('Full name').fill('Ada Lovelace');
    await page.getByLabel('Email address').fill('ada@example.com');
    await page.getByLabel('Receive product updates').check();
    await page.getByLabel('Account role').selectOption('admin');
    await page.getByLabel('Phone').check();

    await expect(page.getByLabel('Settings preview')).toHaveText(
      'Ada Lovelace will be saved as admin with phone contact.'
    );

    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(
      page.getByRole('button', { name: 'Saving...' })
    ).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText(
      'Saved account settings for Ada Lovelace.'
    );

    await page.getByRole('button', { name: 'Reset' }).click();

    await expect(page.getByLabel('Full name')).toHaveValue('');
    await expect(page.getByLabel('Email address')).toHaveValue('');
    await expect(page.getByLabel('Receive product updates')).not.toBeChecked();
    await expect(page.getByLabel('Account role')).toHaveValue('viewer');
    await expect(page.getByLabel('Email', { exact: true })).toBeChecked();
  });

  test('should validate required fields and recover after correction', async ({
    page,
  }) => {
    await page.goto('/?scenario=forms');

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toHaveText('Name is required.');

    await page.getByLabel('Full name').fill('Grace Hopper');
    await page.getByLabel('Email address').fill('not-an-email');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Enter a valid email address.'
    );

    await page.getByLabel('Email address').fill('grace@example.com');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(
      'Saved account settings for Grace Hopper.'
    );
  });

  test('should preserve focus and typed value while previews update', async ({
    page,
  }) => {
    await page.goto('/?scenario=forms');

    const name = page.getByLabel('Full name');
    await name.click();
    await name.pressSequentially('Katherine Johnson');

    await expect(name).toBeFocused();
    await expect(name).toHaveValue('Katherine Johnson');
    await expect(page.getByLabel('Settings preview')).toHaveText(
      'Katherine Johnson will be saved as viewer with email contact.'
    );
  });
});
