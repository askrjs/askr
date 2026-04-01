import { Link } from '@askrjs/askr/router';
import {
  ShieldCheckIcon,
  WorkflowIcon,
  LayoutPanelTopIcon,
  SparklesIcon,
} from '@askrjs/askr-lucide';
import { dashboardRoute, loginRoute } from '../lib/routes';

const navButtonClass = 'button button-secondary';

export default function LandingPage() {
  return (
    <section class="marketing-page">
      <header class="marketing-header">
        <Link href="/" class="brand-link">
          <span class="brand-pill" aria-hidden="true">
            A
          </span>
          <strong>{'{{appName}}'}</strong>
        </Link>
        <div class="marketing-actions">
          <Link href={loginRoute.href} class={navButtonClass}>
            {loginRoute.navLabel}
          </Link>
        </div>
      </header>

      <div class="hero-block panel">
        <p class="eyebrow">Production-ready starter</p>
        <h1>Build your Askr app like a real product from day one.</h1>
        <p>
          This starter combines Askr, askr-ui, askr-themes, and lucide icons in
          a practical SaaS baseline with semantic pages, composed route trees,
          and shared layouts.
        </p>
        <div class="hero-cta">
          <Link href={dashboardRoute.href} class="button">
            Open dashboard
          </Link>
          <Link href={loginRoute.href} class={navButtonClass}>
            Try login flow
          </Link>
        </div>
      </div>

      <section class="feature-grid">
        <article class="panel feature-card">
          <WorkflowIcon size={18} aria-hidden="true" />
          <h2>Composed routes</h2>
          <p>
            Public, auth, protected, and 404 routes are assembled from small
            child route modules instead of one large router file.
          </p>
        </article>
        <article class="panel feature-card">
          <LayoutPanelTopIcon size={18} aria-hidden="true" />
          <h2>Composed UI patterns</h2>
          <p>
            Reusable table, headers, empty states, stat cards, sidebar, and top
            app header.
          </p>
        </article>
        <article class="panel feature-card">
          <ShieldCheckIcon size={18} aria-hidden="true" />
          <h2>State and data flow</h2>
          <p>
            Deterministic mock data with loading, empty, error, and mutation
            states.
          </p>
        </article>
        <article class="panel feature-card">
          <SparklesIcon size={18} aria-hidden="true" />
          <h2>Calm visual baseline</h2>
          <p>
            CSS token system, neutral palette, one accent color, and restrained
            depth.
          </p>
        </article>
      </section>
    </section>
  );
}
