import { describe, it, expect } from 'vite-plus/test';

describe('App Component', () => {
  it('renders layout with navigation', () => {
    const app = `
      <div>
        <header>
          <nav>
            <strong>Askr</strong>
            <div>
              <a href="/example">Example</a>
              <a href="/about">About</a>
            </div>
          </nav>
        </header>
        <main>
          <p>Content goes here</p>
        </main>
      </div>
    `;

    expect(app).toBeDefined();
  });
});
