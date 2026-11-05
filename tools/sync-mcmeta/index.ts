/**
 * Vendors misode/mcmeta summary data for one target.
 *
 * Usage:
 *   node tools/sync-mcmeta/index.ts --version <mc-version> --out <dir>
 *
 * Downloads `version.json`, `registries/data.min.json`, `commands/data.min.json`
 * and `blocks/data.min.json` from the tag `<version>-summary`
 * (raw.githubusercontent.com, falling back to jsDelivr), validates them and
 * writes `version.json`, `registries.json`, `commands.json`, `blocks.json` and
 * `SOURCE.json` into `<dir>` with sorted keys and 2-space indent, atomically.
 *
 * Everything downloaded is untrusted data: it is parsed, validated and
 * written, never executed.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  type FetchedFile,
  fetchGitHubFile,
  type GitHubRepository,
  nowIso,
  parseJsonStrict,
  stringifySorted,
  writeFileAtomic,
} from '../shared/download.ts';

export const REPOSITORY: GitHubRepository = 'misode/mcmeta';
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
export const MIN_REGISTRY_COUNT = 100;
export const REQUIRED_REGISTRIES = ['item', 'block', 'recipe_serializer'] as const;

/** Commands every vendored command tree must contain (sanity check, not a full schema). */
export const REQUIRED_COMMANDS = ['execute', 'function', 'give'] as const;
export const MIN_COMMAND_COUNT = 50;
/** Blocks every vendored block-state summary must contain. */
export const REQUIRED_BLOCKS = ['stone', 'oak_stairs'] as const;
export const MIN_BLOCK_COUNT = 500;

/** One vendored file: its name in the output folder and its path in the summary tag. */
export interface McmetaFile {
  /** File name written into the output folder, e.g. `commands.json`. */
  name: string;
  /** Path inside the `<version>-summary` tag, e.g. `commands/data.min.json`. */
  path: string;
}

/** Every file vendored from the summary tag, in write order (sorted by `name`). */
export const MCMETA_FILES: readonly McmetaFile[] = Object.freeze([
  { name: 'blocks.json', path: 'blocks/data.min.json' },
  { name: 'commands.json', path: 'commands/data.min.json' },
  { name: 'registries.json', path: 'registries/data.min.json' },
  { name: 'version.json', path: 'version.json' },
]);

