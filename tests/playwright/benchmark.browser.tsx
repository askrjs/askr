import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp } from '../../src/boot';
import { mountBenchmark } from '../../src/bench/benchmark-entry';

const { page } = await import('vite-plus/test/browser/context');

describe('playwright browser coverage', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root') as HTMLElement;
  });

  afterEach(() => {
    cleanupApp(root);
    document.body.innerHTML = '';
  });

  it('applies benchmark row selection through a real browser click', async () => {
    mountBenchmark(root, [
      { id: 1, label: 'Item 1' },
      { id: 2, label: 'Item 2' },
      { id: 3, label: 'Item 3' },
    ]);

    const secondRow = page.getByRole('row').nth(1);
    await expect.element(page.getByText('Item 2')).toBeInTheDocument();

    await page.getByText('Item 2').click();

    await expect.element(secondRow).toHaveClass('danger');
  });

  it('renders benchmark rows after programmatic updates in the browser', async () => {
    const app = mountBenchmark(root);

    app.setRows([
      { id: 7, label: 'Alpha' },
      { id: 8, label: 'Beta' },
    ]);

    await expect.element(page.getByText('Alpha')).toBeInTheDocument();
    await expect.element(page.getByText('Beta')).toBeInTheDocument();
    await expect.element(page.getByRole('row').nth(0)).toHaveTextContent('7');
  });
});
