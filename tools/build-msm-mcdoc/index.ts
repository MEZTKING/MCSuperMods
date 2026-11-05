/**
 * Exports MSM's own mcdoc types (`packages/schemas/mcdoc/msm/*.mcdoc`) to the checked-in
 * `packages/schemas/mcdoc/msm/symbols.json` (ADR 0025 D7).
 *
 * Usage:
 *   node tools/build-msm-mcdoc/index.ts [--check]
 *
 * Copies the `.mcdoc` files into a temporary project, runs `@spyglassmc/mcdoc-cli export`
 * over it (as `tools/sync-mcdoc` does for vanilla-mcdoc), checks that every reference and
 * dispatcher resolves inside the export, stamps a `ref` derived from the sources and writes
 * the result with sorted keys, formatted by Biome. `--check` writes nothing and fails when the
 * checked-in export differs from a fresh one.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs, promisify } from 'node:util';
import { parseJsonStrict, stringifySorted, writeFileAtomic } from '../shared/download.ts';

const run = promisify(execFile);

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The MSM mcdoc module folder; its name is the first module path segment (`::msm`). */
export const SOURCE_DIR = join(REPO_ROOT, 'packages', 'schemas', 'mcdoc', 'msm');
export const OUTPUT_FILE = join(SOURCE_DIR, 'symbols.json');
/** Prefix of the export's `ref`: a SHA-256 over the source file names and contents. */
export const REF_PREFIX = 'msm-mcdoc:sha256:';
/** Every MSM type path starts with this. */
export const MSM_PATH_PREFIX = '::msm';

/** Shape of the mcdoc-cli export with the `ref` this script adds. */
export interface MsmSymbols {
  ref: string;
  mcdoc: Record<string, unknown>;
  'mcdoc/dispatcher': Record<string, Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `.mcdoc` files directly in `dir`, sorted by name. */
export async function listSources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mcdoc'))
    .map((entry) => entry.name)
    .sort();
}

/** `msm-mcdoc:sha256:<hex>` over each file's name and contents, in name order. */
export function sourceRef(files: readonly { name: string; text: string }[]): string {
  const hash = createHash('sha256');
  for (const { name, text } of [...files].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    hash.update(`${name}\u0000${text.replaceAll('\r\n', '\n')}\u0000`);
  }
  return `${REF_PREFIX}${hash.digest('hex')}`;
}

/**
 * Vanilla dispatchers MSM types may index without defining members (ADR 0044 D1): they
 * resolve against the target's vanilla symbols when `createSchemaIndex` merges the export.
 */
export const VANILLA_DISPATCHER_PREFIX = 'minecraft:';

/**
 * Problems that mcdoc-cli does not report: a type path or dispatcher outside `::msm` /
 * `msm:`, a reference to a path the export lacks, a dispatcher spread over an unknown
 * registry (a `minecraft:` registry counts as known: it is vanilla's). Empty means valid.
 */
export function checkSymbols(symbols: MsmSymbols): string[] {
  const problems: string[] = [];
  const paths = new Set(Object.keys(symbols.mcdoc));
  const registries = new Set(Object.keys(symbols['mcdoc/dispatcher']));
  if (paths.size === 0) problems.push('the export has no types');
  for (const path of paths) {
    if (!path.startsWith(`${MSM_PATH_PREFIX}::`)) problems.push(`${path}: not under ::msm`);
  }
  for (const registry of registries) {
    if (!registry.startsWith('msm:')) problems.push(`dispatcher ${registry}: not under msm:`);
  }
  const visit = (value: unknown, where: string): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, where);
      return;
    }
    if (!isRecord(value)) return;
    if (value.kind === 'reference' && typeof value.path === 'string' && !paths.has(value.path)) {
      problems.push(`${where}: reference to unknown type ${value.path}`);
    }
    if (
      value.kind === 'dispatcher' &&
      typeof value.registry === 'string' &&
      !registries.has(value.registry) &&
      !value.registry.startsWith(VANILLA_DISPATCHER_PREFIX)
    ) {
      problems.push(`${where}: dispatcher over unknown registry ${value.registry}`);
    }
    for (const entry of Object.values(value)) visit(entry, where);
  };
  for (const [path, type] of Object.entries(symbols.mcdoc)) visit(type, path);
  for (const [registry, members] of Object.entries(symbols['mcdoc/dispatcher'])) {
    for (const [key, type] of Object.entries(members)) visit(type, `${registry}[${key}]`);
  }
  return problems;
}

/**
 * The dispatcher map without the empty `minecraft:` entries mcdoc-cli adds for each vanilla
 * dispatcher an MSM type only indexes (such as `minecraft:data_component[[%key]]`); an entry
 * with members stays, so `checkSymbols` still refuses MSM members in a vanilla dispatcher.
 */
export function withoutUsedVanillaDispatchers(
  dispatchers: MsmSymbols['mcdoc/dispatcher'],
): MsmSymbols['mcdoc/dispatcher'] {
  return Object.fromEntries(
    Object.entries(dispatchers).filter(
      ([registry, members]) =>
        !registry.startsWith(VANILLA_DISPATCHER_PREFIX) || Object.keys(members).length > 0,
    ),
  );
}

