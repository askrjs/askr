# Development: Contributing

How to contribute to the Askr platform.

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
npm run build                        # all packages
npm run --workspace @askrjs/askr build # single package
```

## Test

```bash
npm test                             # all packages
npm run --workspace @askrjs/askr test # single package
```

## Lint and format

```bash
npm run lint
npm run fmt
```

## Docs style guide

See [docs style guide](../contributing/docs-style-guide.md) for writing conventions,
tone guidelines, and formatting rules used across all platform documentation.

## See also

- [Repo structure](./repo-structure.md)
- [Docs style guide](../contributing/docs-style-guide.md)
- [Testing guide](../contributing/testing.md)
- [Release](./release.md)
