import { Link } from '@askrjs/askr/router';
import { Button } from '@askrjs/askr-ui/button';

export default function NotFoundPage() {
  return (
    <section class="not-found-page panel">
      <p class="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>
        The route you requested is not mapped in this starter. Use this page to wire your own
        fallback analytics and recovery flow.
      </p>
      <div class="hero-cta">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button asChild class="button-secondary">
          <Link href="/">Back to landing</Link>
        </Button>
      </div>
    </section>
  );
}
