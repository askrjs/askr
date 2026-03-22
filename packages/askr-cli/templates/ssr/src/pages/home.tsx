import { Link } from '@askrjs/askr/router';
import { Button } from '@askrjs/askr-ui/button';
import { Badge } from '@askrjs/askr-ui/badge';

export default function Home() {
  return (
    <>
      <section class="text-center section">
        <h1>Welcome to Askr</h1>
        <p class="text-muted">
          A minimalist reactive framework for modern web applications.
          Fine-grained reactivity, zero runtime dependencies, TypeScript-first.
        </p>
        <div class="hero-actions">
          <Button asChild>
            <Link href="/example">View Examples</Link>
          </Button>
          <Button asChild>
            <Link href="/about">Learn More</Link>
          </Button>
        </div>
      </section>

      <div class="features">
        <div class="feature-card">
          <h3>
            <Badge>Reactive</Badge>
          </h3>
          <p>
            <code>state()</code> and <code>derive()</code> give you fine-grained
            reactivity. Only the DOM nodes that depend on changed values update
            — nothing more.
          </p>
        </div>
        <div class="feature-card">
          <h3>
            <Badge>Async</Badge>
          </h3>
          <p>
            <code>resource()</code> handles data fetching with built-in loading
            states, error handling, and automatic refetching when dependencies
            change.
          </p>
        </div>
        <div class="feature-card">
          <h3>
            <Badge>Composable</Badge>
          </h3>
          <p>
            askr-ui provides headless components. askr-themes provides CSS
            themes. Mix and match — or build your own.
          </p>
        </div>
      </div>
    </>
  );
}
