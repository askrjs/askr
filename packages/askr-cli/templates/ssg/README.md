# {{appName}}

Static site built with [Askr](https://github.com/askrjs/askr).

## Development

```bash
npm run dev        # Start dev server (runs as SPA)
npm run build      # Build for production
npm run generate   # Generate static HTML pages
npm run preview    # Preview production build
npm test           # Run tests
npm run lint       # Lint code
npm run type-check # Type check
```

## Static Generation

Run `npm run generate` to pre-render all routes as static HTML files in `dist/static/`.

Configure routes in `ssg.config.ts`.
