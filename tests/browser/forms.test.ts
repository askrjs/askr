import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness } from './_helpers';

test.describe('account settings form workflow', () => {
  test.beforeEach(async () => {
    const app = await loadBrowserHarness();
    app.mountAccountSettingsScenario();
  });

  test('should edit, submit, and reset a controlled settings form @smoke', async () => {
    await page.getByLabelText('Full name').fill('Ada Lovelace');
    await page.getByLabelText('Email address').fill('ada@example.com');
    await page
      .getByRole('checkbox', { name: 'Receive product updates' })
      .click();
    await page.getByLabelText('Account role').selectOptions('admin');
    await page.getByRole('radio', { name: 'Phone' }).click();

    await expect
      .element(page.getByLabelText('Settings preview'))
      .toHaveTextContent(
        'Ada Lovelace will be saved as admin with phone contact.'
      );

    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(
      page.getByRole('button', { name: 'Saving...' })
    ).toBeDisabled();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Saved account settings for Ada Lovelace.');

    await page.getByRole('button', { name: 'Reset' }).click();

    await expect(page.getByLabelText('Full name')).toHaveValue('');
    await expect(page.getByLabelText('Email address')).toHaveValue('');
    await expect(
      page.getByLabelText('Receive product updates')
    ).not.toBeChecked();
    await expect(page.getByLabelText('Account role')).toHaveValue('viewer');
    await expect(page.getByRole('radio', { name: 'Email' })).toBeChecked();
  });

  test('should validate required fields and recover after correction', async () => {
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Name is required.');

    await page.getByLabelText('Full name').fill('Grace Hopper');
    await page.getByLabelText('Email address').fill('not-an-email');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Enter a valid email address.');

    await page.getByLabelText('Email address').fill('grace@example.com');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => page.getByRole('alert').elements().length).toBe(0);
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Saved account settings for Grace Hopper.');
  });

  test('should preserve focus and typed value while previews update', async () => {
    const name = page.getByLabelText('Full name');
    await name.click();
    await page
      .getByRole('textbox', { name: 'Full name' })
      .fill('Katherine Johnson');

    await expect.element(name).toHaveFocus();
    await expect(name).toHaveValue('Katherine Johnson');
    await expect
      .element(page.getByLabelText('Settings preview'))
      .toHaveTextContent(
        'Katherine Johnson will be saved as viewer with email contact.'
      );
  });
});
