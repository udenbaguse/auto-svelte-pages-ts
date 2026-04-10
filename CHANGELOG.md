# Changelog

All notable changes to `auto-svelte-pages-ts` will be documented in this file.

## [1.2.1] - 2026-04-10

### Added
- `--watch` mode to monitor root HTML files and regenerate automatically on changes.
- `--watch` supports targeted mode as well (for example: `auto-svelte-pages-ts naruto --watch`).

## [1.2.0] - 2026-04-10

### Added
- `--watch` mode to monitor root HTML files and regenerate automatically on changes.
- `--watch` supports targeted mode as well (for example: `auto-svelte-pages-ts naruto --watch`).

## [1.0.1] - 2026-04-10

### Fixed
- Default Vite config resolution now prioritizes `vite.config.ts`.
- Added automatic fallback to `vite.config.js` when `vite.config.ts` does not exist.
- Updated CLI/help and documentation to reflect the TypeScript-first config behavior.

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
  - `auto-svelte-pages-ts naruto`
  - `auto-svelte-pages-ts naruto sasuke.html`
