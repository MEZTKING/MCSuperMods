/**
 * Vendors vanilla's placed feature order per decoration step for one target (ADR 0097 D1).
 *
 * Usage:
 *   node tools/sync-feature-order/index.ts --version <mc-version> --out <file>
 *
 * Downloads the vanilla biomes (`data/worldgen/biome/data.min.json`) and biome tags
 * (`data/tag/worldgen/biome/data.min.json`) from misode/mcmeta's `<version>-summary` tag
 * (raw.githubusercontent.com, falling back to jsDelivr), sorts every placed feature the biomes
 * list into one order per decoration step and writes only those ids, with the source, into
 * `<file>` (sorted keys, 2-space indent, atomically). No vanilla file is written.
 *
 * The order: biomes are read dimension by dimension in the order of the `is_overworld`,
 * `is_nether` and `is_end` biome tags (the order the dimensions' biome sources list them), then
 * any biome in none of them, by id. Each (step, feature) pair is numbered by first appearance;
 * the consecutive features of each biome's flattened list are edges; a depth-first walk from
 * every node in (step, number) order, visiting successors in the same order, gives the
 * post-order, which reversed is the order. This reproduces the reference pack's measured 26.3
 * order (`docs/reference/vanilla-worldgen/tools/feature_indices.txt`; see the test).
 *
 * Everything downloaded is untrusted data: it is parsed, validated and reduced to ids, never
 * executed.
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
/** The biome summary (every vanilla biome by id without namespace) in the summary tag. */
export const BIOMES_PATH = 'data/worldgen/biome/data.min.json';
/** The biome tag summary (every vanilla biome tag by id without namespace). */
export const BIOME_TAGS_PATH = 'data/tag/worldgen/biome/data.min.json';
/** The dimension biome tags, in the order their biomes are read. */
export const DIMENSION_TAGS = ['is_overworld', 'is_nether', 'is_end'] as const;
/** Vanilla has eleven decoration steps; a summary whose longest biome list is shorter is not one. */
export const MIN_STEP_COUNT = 11;
/** Biomes every summary must contain. */
export const REQUIRED_BIOMES = ['plains', 'nether_wastes', 'the_end'] as const;

/** The vendored file. */
export interface FeatureOrderFile {
  /** Per decoration step (by index, as in a biome's `features`), the placed feature ids. */
  steps: string[][];
  source: FeatureOrderSource;
}

export interface FeatureOrderSource {
  repository: string;
  ref: string;
  files: string[];
  /** How the biomes were ordered (the dimension tags, then the rest). */
  biomeOrder: string[];
  fetchedAt: string;
}

/** Downloads one file of a GitHub repository at a ref; injectable for tests. */
export type FetchFile = (
  repository: GitHubRepository,
  ref: string,
  path: string,
  log: (message: string) => void,
) => Promise<FetchedFile>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const plain = (id: string): string => id.replace(/^minecraft:/, '');

/** A biome's placed feature ids per step; tag and inline entries are refused. */
export function biomeFeatures(biome: unknown, name: string): string[][] {
  if (!isRecord(biome) || !Array.isArray(biome.features)) {
    throw new Error(`biome ${name}: expected an object with a "features" list`);
  }
  return biome.features.map((step, index) => {
    if (!Array.isArray(step)) throw new Error(`biome ${name}: step ${index} is not a list`);
    return step.map((entry) => {
      if (typeof entry !== 'string' || entry.startsWith('#')) {
        throw new Error(`biome ${name}: step ${index} has an entry that is not a feature id`);
      }
      return entry.includes(':') ? entry : `minecraft:${entry}`;
    });
  });
}

