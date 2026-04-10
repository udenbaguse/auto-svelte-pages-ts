# Changelog

All notable changes to `auto-svelte-pages-ts` will be documented in this file.

## [1.0.0] - 2026-04-10

### Added
- Initial TypeScript edition based on `auto-svelte-pages` behavior.
- Generate `src/entry/<name>.ts` from root `*.html` files.
- Generate `src/component/<Name>.svelte` from root `*.html` files.
- Fill empty root HTML files with boilerplate using:
  - `<div id="app"></div>`
  - `<script type="module" src="./src/entry/<name>.ts"></script>`
- Auto-update Vite `build.rollupOptions.input` using marker block:
  - `// AUTO-GENERATED VITE INPUT START`
  - `// AUTO-GENERATED VITE INPUT END`
- Targeted generation for one or many files without full scan:
  - `auto-svelte-pages-ts file`
  - `auto-svelte-pages-ts file1 file2.html`
