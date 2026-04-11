# CLI Workflows

End-to-end CLI workflows for common Askr tasks.

## Start a new application

```bash
# Create a full-featured application starter
npx @askrjs/askr-cli create startkit my-app
cd my-app
npm run dev
```

## Start a minimal SPA

```bash
npx @askrjs/askr-cli create spa my-spa
cd my-spa
npm run dev
```

## Generate a static site

```bash
# Create an SSG project
npx @askrjs/askr-cli create ssg my-site
cd my-site

# Build static output
npm run build

# Or run SSG directly with a config
npx @askrjs/askr-cli ssg --config ./ssg.config.ts --output ./dist/static
```

## Build and preview

```bash
npm run build
npm run preview
```

## See also

- [create](./create.md)
- [add](./add.md)
- [SSG guide](../core/rendering.md)
- [Full CLI reference](../reference/cli.md)
