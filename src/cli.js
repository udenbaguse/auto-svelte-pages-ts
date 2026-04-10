import { generatePages } from './generator.js';

function parseArgs(argv) {
  const options = {
    updateVite: true,
    includeNestedHtml: true,
    targets: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--no-vite') {
      options.updateVite = false;
      continue;
    }

    if (arg === '--root-only') {
      options.includeNestedHtml = false;
      continue;
    }

    if (arg === '--root') {
      options.rootDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--src-dir') {
      options.srcDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--entry-dir') {
      options.entryDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--component-dir') {
      options.componentDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--vite-config') {
      options.viteConfig = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--css-import') {
      options.appCssImportPath = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    options.targets.push(arg);
  }

  return options;
}

function printHelp() {
  console.log(`auto-svelte-pages-ts

Usage:
  auto-svelte-pages-ts [options] [file1 file2 ...]

Options:
  --no-vite            Skip updating vite.config.js input block
  --root-only          Use root HTML files only for Vite input (no recursive scan)
  --root <path>        Project root (default: current directory)
  --src-dir <dir>      Source dir under root (default: src)
  --entry-dir <dir>    Entry dir under src (default: entry)
  --component-dir <dir>Component dir under src (default: component)
  --vite-config <file> Vite config path from root (default: vite.config.js)
  --css-import <path>  CSS import path used in generated entry file (default: ../app.css)
  --help, -h           Show help

Examples:
  auto-svelte-pages-ts
  auto-svelte-pages-ts naruto
  auto-svelte-pages-ts naruto sasuke.html
`);
}

export async function runCli(argv) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  const result = await generatePages(options);
  for (const line of result.logs) {
    console.log(line);
  }
}
