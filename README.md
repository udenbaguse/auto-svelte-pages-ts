# auto-svelte-pages-ts

Generate Svelte TypeScript `entry` + `component` files from root HTML pages and auto-sync Vite multi-page `rollupOptions.input`.

## Features

- Scan root `*.html` files and generate:
  - HTML boilerplate (`#app` + script to `./src/entry/<name>.ts`) for empty HTML files
  - `src/entry/<name>.ts`
  - `src/component/<Name>.svelte`
- Targeted mode: generate only selected files (`auto-svelte-pages-ts file1 file2`)
- Auto-update `vite.config.js` input block using markers
- Reusable as CLI or JavaScript module

## Install

```bash
npm i -D github:udenbaguse/auto-svelte-pages-ts
```


## Required Vite Markers

In `vite.config.ts`, add this marker block inside `build.rollupOptions.input`:

```ts
 build: {
    rollupOptions: {
      input: {
        // AUTO-GENERATED VITE INPUT START
        // AUTO-GENERATED VITE INPUT END
      },
    },
  },
```

The CLI replaces only the content between those markers.

## CLI Options

- `--no-vite` skip updating `vite.config.ts`
- `--root-only` only use root HTML files for Vite input (no recursive scan)
- `--root <path>` project root (default: current directory)
- `--src-dir <dir>` source directory under root (default: `src`)
- `--entry-dir <dir>` entry directory under src (default: `entry`)
- `--component-dir <dir>` component directory under src (default: `component`)
- `--vite-config <file>` Vite config path from root (default: `vite.config.ts`)
- `--css-import <path>` CSS import path for generated entry files (default: `../app.css`)

## Script Setup Example

```json
{
  "scripts": {
    "generate:all": "auto-svelte-pages",
    "generate:": "auto-svelte-pages"
  }
}
```


## Use

Single file:

```bash
npm run generate: -- file
```

Multiple files:

```bash
npm run generate: -- file1 file2
```

All files:

```bash
npm run generate:all
```

## Programmatic API

```js
import { generatePages } from "auto-svelte-pages";

await generatePages({
  force: false,
  updateVite: true,
});
```

## Changelog

- See `CHANGELOG.md` for release notes.
