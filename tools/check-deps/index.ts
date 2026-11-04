/**
 * Dependency-direction and version-fact check for the MSM monorepo.
 *
 * Run with `node tools/check-deps/index.ts` (Node >= 22.18 strips types).
 * Only erasable TypeScript syntax and `node:` imports are allowed here.
 *
 * 1. Every `@msm/*` entry in a workspace package's dependencies,
 *    devDependencies or peerDependencies must be allowed by `layers.json`.
 * 2. No `.ts`/`.tsx` file under `packages/<pkg>/src`, `packages/<pkg>/test`
 *    or `app/src` (excluding `packages/targets/**`) may contain a Minecraft
 *    version literal such as `26.3`, unless the line contains
 *    `msm-allow-version`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Allowed internal dependencies per package name or glob (`*` matches any suffix). */
export type LayerMap = Record<string, string[]>;

export interface WorkspacePackage {
  /** Package name from package.json. */
  name: string;
  /** Directory relative to the repository root, POSIX separators. */
  dir: string;
  /** Every dependency name across dependencies, devDependencies and peerDependencies. */
  dependencies: string[];
}

export interface SourceFile {
  /** Path relative to the repository root, POSIX separators. */
  path: string;
  content: string;
}

export interface Violation {
  kind: 'layer' | 'version-fact' | 'unknown-package';
  message: string;
}

/** Matches a name against a pattern where `*` matches any sequence of characters. */
export function matchesPattern(name: string, pattern: string): boolean {
  if (!pattern.includes('*')) return name === pattern;
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\/-]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(name);
}

/**
 * Finds the layer rule for a package name. An exact key wins over a glob;
 * among globs the longest (most specific) pattern wins.
 */
export function ruleFor(name: string, layers: LayerMap): string[] | undefined {
  const exact = layers[name];
  if (exact !== undefined) return exact;
  let best: string | undefined;
  for (const pattern of Object.keys(layers)) {
    if (pattern.includes('*') && matchesPattern(name, pattern)) {
      if (best === undefined || pattern.length > best.length) best = pattern;
    }
  }
  return best === undefined ? undefined : layers[best];
}

/** Checks every internal dependency against the layer map. */
export function checkLayers(packages: readonly WorkspacePackage[], layers: LayerMap): Violation[] {
  const violations: Violation[] = [];
  for (const pkg of packages) {
    if (!pkg.name.startsWith('@msm/')) continue;
    const allowed = ruleFor(pkg.name, layers);
    if (allowed === undefined) {
      violations.push({
        kind: 'unknown-package',
        message: `${pkg.dir}: package ${pkg.name} has no entry in layers.json`,
      });
      continue;
    }
    for (const dep of pkg.dependencies) {
      if (!dep.startsWith('@msm/') || dep === pkg.name) continue;
      if (!allowed.some((pattern) => matchesPattern(dep, pattern))) {
        violations.push({
          kind: 'layer',
          message: `${pkg.dir}: ${pkg.name} must not depend on ${dep} (allowed: ${allowed.length === 0 ? 'none' : allowed.join(', ')})`,
        });
      }
    }
  }
  return violations;
}

/** A Minecraft version literal such as `26.3` or `26.3.1`. */
export const VERSION_FACT = /\b26\.[0-9]+(\.[0-9]+)?\b/;
export const ALLOW_MARKER = 'msm-allow-version';

/** Whether a file path is subject to the version-fact grep. */
export function isVersionCheckedPath(path: string): boolean {
  if (!/\.tsx?$/.test(path)) return false;
  if (path.startsWith('packages/targets/')) return false;
  if (path.split('/').includes('node_modules')) return false;
  if (path.startsWith('app/src/')) return true;
  return /^packages\/.+\/(src|test)\//.test(path);
}

/** Reports every line holding a version literal outside `packages/targets`. */
export function findVersionFacts(files: readonly SourceFile[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    if (!isVersionCheckedPath(file.path)) continue;
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (VERSION_FACT.test(line) && !line.includes(ALLOW_MARKER)) {
        violations.push({
          kind: 'version-fact',
          message: `${file.path}:${index + 1}: version-specific literal outside packages/targets: ${line.trim()}`,
        });
      }
    });
  }
  return violations;
}

const toPosix = (path: string): string => path.split(sep).join('/');

/** Reads the `packages:` list from pnpm-workspace.yaml (simple block-list form only). */
export function parseWorkspaceGlobs(yaml: string): string[] {
  const globs: string[] = [];
  let inPackages = false;
  for (const raw of yaml.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(raw)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s+-\s+['"]?([^'"#]+?)['"]?\s*$/.exec(raw);
    if (item?.[1] !== undefined) {
      globs.push(item[1]);
    } else if (/^\S/.test(raw)) {
      inPackages = false;
    }
  }
  return globs;
}

/** Expands workspace globs of the forms `dir` and `dir/*` into package directories. */
function expandGlobs(root: string, globs: readonly string[]): string[] {
  const dirs = new Set<string>();
  for (const glob of globs) {
    if (glob.endsWith('/*')) {
      const parent = join(root, glob.slice(0, -2));
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(parent, entry.name, 'package.json'))) {
          dirs.add(toPosix(relative(root, join(parent, entry.name))));
        }
      }
    } else if (existsSync(join(root, glob, 'package.json'))) {
      dirs.add(toPosix(glob));
    }
  }
  return [...dirs].sort();
}

function loadPackages(root: string): WorkspacePackage[] {
  const globs = parseWorkspaceGlobs(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'));
  return expandGlobs(root, globs).map((dir) => {
    const json = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const dependencies = [
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.devDependencies ?? {}),
      ...Object.keys(json.peerDependencies ?? {}),
    ];
    return { name: json.name ?? dir, dir, dependencies };
  });
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-types', 'out', 'vendor', '.turbo']);

function collectSources(root: string, start: string, out: SourceFile[]): void {
  const absolute = join(root, start);
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = start === '' ? entry.name : `${start}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectSources(root, path, out);
    } else if (entry.isFile() && isVersionCheckedPath(path)) {
      out.push({ path, content: readFileSync(join(root, path), 'utf8') });
    }
  }
}

/** Runs both checks against a repository root. */
export function run(root: string): Violation[] {
  const layers = JSON.parse(
    readFileSync(join(root, 'tools', 'check-deps', 'layers.json'), 'utf8'),
  ) as LayerMap;
  const sources: SourceFile[] = [];
  collectSources(root, 'packages', sources);
  collectSources(root, 'app/src', sources);
  return [...checkLayers(loadPackages(root), layers), ...findVersionFacts(sources)];
}

function main(): void {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const violations = run(root);
  if (violations.length > 0) {
    console.error(`check-deps: ${violations.length} violation(s)`);
    for (const violation of violations) console.error(`  [${violation.kind}] ${violation.message}`);
    process.exit(1);
  }
  console.log('check-deps: dependency direction and version facts OK');
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main();
}
