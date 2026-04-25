# Benchmark Stability Workflow

Askr benchmarks are split into four lanes:

- `micro`: Node-only hot paths such as router matching and scheduler queues.
- `jsdom`: DOM patching and component render/update loops without layout
  dependency.
- `ssr`: render-to-string, streaming SSR, route-level SSR, and hydration payload
  generation.
- `browser`: Playwright trend capture for hydration, first interaction,
  navigation, large-list rendering, and layout-sensitive costs.

## Stable Lanes

Run the stable non-browser lanes with:

```bash
npm run bench
npm run bench:json
npm run bench:verify
```

`bench:verify` enforces stability thresholds for micro, jsdom, and SSR output:

- max RME: 15%
- min sample count: 10

Override thresholds ad hoc:

```bash
node scripts/generate-bench-log.js --verify --max-rme=12 --min-samples=12
```

## Browser Trends

Browser benchmarks are intentionally explicit:

```bash
npm run bench:browser
```

They write trend data to `bench-results/browser.json`. Treat this as regression
signal, not precise lab timing.

## Repeatability Check

Before trusting optimization deltas, run three consecutive captures:

```bash
npm run bench:json
npm run bench:json
npm run bench:json
```

If hotspot medians drift by more than 5%, retry under cleaner machine
conditions before drawing conclusions.

## Practical Run Conditions

- Close non-essential CPU and browser workloads.
- Keep power profile stable.
- Do not run in parallel with test or build jobs.
- Prefer back-to-back runs in the same shell session.
