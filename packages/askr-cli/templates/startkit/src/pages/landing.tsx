import { Link } from '@askrjs/askr/router';
import { Button } from '@askrjs/askr-ui/button';
import { ShieldCheck, Workflow, LayoutPanelTop, Sparkles } from '@askrjs/askr-lucide';

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
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <div class="hero-block panel">
        <p class="eyebrow">Production-ready starter</p>
        <h1>Build your Askr app like a real product from day one.</h1>
        <p>
          This starter combines Askr, askr-ui, askr-themes, and lucide icons in a practical SaaS
          baseline with clear route boundaries, shared layouts, and reusable app components.
        </p>
        <div class="hero-cta">
          <Button asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
          <Button asChild class="button-secondary">
            <Link href="/login">Try login flow</Link>
          </Button>
        </div>
      </div>

      <section class="feature-grid">
        <article class="panel feature-card">
          <Workflow size={18} aria-hidden="true" />
          <h2>Routing and layout boundaries</h2>
          <p>Public, auth, protected, and 404 routes with separate app and auth shells.</p>
        </article>
        <article class="panel feature-card">
          <LayoutPanelTop size={18} aria-hidden="true" />
          <h2>Composed UI patterns</h2>
          <p>Reusable table, headers, empty states, stat cards, sidebar, and top app header.</p>
        </article>
        <article class="panel feature-card">
          <ShieldCheck size={18} aria-hidden="true" />
          <h2>State and data flow</h2>
          <p>Deterministic mock data with loading, empty, error, and mutation states.</p>
        </article>
        <article class="panel feature-card">
          <Sparkles size={18} aria-hidden="true" />
          <h2>Calm visual baseline</h2>
          <p>CSS token system, neutral palette, one accent color, and restrained depth.</p>
        </article>
      </section>
    </section>
  );
}
