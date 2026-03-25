import { Link } from '@askrjs/askr/router';

const navButtonClass = 'button button-secondary';

export default function NotFoundPage() {
  return (
    <section class="not-found-page panel">
      <p class="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>
        The route you requested is not mapped in this starter. Use this page to
        wire your own fallback analytics and recovery flow.
      </p>
      <div class="hero-cta">
        <Link href="/dashboard" class="button">
          Go to dashboard
        </Link>
        <Link href="/" class={navButtonClass}>
          Back to landing
        </Link>
      </div>
    </section>
  );
}
