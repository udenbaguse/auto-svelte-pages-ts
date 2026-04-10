import { promises as fs } from 'node:fs';
import path from 'node:path';

const INPUT_START_MARKER = '// AUTO-GENERATED VITE INPUT START';
const INPUT_END_MARKER = '// AUTO-GENERATED VITE INPUT END';

function toPascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function toViteInputKey(relativeHtmlPath) {
  const withoutExt = relativeHtmlPath.replace(/\.html$/i, '');
  const segments = withoutExt.split(/[\\/]+/).filter(Boolean);
  return segments.join('_').toLowerCase();
}

function entryTemplate(componentName, appCssImportPath) {
  return `import { mount } from 'svelte'
import '${appCssImportPath}'
import App from '../component/${componentName}.svelte'

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
`;
}

function componentTemplate(componentName) {
  return `<script lang="ts">
  const title = '${componentName}';
</script>

<h1>{title}</h1>
`;
}

function htmlTemplate(pageName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageName}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/entry/${pageName}.ts"></script>
</body>
</html>
`;
}

async function listHtmlFilesRecursively(rootDir, dir, ignoreDirs) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const htmlFiles = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);

    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) {
        continue;
      }

      const nested = await listHtmlFilesRecursively(
        rootDir,
        absolutePath,
        ignoreDirs,
      );
      htmlFiles.push(...nested);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(relativePath);
    }
  }

  return htmlFiles;
}

function createInputBlock(relativeHtmlPaths) {
  const pathByKey = new Map();
  for (const relativePath of relativeHtmlPaths) {
    pathByKey.set(toViteInputKey(relativePath), normalizePath(relativePath));
  }

  const lines = [...pathByKey.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, relativePath]) => `        ${key}: '${relativePath}',`);

  return [
    `        ${INPUT_START_MARKER}`,
    ...lines,
    `        ${INPUT_END_MARKER}`,
  ].join('\n');
}

function parseExistingInputEntries(blockContent) {
  const entries = new Map();
  const entryPattern = /([a-z0-9_]+)\s*:\s*'([^']+)'/gi;
  let match = entryPattern.exec(blockContent);

  while (match) {
    entries.set(match[1], match[2]);
    match = entryPattern.exec(blockContent);
  }

  return entries;
}

function getMarkerPattern(escapedStart, escapedEnd) {
  return new RegExp(
    `^[ \\t]*${escapedStart}[\\s\\S]*?^[ \\t]*${escapedEnd}`,
    'm',
  );
}

function normalizeTargetFile(target) {
  return target.endsWith('.html') ? target : `${target}.html`;
}

async function resolveRootTargetHtmlFiles(rootDir, targets) {
  const resolved = [];
  for (const target of targets) {
    const cleanTarget = target.trim();
    if (!cleanTarget) {
      continue;
    }
    const htmlFile = normalizeTargetFile(cleanTarget);

    const targetPath = path.join(rootDir, htmlFile);
    const relative = path.relative(rootDir, targetPath);
    const isRootFile = !relative.includes(path.sep);

    if (!isRootFile) {
      throw new Error(`Target must be a root HTML file: ${target}`);
    }

    try {
      const stats = await fs.stat(targetPath);
      if (!stats.isFile()) {
        throw new Error(`Target is not a file: ${target}`);
      }
    } catch {
      throw new Error(`Target HTML file not found: ${htmlFile}`);
    }

    resolved.push(htmlFile);
  }

  return [...new Set(resolved)];
}

async function writeIfNeeded(filePath, content) {
  let exists = true;
  try {
    await fs.access(filePath);
  } catch {
    exists = false;
  }

  if (!exists) {
    await fs.writeFile(filePath, content, 'utf8');
    return 'created';
  }

  return 'skipped';
}

async function writeHtmlBoilerplateIfNeeded(htmlPath, pageName) {
  const existingContent = await fs.readFile(htmlPath, 'utf8');
  if (existingContent.trim().length > 0) {
    return 'skipped';
  }

  await fs.writeFile(htmlPath, htmlTemplate(pageName), 'utf8');
  return 'templated';
}

async function updateViteInput({ rootDir, viteConfigPath, htmlFiles }) {
  const viteContent = await fs.readFile(viteConfigPath, 'utf8');
  const escapedStart = INPUT_START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = INPUT_END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markerPattern = getMarkerPattern(escapedStart, escapedEnd);

  if (!markerPattern.test(viteContent)) {
    throw new Error(
      `Cannot update Vite input. Missing markers in ${path.relative(
        rootDir,
        viteConfigPath,
      )}: "${INPUT_START_MARKER}" and "${INPUT_END_MARKER}".`,
    );
  }

  const nextContent = viteContent.replace(markerPattern, createInputBlock(htmlFiles));
  await fs.writeFile(viteConfigPath, nextContent, 'utf8');
}

async function upsertViteInputTargets({ rootDir, viteConfigPath, htmlTargets }) {
  const viteContent = await fs.readFile(viteConfigPath, 'utf8');
  const escapedStart = INPUT_START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = INPUT_END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markerPattern = getMarkerPattern(escapedStart, escapedEnd);
  const match = viteContent.match(markerPattern);

  if (!match) {
    throw new Error(
      `Cannot update Vite input. Missing markers in ${path.relative(
        rootDir,
        viteConfigPath,
      )}: "${INPUT_START_MARKER}" and "${INPUT_END_MARKER}".`,
    );
  }

  const existingEntries = parseExistingInputEntries(match[0]);
  for (const target of htmlTargets) {
    existingEntries.set(toViteInputKey(target), normalizePath(target));
  }

  const mergedPaths = [...existingEntries.values()];
  const nextContent = viteContent.replace(markerPattern, createInputBlock(mergedPaths));
  await fs.writeFile(viteConfigPath, nextContent, 'utf8');
}

export async function generatePages(userOptions = {}) {
  const rootDir = path.resolve(userOptions.rootDir ?? process.cwd());
  const srcDir = path.join(rootDir, userOptions.srcDir ?? 'src');
  const entryDir = path.join(srcDir, userOptions.entryDir ?? 'entry');
  const componentDir = path.join(srcDir, userOptions.componentDir ?? 'component');
  const viteConfigPath = path.join(rootDir, userOptions.viteConfig ?? 'vite.config.js');
  const updateVite = userOptions.updateVite !== false;
  const includeNestedHtml = userOptions.includeNestedHtml !== false;
  const ignoreDirs = new Set(userOptions.ignoreDirs ?? ['.git', 'node_modules', 'dist']);
  const appCssImportPath = userOptions.appCssImportPath ?? '../app.css';
  const targetFiles = Array.isArray(userOptions.targets) ? userOptions.targets : [];

  let rootHtmlFiles = [];
  if (targetFiles.length > 0) {
    rootHtmlFiles = await resolveRootTargetHtmlFiles(rootDir, targetFiles);
  } else {
    const rootEntries = await fs.readdir(rootDir, { withFileTypes: true });
    rootHtmlFiles = rootEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
      .map((entry) => entry.name);
  }

  await fs.mkdir(entryDir, { recursive: true });
  await fs.mkdir(componentDir, { recursive: true });

  const logs = [];
  for (const htmlFile of rootHtmlFiles) {
    const baseName = path.parse(htmlFile).name;
    const componentName = toPascalCase(baseName);
    const htmlPath = path.join(rootDir, htmlFile);
    const entryPath = path.join(entryDir, `${baseName}.ts`);
    const componentPath = path.join(componentDir, `${componentName}.svelte`);

    const htmlResult = await writeHtmlBoilerplateIfNeeded(
      htmlPath,
      baseName,
    );
    logs.push(`${htmlResult.toUpperCase()} ${path.relative(rootDir, htmlPath)}`);

    const entryResult = await writeIfNeeded(
      entryPath,
      entryTemplate(componentName, appCssImportPath),
    );
    logs.push(`${entryResult.toUpperCase()} ${path.relative(rootDir, entryPath)}`);

    const componentResult = await writeIfNeeded(
      componentPath,
      componentTemplate(componentName),
    );
    logs.push(`${componentResult.toUpperCase()} ${path.relative(rootDir, componentPath)}`);
  }

  if (updateVite) {
    if (targetFiles.length > 0) {
      await upsertViteInputTargets({
        rootDir,
        viteConfigPath,
        htmlTargets: rootHtmlFiles,
      });
    } else {
      const htmlFiles = includeNestedHtml
        ? await listHtmlFilesRecursively(rootDir, rootDir, ignoreDirs)
        : rootHtmlFiles;
      htmlFiles.sort((a, b) => a.localeCompare(b));
      await updateViteInput({ rootDir, viteConfigPath, htmlFiles });
    }
    logs.push(`UPDATED ${path.relative(rootDir, viteConfigPath)} Vite input`);
  }

  if (rootHtmlFiles.length === 0) {
    logs.push('No root HTML files found. Nothing to generate.');
  }

  return {
    rootHtmlFiles,
    logs,
    markers: {
      start: INPUT_START_MARKER,
      end: INPUT_END_MARKER,
    },
  };
}
