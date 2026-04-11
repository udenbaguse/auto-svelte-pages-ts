import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_INPUT_START_MARKER = "// AUTO-GENERATED VITE INPUT START";
const DEFAULT_INPUT_END_MARKER = "// AUTO-GENERATED VITE INPUT END";
const DEFAULT_CONFIG_TS_FILE = "auto-svelte-pages.config.ts";
const DEFAULT_CONFIG_JS_FILE = "auto-svelte-pages.config.js";

function toPascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function toViteInputKey(relativeHtmlPath) {
  const withoutExt = relativeHtmlPath.replace(/\.html$/i, "");
  const segments = withoutExt.split(/[\\/]+/).filter(Boolean);
  return segments.join("_").toLowerCase();
}

function toImportPath(fromDir, toFile) {
  const relativePath = normalizePath(path.relative(fromDir, toFile));
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function entryTemplate(componentName, appCssImportPath, componentImportPath) {
  return `import { mount } from 'svelte'
import '${appCssImportPath}'
import App from '${componentImportPath}'

const app = mount(App, {
  target: document.getElementById('app')!,
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

function htmlTemplate(pageName, entryDirName) {
  const entrySrc = normalizePath(
    path.join("src", entryDirName, `${pageName}.ts`),
  );
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageName}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./${entrySrc}"></script>
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

    if (entry.isFile() && entry.name.endsWith(".html")) {
      htmlFiles.push(relativePath);
    }
  }

  return htmlFiles;
}

function createInputBlock(relativeHtmlPaths, markers) {
  const pathByKey = new Map();
  for (const relativePath of relativeHtmlPaths) {
    pathByKey.set(toViteInputKey(relativePath), normalizePath(relativePath));
  }

  const lines = [...pathByKey.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, relativePath]) => `        ${key}: '${relativePath}',`);

  return [`        ${markers.start}`, ...lines, `        ${markers.end}`].join(
    "\n",
  );
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
    "m",
  );
}

function normalizeTargetFile(target) {
  return target.endsWith(".html") ? target : `${target}.html`;
}

async function resolveDefaultViteConfigPath(rootDir) {
  const tsPath = path.join(rootDir, "vite.config.ts");
  try {
    await fs.access(tsPath);
    return tsPath;
  } catch {
    return path.join(rootDir, "vite.config.js");
  }
}

async function loadConfig(rootDir, configPathFromCli) {
  let candidatePath = null;
  if (configPathFromCli) {
    candidatePath = path.resolve(rootDir, configPathFromCli);
    try {
      await fs.access(candidatePath);
    } catch {
      return {};
    }
  } else {
    const tsCandidate = path.join(rootDir, DEFAULT_CONFIG_TS_FILE);
    const jsCandidate = path.join(rootDir, DEFAULT_CONFIG_JS_FILE);
    try {
      await fs.access(tsCandidate);
      candidatePath = tsCandidate;
    } catch {
      try {
        await fs.access(jsCandidate);
        candidatePath = jsCandidate;
      } catch {
        return {};
      }
    }
  }

  const configModule = await import(pathToFileURL(candidatePath).href);
  const loadedConfig = configModule.default ?? configModule;

  if (
    !loadedConfig ||
    typeof loadedConfig !== "object" ||
    Array.isArray(loadedConfig)
  ) {
    throw new Error(
      `Invalid config file: ${path.relative(rootDir, candidatePath)}`,
    );
  }

  return loadedConfig;
}

function resolveConfigValue(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
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
    await fs.writeFile(filePath, content, "utf8");
    return "created";
  }

  return "skipped";
}

async function writeHtmlBoilerplateIfNeeded(htmlPath, pageName, entryDirName) {
  const existingContent = await fs.readFile(htmlPath, "utf8");
  if (existingContent.trim().length > 0) {
    return "skipped";
  }

  await fs.writeFile(htmlPath, htmlTemplate(pageName, entryDirName), "utf8");
  return "templated";
}

async function updateViteInput({
  rootDir,
  viteConfigPath,
  htmlFiles,
  markers,
}) {
  const viteContent = await fs.readFile(viteConfigPath, "utf8");
  const escapedStart = markers.start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = markers.end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markerPattern = getMarkerPattern(escapedStart, escapedEnd);

  if (!markerPattern.test(viteContent)) {
    throw new Error(
      `Cannot update Vite input. Missing markers in ${path.relative(
        rootDir,
        viteConfigPath,
      )}: "${markers.start}" and "${markers.end}".`,
    );
  }

  const nextContent = viteContent.replace(
    markerPattern,
    createInputBlock(htmlFiles, markers),
  );
  await fs.writeFile(viteConfigPath, nextContent, "utf8");
}

async function upsertViteInputTargets({
  rootDir,
  viteConfigPath,
  htmlTargets,
  markers,
}) {
  const viteContent = await fs.readFile(viteConfigPath, "utf8");
  const escapedStart = markers.start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = markers.end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markerPattern = getMarkerPattern(escapedStart, escapedEnd);
  const match = viteContent.match(markerPattern);

  if (!match) {
    throw new Error(
      `Cannot update Vite input. Missing markers in ${path.relative(
        rootDir,
        viteConfigPath,
      )}: "${markers.start}" and "${markers.end}".`,
    );
  }

  const existingEntries = parseExistingInputEntries(match[0]);
  for (const target of htmlTargets) {
    existingEntries.set(toViteInputKey(target), normalizePath(target));
  }

  const mergedPaths = [...existingEntries.values()];
  const nextContent = viteContent.replace(
    markerPattern,
    createInputBlock(mergedPaths, markers),
  );
  await fs.writeFile(viteConfigPath, nextContent, "utf8");
}

export async function generatePages(userOptions = {}) {
  const rootDir = path.resolve(userOptions.rootDir ?? process.cwd());
  const loadedConfig = await loadConfig(rootDir, userOptions.configPath);

  const srcDirName = resolveConfigValue(
    userOptions.srcDir,
    loadedConfig.srcDir,
    loadedConfig.dirs?.src,
    loadedConfig.dir?.src,
    "src",
  );
  const entryDirName = resolveConfigValue(
    userOptions.entryDir,
    loadedConfig.entryDir,
    loadedConfig.dirs?.entry,
    loadedConfig.dir?.entry,
    "entry",
  );
  const componentDirName = resolveConfigValue(
    userOptions.componentDir,
    loadedConfig.componentDir,
    loadedConfig.dirs?.component,
    loadedConfig.dir?.component,
    "component",
  );
  const viteConfigFile = resolveConfigValue(
    userOptions.viteConfig,
    loadedConfig.viteConfig,
    undefined,
  );

  const srcDir = path.join(rootDir, srcDirName);
  const entryDir = path.join(srcDir, entryDirName);
  const componentDir = path.join(srcDir, componentDirName);
  const viteConfigPath = viteConfigFile
    ? path.join(rootDir, viteConfigFile)
    : await resolveDefaultViteConfigPath(rootDir);

  const updateVite =
    resolveConfigValue(
      userOptions.updateVite,
      loadedConfig.updateVite,
      true,
    ) !== false;
  const includeNestedHtml =
    resolveConfigValue(
      userOptions.includeNestedHtml,
      loadedConfig.includeNestedHtml,
      true,
    ) !== false;
  const ignoreDirs = new Set(
    resolveConfigValue(userOptions.ignoreDirs, loadedConfig.ignoreDirs, [
      ".git",
      "node_modules",
      "dist",
    ]),
  );
  const appCssImportPath = resolveConfigValue(
    userOptions.appCssImportPath,
    loadedConfig.appCssImportPath,
    loadedConfig.cssImport,
    "../app.css",
  );
  const markers = {
    start: resolveConfigValue(
      userOptions.inputStartMarker,
      loadedConfig.inputStartMarker,
      loadedConfig.markers?.start,
      loadedConfig.marker?.start,
      DEFAULT_INPUT_START_MARKER,
    ),
    end: resolveConfigValue(
      userOptions.inputEndMarker,
      loadedConfig.inputEndMarker,
      loadedConfig.markers?.end,
      loadedConfig.marker?.end,
      DEFAULT_INPUT_END_MARKER,
    ),
  };
  const targetFiles = Array.isArray(userOptions.targets)
    ? userOptions.targets
    : [];

  let rootHtmlFiles = [];
  if (targetFiles.length > 0) {
    rootHtmlFiles = await resolveRootTargetHtmlFiles(rootDir, targetFiles);
  } else {
    const rootEntries = await fs.readdir(rootDir, { withFileTypes: true });
    rootHtmlFiles = rootEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
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
    const componentImportPath = toImportPath(entryDir, componentPath);

    const htmlResult = await writeHtmlBoilerplateIfNeeded(
      htmlPath,
      baseName,
      entryDirName,
    );
    logs.push(
      `${htmlResult.toUpperCase()} ${path.relative(rootDir, htmlPath)}`,
    );

    const entryResult = await writeIfNeeded(
      entryPath,
      entryTemplate(componentName, appCssImportPath, componentImportPath),
    );
    logs.push(
      `${entryResult.toUpperCase()} ${path.relative(rootDir, entryPath)}`,
    );

    const componentResult = await writeIfNeeded(
      componentPath,
      componentTemplate(componentName),
    );
    logs.push(
      `${componentResult.toUpperCase()} ${path.relative(rootDir, componentPath)}`,
    );
  }

  if (updateVite) {
    if (targetFiles.length > 0) {
      await upsertViteInputTargets({
        rootDir,
        viteConfigPath,
        htmlTargets: rootHtmlFiles,
        markers,
      });
    } else {
      const htmlFiles = includeNestedHtml
        ? await listHtmlFilesRecursively(rootDir, rootDir, ignoreDirs)
        : rootHtmlFiles;
      htmlFiles.sort((a, b) => a.localeCompare(b));
      await updateViteInput({ rootDir, viteConfigPath, htmlFiles, markers });
    }
    logs.push(`UPDATED ${path.relative(rootDir, viteConfigPath)} Vite input`);
  }

  if (rootHtmlFiles.length === 0) {
    logs.push("No root HTML files found. Nothing to generate.");
  }

  return {
    rootHtmlFiles,
    logs,
    markers: {
      start: markers.start,
      end: markers.end,
    },
  };
}