export interface McmetaSource {
  repository: string;
  refs: { summary: string; registries: string };
  /** Every vendored file with the upstream path it came from (within `refs.summary`). */
  files: McmetaFile[];
  fetchedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Tag names for a game version, e.g. `26.3-summary` and `26.3-registries`. */
export function mcmetaRefs(version: string): McmetaSource['refs'] {
  return { summary: `${version}-summary`, registries: `${version}-registries` };
}

/** Returns problems with `version.json`; empty means valid. */
export function validateVersion(value: unknown, version: string): string[] {
  if (!isRecord(value)) return ['version.json: expected a JSON object'];
  if (value.id !== version) {
    return [`version.json: id is ${JSON.stringify(value.id)}, expected ${JSON.stringify(version)}`];
  }
  return [];
}

/** Returns problems with the registries summary; empty means valid. */
export function validateRegistries(value: unknown): string[] {
  if (!isRecord(value)) return ['registries.json: expected a JSON object'];
  const problems: string[] = [];
  const count = Object.keys(value).length;
  if (count < MIN_REGISTRY_COUNT) {
    problems.push(`registries.json: ${count} registries, expected at least ${MIN_REGISTRY_COUNT}`);
  }
  for (const name of REQUIRED_REGISTRIES) {
    if (!(name in value)) problems.push(`registries.json: missing registry "${name}"`);
  }
  return problems;
}

/** Returns problems with the command tree (`commands/data.min.json`); empty means valid. */
export function validateCommands(value: unknown): string[] {
  if (!isRecord(value)) return ['commands.json: expected a JSON object'];
  if (value.type !== 'root') {
    return [`commands.json: type is ${JSON.stringify(value.type)}, expected "root"`];
  }
  const children = value.children;
  if (!isRecord(children)) return ['commands.json: expected a "children" object'];
  const problems: string[] = [];
  const count = Object.keys(children).length;
  if (count < MIN_COMMAND_COUNT) {
    problems.push(`commands.json: ${count} commands, expected at least ${MIN_COMMAND_COUNT}`);
  }
  for (const name of REQUIRED_COMMANDS) {
    if (!(name in children)) problems.push(`commands.json: missing command "${name}"`);
  }
  return problems;
}

/** Returns problems with the block-state summary (`blocks/data.min.json`); empty means valid. */
export function validateBlocks(value: unknown): string[] {
  if (!isRecord(value)) return ['blocks.json: expected a JSON object'];
  const problems: string[] = [];
  const count = Object.keys(value).length;
  if (count < MIN_BLOCK_COUNT) {
    problems.push(`blocks.json: ${count} blocks, expected at least ${MIN_BLOCK_COUNT}`);
  }
  for (const name of REQUIRED_BLOCKS) {
    const entry = value[name];
    if (entry === undefined) problems.push(`blocks.json: missing block "${name}"`);
    else if (!Array.isArray(entry) || entry.length !== 2) {
      problems.push(`blocks.json: block "${name}" is not a [properties, defaults] pair`);
    }
  }
  return problems;
}

/** Downloads one file of a GitHub repository at a ref; injectable for tests. */
export type FetchFile = (
  repository: GitHubRepository,
  ref: string,
  path: string,
  log: (message: string) => void,
) => Promise<FetchedFile>;

export interface SyncMcmetaOptions {
  version: string;
  out: string;
  log?: (message: string) => void;
  /** Defaults to `fetchGitHubFile` (raw.githubusercontent.com, then jsDelivr). */
  fetchFile?: FetchFile;
}

export async function syncMcmeta(options: SyncMcmetaOptions): Promise<McmetaSource> {
  const log = options.log ?? (() => {});
  // Releases (26.3, 26.3.1) and development versions (26.4-snapshot-7, 26.4-pre-1, 26.4-rc-1).
  if (!/^[0-9]+(\.[0-9]+)*(-(snapshot|pre|rc)-[0-9]+)?$/.test(options.version)) {
    throw new Error(
      `--version must look like 26.3, 26.3.1 or 26.4-snapshot-7, got ${options.version}`,
    );
  }
  const refs = mcmetaRefs(options.version);
  const fetchFile = options.fetchFile ?? fetchGitHubFile;

  const parsed = new Map<string, unknown>();
  for (const file of MCMETA_FILES) {
    log(`downloading ${file.path} from ${refs.summary}`);
    const text = (await fetchFile(REPOSITORY, refs.summary, file.path, log)).text;
    parsed.set(file.name, parseJsonStrict(text, file.name));
  }

  const problems = [
    ...validateVersion(parsed.get('version.json'), options.version),
    ...validateRegistries(parsed.get('registries.json')),
    ...validateCommands(parsed.get('commands.json')),
    ...validateBlocks(parsed.get('blocks.json')),
  ];
  if (problems.length > 0) throw new Error(`invalid mcmeta data:\n  ${problems.join('\n  ')}`);

  const source: McmetaSource = {
    repository: REPOSITORY_URL,
    refs,
    files: MCMETA_FILES.map((file) => ({ ...file })),
    fetchedAt: nowIso(),
  };
  for (const file of MCMETA_FILES) {
    await writeFileAtomic(resolve(options.out, file.name), stringifySorted(parsed.get(file.name)));
  }
  await writeFileAtomic(resolve(options.out, 'SOURCE.json'), stringifySorted(source));
  return source;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { version: { type: 'string' }, out: { type: 'string' } },
    strict: true,
  });
  if (values.version === undefined || values.out === undefined) {
    throw new Error('usage: node tools/sync-mcmeta/index.ts --version <mc-version> --out <dir>');
  }
  const out = resolve(values.out);
  const source = await syncMcmeta({
    version: values.version,
    out,
    log: (message) => console.log(`sync-mcmeta: ${message}`),
  });
  console.log(`sync-mcmeta: wrote ${out} (ref ${source.refs.summary})`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`sync-mcmeta: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