/** Returns problems with the biome summary; empty means valid. */
export function validateBiomes(value: unknown): string[] {
  if (!isRecord(value)) return ['biomes: expected a JSON object'];
  const problems: string[] = [];
  for (const name of REQUIRED_BIOMES) {
    if (!(name in value)) problems.push(`biomes: missing biome "${name}"`);
  }
  let longest = 0;
  for (const [name, biome] of Object.entries(value)) {
    try {
      // Biomes may leave trailing empty steps out (the Nether and End biomes do).
      longest = Math.max(longest, biomeFeatures(biome, name).length);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (longest < MIN_STEP_COUNT) {
    problems.push(
      `biomes: the longest feature list has ${longest} steps, expected ${MIN_STEP_COUNT}`,
    );
  }
  return problems;
}

/** The biome ids of tag `name` (without namespace), expanding nested tags, in order. */
export function tagBiomes(
  tags: Record<string, unknown>,
  name: string,
  seen = new Set<string>(),
): string[] {
  if (seen.has(name)) throw new Error(`biome tag ${name} includes itself`);
  const tag = tags[name];
  if (!isRecord(tag) || !Array.isArray(tag.values)) {
    throw new Error(`biome tag ${name}: expected an object with a "values" list`);
  }
  const out: string[] = [];
  for (const value of tag.values) {
    const id = typeof value === 'string' ? value : isRecord(value) ? value.id : undefined;
    if (typeof id !== 'string') throw new Error(`biome tag ${name}: an entry has no id`);
    if (id.startsWith('#'))
      out.push(...tagBiomes(tags, plain(id.slice(1)), new Set([...seen, name])));
    else out.push(plain(id));
  }
  return out;
}

/** The biome order: the dimension tags' biomes, then every other biome by id, no repeats. */
export function biomeOrder(
  biomes: Record<string, unknown>,
  tags: Record<string, unknown>,
): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const add = (name: string): void => {
    if (seen.has(name) || !(name in biomes)) return;
    seen.add(name);
    order.push(name);
  };
  for (const tag of DIMENSION_TAGS) for (const name of tagBiomes(tags, tag)) add(name);
  for (const name of Object.keys(biomes).sort()) add(name);
  return order;
}

/**
 * Sorts the placed features of `biomes` (each a list of steps, each a list of ids) into one
 * order per step, as described in the module comment. Throws on a cycle.
 */
export function sortFeatures(biomes: readonly (readonly (readonly string[])[])[]): string[][] {
  interface Node {
    step: number;
    number: number;
    id: string;
    next: Set<string>;
  }
  const numbers = new Map<string, number>();
  const nodes = new Map<string, Node>();
  let stepCount = 0;
  for (const steps of biomes) {
    stepCount = Math.max(stepCount, steps.length);
    const flat: string[] = [];
    steps.forEach((features, step) => {
      for (const id of features) {
        if (!numbers.has(id)) numbers.set(id, numbers.size);
        const key = `${step}\n${id}`;
        if (!nodes.has(key)) {
          nodes.set(key, { step, number: numbers.get(id) as number, id, next: new Set() });
        }
        flat.push(key);
      }
    });
    for (let index = 0; index + 1 < flat.length; index += 1) {
      (nodes.get(flat[index] as string) as Node).next.add(flat[index + 1] as string);
    }
  }
  const compare = (a: string, b: string): number => {
    const left = nodes.get(a) as Node;
    const right = nodes.get(b) as Node;
    return left.step - right.step || left.number - right.number;
  };
  const done = new Set<string>();
  const visiting = new Set<string>();
  const postOrder: string[] = [];
  const visit = (key: string): void => {
    if (done.has(key)) return;
    if (visiting.has(key)) {
      const node = nodes.get(key) as Node;
      throw new Error(`feature order cycle at ${node.id} in step ${node.step}`);
    }
    visiting.add(key);
    for (const next of [...(nodes.get(key) as Node).next].sort(compare)) visit(next);
    visiting.delete(key);
    done.add(key);
    postOrder.push(key);
  };
  for (const key of [...nodes.keys()].sort(compare)) visit(key);
  const steps: string[][] = Array.from({ length: stepCount }, () => []);
  for (const key of postOrder.reverse()) {
    const node = nodes.get(key) as Node;
    (steps[node.step] as string[]).push(node.id);
  }
  return steps;
}

export interface SyncFeatureOrderOptions {
  version: string;
  out: string;
  log?: (message: string) => void;
  /** Defaults to `fetchGitHubFile` (raw.githubusercontent.com, then jsDelivr). */
  fetchFile?: FetchFile;
}

export async function syncFeatureOrder(
  options: SyncFeatureOrderOptions,
): Promise<FeatureOrderFile> {
  const log = options.log ?? (() => {});
  if (!/^[0-9]+(\.[0-9]+)*(-(snapshot|pre|rc)-[0-9]+)?$/.test(options.version)) {
    throw new Error(
      `--version must look like 26.3, 26.3.1 or 26.4-snapshot-7, got ${options.version}`,
    );
  }
  const ref = `${options.version}-summary`;
  const fetchFile = options.fetchFile ?? fetchGitHubFile;
  log(`downloading ${BIOMES_PATH} from ${ref}`);
  const biomes = parseJsonStrict(
    (await fetchFile(REPOSITORY, ref, BIOMES_PATH, log)).text,
    'biomes',
  );
  log(`downloading ${BIOME_TAGS_PATH} from ${ref}`);
  const tags = parseJsonStrict(
    (await fetchFile(REPOSITORY, ref, BIOME_TAGS_PATH, log)).text,
    'biome tags',
  );
  const problems = validateBiomes(biomes);
  if (!isRecord(tags)) problems.push('biome tags: expected a JSON object');
  if (problems.length > 0) throw new Error(`invalid mcmeta data:\n  ${problems.join('\n  ')}`);
  const biomeMap = biomes as Record<string, unknown>;
  const order = biomeOrder(biomeMap, tags as Record<string, unknown>);
  const steps = sortFeatures(order.map((name) => biomeFeatures(biomeMap[name], name)));
  const file: FeatureOrderFile = {
    steps,
    source: {
      repository: REPOSITORY_URL,
      ref,
      files: [BIOMES_PATH, BIOME_TAGS_PATH],
      biomeOrder: [...DIMENSION_TAGS.map((tag) => `#minecraft:${tag}`), 'the other biomes by id'],
      fetchedAt: nowIso(),
    },
  };
  await writeFileAtomic(options.out, stringifySorted(file));
  return file;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { version: { type: 'string' }, out: { type: 'string' } },
    strict: true,
  });
  if (values.version === undefined || values.out === undefined) {
    throw new Error(
      'usage: node tools/sync-feature-order/index.ts --version <mc-version> --out <file>',
    );
  }
  const out = resolve(values.out);
  const file = await syncFeatureOrder({
    version: values.version,
    out,
    log: (message) => console.log(`sync-feature-order: ${message}`),
  });
  const count = file.steps.reduce((total, step) => total + step.length, 0);
  console.log(
    `sync-feature-order: wrote ${out} (${count} placed features, ref ${file.source.ref})`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`sync-feature-order: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
