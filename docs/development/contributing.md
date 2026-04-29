# Development: Contributing

How to contribute to the `@askrjs/askr` runtime and platform docs.

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

```bash
git clone https://github.com/askrjs/askr
cd askr
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
npm run test:types
```

## Lint and Format

```bash
npm run lint
npm run fmt
```

Package-specific changes for `askr-ui`, `askr-themes`, `askr-cli`,
`askr-vite`, `askr-lucide`, or `askr-charts` should be made and validated in
the owning package repository.

## Docs Style Guide

See [docs style guide](../contributing/docs-style-guide.md) for writing
conventions, tone guidelines, and formatting rules used across platform
documentation.

## See Also

- [Repo structure](./repo-structure.md)
- [Docs style guide](../contributing/docs-style-guide.md)
- [Testing guide](../contributing/testing.md)
- [Release](./release.md)
