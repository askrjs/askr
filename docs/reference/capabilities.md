# Capability Manifest

`capabilities.json` is the versioned, machine-readable capability index for
`@askrjs/askr`. It is published at the package root and is importable as
`@askrjs/askr/capabilities.json`.

Each entry contains the app intent, owning package and import path, public
exports, runtime constraints, stability, canonical documentation URL, and the
repository documentation path used to validate the entry. Consumers should
read the manifest from the installed package version instead of scraping source
files or website pages.
