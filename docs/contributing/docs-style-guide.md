# Documentation Style Guide

This guide defines documentation standards for Askr.

## Audience-first structure

Every page should include:

1. Purpose
2. Prerequisites
3. Main concept
4. Working example
5. Common pitfalls
6. Next links

## Writing style

- Use concise, direct language.
- Prefer short sections and explicit headings.
- Keep examples runnable and minimal.
- Avoid placeholders and speculative statements.

## API accuracy

- Use root imports for common APIs.
- Use subpath imports for feature-specific APIs (`/router`, `/resources`, `/fx`, `/ssr`).
- Verify symbols against `src/index.ts` and package exports before publishing.

## Link quality

- Every new page must include at least one inbound and one outbound link.
- Avoid orphan pages.
- Keep links relative within `docs/` when possible.

## Review checklist

- Technically accurate
- Consistent terminology
- No dead links
- Updated navigation in [Docs Index](../index.md)
