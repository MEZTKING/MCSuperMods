/**
 * Vendors misode/mcmeta summary data for one target.
 *
 * Usage:
 *   node tools/sync-mcmeta/index.ts --version <mc-version> --out <dir>
 *
 * Downloads `version.json` and `registries/data.min.json` from the tag
 * `<version>-summary` (raw.githubusercontent.com, falling back to jsDelivr),
 * validates them and writes `version.json`, `registries.json` and
 * `SOURCE.json` into `<dir>` with sorted keys and 2-space indent, atomically.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
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

export interface McmetaSource {
  repository: string;
  refs: { summary: string; registries: string };
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

export interface SyncMcmetaOptions {
  version: string;
  out: string;
  log?: (message: string) => void;
}

export async function syncMcmeta(options: SyncMcmetaOptions): Promise<McmetaSource> {
  const log = options.log ?? (() => {});
  if (!/^[0-9]+(\.[0-9]+)*$/.test(options.version)) {
    throw new Error(`--version must look like 26.3 or 26.3.1, got ${options.version}`);
  }
  const refs = mcmetaRefs(options.version);

  log(`downloading version.json from ${refs.summary}`);
  const versionText = (await fetchGitHubFile(REPOSITORY, refs.summary, 'version.json', log)).text;
  log(`downloading registries/data.min.json from ${refs.summary}`);
  const registriesText = (
    await fetchGitHubFile(REPOSITORY, refs.summary, 'registries/data.min.json', log)
  ).text;

  const version = parseJsonStrict(versionText, 'version.json');
  const registries = parseJsonStrict(registriesText, 'registries.json');
  const problems = [
    ...validateVersion(version, options.version),
    ...validateRegistries(registries),
  ];
  if (problems.length > 0) throw new Error(`invalid mcmeta data:\n  ${problems.join('\n  ')}`);

  const source: McmetaSource = { repository: REPOSITORY_URL, refs, fetchedAt: nowIso() };
  await writeFileAtomic(resolve(options.out, 'version.json'), stringifySorted(version));
  await writeFileAtomic(resolve(options.out, 'registries.json'), stringifySorted(registries));
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