async function locateMcdocCli(): Promise<string> {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('@spyglassmc/mcdoc-cli/package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    bin: Record<string, string>;
  };
  const bin = manifest.bin.mcdoc;
  if (bin === undefined) throw new Error('@spyglassmc/mcdoc-cli has no "mcdoc" bin');
  return join(dirname(manifestPath), bin);
}

/**
 * Runs mcdoc-cli over a temporary copy of `sourceDir` and returns the checked export.
 *
 * The copy holds only the `.mcdoc` files, under a folder named like `sourceDir` (the module
 * path's first segment), plus a `spyglass.json` that lists the copy as a directory dependency:
 * mcdoc-cli 0.1.63 lists no project-root files without a file watcher (see `tools/sync-mcdoc`).
 */
export async function exportMsmMcdoc(sourceDir: string = SOURCE_DIR): Promise<MsmSymbols> {
  const names = await listSources(sourceDir);
  if (names.length === 0) throw new Error(`no .mcdoc files in ${sourceDir}`);
  const files = await Promise.all(
    names.map(async (name) => ({ name, text: await readFile(join(sourceDir, name), 'utf8') })),
  );
  const cli = await locateMcdocCli();
  const work = await mkdtemp(join(tmpdir(), 'msm-build-msm-mcdoc-'));
  try {
    const root = join(work, 'src');
    const moduleDir = join(root, resolve(sourceDir).split(/[\\/]/).pop() ?? 'msm');
    await mkdir(moduleDir, { recursive: true });
    for (const { name, text } of files) await writeFile(join(moduleDir, name), text);
    let rootUrl = pathToFileURL(root).toString();
    if (!rootUrl.endsWith('/')) rootUrl += '/';
    await writeFile(
      join(root, 'spyglass.json'),
      `${JSON.stringify({ env: { dependencies: [rootUrl] } })}\n`,
    );
    const output = join(work, 'symbols.json');
    // mcdoc-cli writes its cache to `<cwd>/.cache`, so cwd is the temporary directory.
    await run(process.execPath, [cli, 'export', output, '--source', root], {
      cwd: work,
      maxBuffer: 16 * 1024 * 1024,
    });
    const parsed = parseJsonStrict(await readFile(output, 'utf8'), 'symbols.json');
    if (!isRecord(parsed) || !isRecord(parsed.mcdoc) || !isRecord(parsed['mcdoc/dispatcher'])) {
      throw new Error('mcdoc-cli export: expected { mcdoc, "mcdoc/dispatcher" }');
    }
    const symbols: MsmSymbols = {
      ref: sourceRef(files),
      mcdoc: parsed.mcdoc,
      'mcdoc/dispatcher': withoutUsedVanillaDispatchers(
        parsed['mcdoc/dispatcher'] as MsmSymbols['mcdoc/dispatcher'],
      ),
    };
    const problems = checkSymbols(symbols);
    if (problems.length > 0) throw new Error(`invalid MSM mcdoc:\n  ${problems.join('\n  ')}`);
    return symbols;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Sorted-key JSON, formatted by the repository's Biome configuration as if at `filePath`. */
export async function formatSymbols(symbols: MsmSymbols, filePath = OUTPUT_FILE): Promise<string> {
  const require = createRequire(join(REPO_ROOT, 'package.json'));
  const biome = join(dirname(require.resolve('@biomejs/biome/package.json')), 'bin', 'biome');
  return await new Promise<string>((resolvePromise, reject) => {
    const child = execFile(
      process.execPath,
      [biome, 'format', `--stdin-file-path=${relative(REPO_ROOT, filePath)}`],
      { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolvePromise(stdout);
      },
    );
    child.stdin?.end(stringifySorted(symbols));
  });
}

/** Reads the checked-in export; `undefined` when it is missing or not JSON. */
export async function readCheckedIn(file: string = OUTPUT_FILE): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Whether the checked-in export equals a fresh export of the sources (compared as JSON). */
export async function isUpToDate(
  sourceDir: string = SOURCE_DIR,
  file: string = OUTPUT_FILE,
): Promise<boolean> {
  const [fresh, current] = await Promise.all([exportMsmMcdoc(sourceDir), readCheckedIn(file)]);
  return isDeepStrictEqual(JSON.parse(JSON.stringify(fresh)), current);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { check: { type: 'boolean', default: false } },
    strict: true,
  });
  if (values.check === true) {
    if (!(await isUpToDate())) {
      throw new Error(`${relative(REPO_ROOT, OUTPUT_FILE)} is stale; run without --check`);
    }
    console.log('build-msm-mcdoc: symbols.json is up to date');
    return;
  }
  const symbols = await exportMsmMcdoc();
  await writeFileAtomic(OUTPUT_FILE, await formatSymbols(symbols));
  console.log(
    `build-msm-mcdoc: wrote ${relative(REPO_ROOT, OUTPUT_FILE)} (${Object.keys(symbols.mcdoc).length} types, ${symbols.ref})`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`build-msm-mcdoc: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
