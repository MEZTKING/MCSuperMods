/**
 * Size budgets for the desktop app.
 *
 * Run with `node tools/check-size/index.ts [--root <repo-root>]` after `pnpm build` and
 * `pnpm --filter @msm/app dist:dir`. Only erasable TypeScript syntax and `node:` imports are
 * allowed here (Node >= 22.18 strips types).
 *
 * Enforced (thresholds in {@link BUDGETS}, rationale in README.md):
 *
 * 1. `app.asar` in the unpacked build is at most 25 MB.
 * 2. The renderer output (`app/out/renderer`) is at most 8 MB in total.
 * 3. No `*.json` file in the renderer output is larger than 100 kB (vendored data belongs in
 *    main, not in the renderer bundle).
 *
 * Reported only: the largest renderer chunks and the unpacked app total (dominated by the
 * Electron binary, which MSM does not control). The 150 MB installer budget is checked on the
 * Windows installer in `.github/workflows/release.yml`.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MB = 1024 * 1024;
const KB = 1024;

/** Size thresholds in bytes. */
export const BUDGETS = {
  asarBytes: 25 * MB,
  rendererBytes: 8 * MB,
  rendererJsonBytes: 100 * KB,
} as const;

export type Budgets = { [K in keyof typeof BUDGETS]: number };

/** A file and its size; `path` is relative to the folder it was listed from, POSIX separators. */
export interface FileSize {
  path: string;
  bytes: number;
}

/** What the check measures. `null` means the file or folder does not exist. */
export interface Measurements {
  asarBytes: number | null;
  rendererFiles: FileSize[] | null;
  unpackedBytes: number | null;
}

export interface Summary {
  totalBytes: number;
  /** The largest files, biggest first (ties by path). */
  largest: FileSize[];
}

/** Lists every file under `dir` with its size, sorted by path. */
export function listFiles(dir: string): FileSize[] {
  const files: FileSize[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files.push({ path: relative(dir, full).split(sep).join('/'), bytes: statSync(full).size });
      }
    }
  };
  walk(dir);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Totals `files` and picks the `top` largest. */
export function summarise(files: readonly FileSize[], top = 8): Summary {
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const largest = [...files]
    .sort((a, b) => b.bytes - a.bytes || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, top);
  return { totalBytes, largest };
}

/** Formats a byte count as `12.3 MB`, `45.6 kB` or `789 B` (binary units). */
export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} kB`;
  return `${bytes} B`;
}

/** Returns one message per broken budget or missing input; empty when everything passes. */
export function checkBudgets(measured: Measurements, budgets: Budgets = BUDGETS): string[] {
  const violations: string[] = [];
  if (measured.asarBytes === null) {
    violations.push('app.asar not found: run `pnpm --filter @msm/app dist:dir` first.');
  } else if (measured.asarBytes > budgets.asarBytes) {
    violations.push(
      `app.asar is ${formatBytes(measured.asarBytes)}, over the ${formatBytes(budgets.asarBytes)} budget.`,
    );
  }
  if (measured.rendererFiles === null) {
    violations.push('app/out/renderer not found: run `pnpm build` first.');
  } else {
    const total = summarise(measured.rendererFiles, 0).totalBytes;
    if (total > budgets.rendererBytes) {
      violations.push(
        `Renderer output is ${formatBytes(total)}, over the ${formatBytes(budgets.rendererBytes)} budget.`,
      );
    }
    for (const file of measured.rendererFiles) {
      if (file.path.endsWith('.json') && file.bytes > budgets.rendererJsonBytes) {
        violations.push(
          `Renderer JSON ${file.path} is ${formatBytes(file.bytes)}, over the ${formatBytes(budgets.rendererJsonBytes)} per-file budget.`,
        );
      }
    }
  }
  return violations;
}

/** The unpacked electron-builder folder for the current platform, if it exists. */
function unpackedDir(appDir: string): string | null {
  const candidates = ['linux-unpacked', 'win-unpacked', 'mac/MCSuperMods.app'];
  for (const candidate of candidates) {
    const dir = join(appDir, 'dist', candidate);
    if (existsSync(dir)) return dir;
  }
  return null;
}

/** Measures the built app under `root` (the repository root). */
export function measure(root: string): Measurements {
  const appDir = join(root, 'app');
  const rendererDir = join(appDir, 'out', 'renderer');
  const unpacked = unpackedDir(appDir);
  let asarBytes: number | null = null;
  let unpackedBytes: number | null = null;
  if (unpacked !== null) {
    const asar = unpacked.endsWith('.app')
      ? join(unpacked, 'Contents', 'Resources', 'app.asar')
      : join(unpacked, 'resources', 'app.asar');
    if (existsSync(asar)) asarBytes = statSync(asar).size;
    unpackedBytes = summarise(listFiles(unpacked), 0).totalBytes;
  }
  return {
    asarBytes,
    rendererFiles: existsSync(rendererDir) ? listFiles(rendererDir) : null,
    unpackedBytes,
  };
}

/** The human-readable report printed before the verdict. */
export function report(measured: Measurements, budgets: Budgets = BUDGETS): string[] {
  const lines: string[] = [];
  if (measured.rendererFiles !== null) {
    const summary = summarise(measured.rendererFiles);
    lines.push(
      `Renderer output: ${formatBytes(summary.totalBytes)} (budget ${formatBytes(budgets.rendererBytes)}), largest files:`,
    );
    for (const file of summary.largest) {
      lines.push(`  ${formatBytes(file.bytes).padStart(9)}  ${file.path}`);
    }
  }
  if (measured.asarBytes !== null) {
    lines.push(
      `app.asar: ${formatBytes(measured.asarBytes)} (budget ${formatBytes(budgets.asarBytes)})`,
    );
  }
  if (measured.unpackedBytes !== null) {
    lines.push(
      `Unpacked app: ${formatBytes(measured.unpackedBytes)} (reported only; mostly the Electron binary)`,
    );
  }
  return lines;
}

function main(): void {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--root');
  const root =
    rootIndex >= 0 && args[rootIndex + 1] !== undefined
      ? resolve(args[rootIndex + 1] as string)
      : resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const measured = measure(root);
  for (const line of report(measured)) console.log(line);
  const violations = checkBudgets(measured);
  if (violations.length > 0) {
    console.error(`check-size: ${violations.length} violation(s)`);
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  console.log('check-size: within budget');
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main();
}
