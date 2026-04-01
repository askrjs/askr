export default function About() {
  return (
    <>
      <h1>About Askr</h1>
      <p class="text-muted">
        A modern reactive framework for building fast, maintainable web
        applications.
      </p>

      <section class="section">
        <h2>Why Askr Exists</h2>
        <p>
          Modern web development has become unnecessarily complex. Frameworks
          have grown bloated with abstractions, requiring developers to learn
          extensive APIs and fight against the framework rather than work with
          it.
        </p>
        <p>
          Askr was created to bring simplicity back to web development. It
          provides just enough structure to build sophisticated applications
          while staying out of your way.
        </p>
      </section>

      <section class="section">
        <h2>Core Primitives</h2>
        <div class="features">
          <div class="feature-card">
            <h3>Fine-grained Reactivity</h3>
            <p>
              <code>state()</code> for reactive values with automatic dependency
              tracking. Updates are surgical — only the specific DOM nodes that
              need to change are updated.
            </p>
          </div>
          <div class="feature-card">
            <h3>Simple Async Data</h3>
            <p>
              <code>resource()</code> handles async data fetching with built-in
              loading states, error handling, and automatic refetching when
              dependencies change.
            </p>
          </div>
          <div class="feature-card">
            <h3>Declarative Routing</h3>
            <p>
              Routes are declared at module-load time with{' '}
              <code>registerRoutes()</code>, <code>group()</code>, and{' '}
              <code>route()</code>. Clean, type-safe, and no configuration
              needed.
            </p>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>The Ecosystem</h2>
        <p>
          <strong>askr</strong> — the core framework with reactive primitives,
          routing, SSR, and SSG support. Zero runtime dependencies.
        </p>
        <p>
          <strong>askr-ui</strong> — headless, accessible UI components. Button,
          Tabs, Accordion, Dialog, and 30+ more. All interaction logic, no
          opinions on style.
        </p>
        <p>
          <strong>askr-themes</strong> — CSS-only themes that target askr-ui's{' '}
          <code>data-slot</code> attributes. Swap themes with a single import
          change.
        </p>
      </section>
    </>
  );
}
