import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BIOME_TAGS_PATH,
  BIOMES_PATH,
  biomeOrder,
  type FeatureOrderFile,
  type FetchFile,
  REPOSITORY,
  sortFeatures,
  syncFeatureOrder,
  tagBiomes,
  validateBiomes,
} from './index.ts';

const REPOSITORY_ROOT = join(import.meta.dirname, '..', '..');

/** `steps` padded to eleven steps, as vanilla's overworld biomes list them. */
const biome = (steps: Record<number, string[]>): { features: string[][] } => ({
  features: Array.from({ length: 11 }, (_, index) => steps[index] ?? []),
});

function upstream(): Record<string, unknown> {
  return {
    [BIOMES_PATH]: {
      plains: biome({ 6: ['minecraft:ore_a', 'minecraft:ore_b'], 9: ['minecraft:flower'] }),
      forest: biome({ 6: ['minecraft:ore_b', 'minecraft:ore_c'], 9: ['minecraft:tree'] }),
      nether_wastes: { features: [[], [], [], [], [], [], [], ['minecraft:fire']] },
      the_end: { features: [] },
    },
    [BIOME_TAGS_PATH]: {
      is_overworld: { values: ['minecraft:plains', 'minecraft:forest'] },
      is_nether: { values: ['minecraft:nether_wastes'] },
      is_end: { values: [{ id: 'minecraft:the_end', required: true }] },
    },
  };
}

function fakeFetch(files: Record<string, unknown>, requests: string[]): FetchFile {
  return async (repository, ref, path) => {
    requests.push(`${repository}@${ref}/${path}`);
    if (!(path in files)) throw new Error(`unexpected path ${path}`);
    return { text: JSON.stringify(files[path]), url: `mock://${path}` };
  };
}

describe('sortFeatures', () => {
  it('keeps each biome list as a subsequence of its step', () => {
    const steps = sortFeatures([[['a', 'b', 'd']], [['b', 'c', 'd']]]);
    expect(steps).toEqual([['a', 'b', 'c', 'd']]);
  });

  it('breaks ties through the reversed walk and keeps steps apart', () => {
    // `x` and `y` are never ordered against each other. The walk starts at `x` (numbered
    // first) and reaches `shared` from it; reversing the post-order puts the later root first.
    const steps = sortFeatures([
      [['x'], ['shared']],
      [['y'], ['shared']],
    ]);
    expect(steps[0]).toEqual(['y', 'x']);
    // The same feature in two steps is two entries, one per step.
    expect(sortFeatures([[['f'], ['f']]])).toEqual([['f'], ['f']]);
  });

  it('refuses a cycle', () => {
    expect(() => sortFeatures([[['a', 'b']], [['b', 'a']]])).toThrow(/cycle/);
    expect(() => sortFeatures([[['a', 'a']]])).toThrow(/cycle/);
  });
});

describe('biome order', () => {
  it('reads the dimension tags in order, then the other biomes by id', () => {
    const files = upstream();
    const biomes = files[BIOMES_PATH] as Record<string, unknown>;
    const tags = files[BIOME_TAGS_PATH] as Record<string, unknown>;
    expect(biomeOrder({ ...biomes, the_void: biome({}) }, tags)).toEqual([
      'plains',
      'forest',
      'nether_wastes',
      'the_end',
      'the_void',
    ]);
  });

  it('expands nested tags', () => {
    const tags = {
      outer: { values: ['minecraft:a', '#minecraft:inner'] },
      inner: { values: ['b'] },
      loop: { values: ['#loop'] },
    };
    expect(tagBiomes(tags, 'outer')).toEqual(['a', 'b']);
    expect(() => tagBiomes(tags, 'loop')).toThrow(/includes itself/);
  });
});

describe('validateBiomes', () => {
  it('accepts short Nether and End lists but wants eleven steps somewhere', () => {
    expect(validateBiomes(upstream()[BIOMES_PATH])).toEqual([]);
    expect(validateBiomes({ plains: { features: [[]] } }).join('\n')).toMatch(/expected 11/);
    expect(
      validateBiomes({ ...(upstream()[BIOMES_PATH] as object), bad: { features: [['#t']] } }),
    ).toEqual(['biome bad: step 0 has an entry that is not a feature id']);
  });
});

describe('syncFeatureOrder', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('writes the ids per step and the source, from the summary tag', async () => {
    dir = await mkdtemp(join(tmpdir(), 'sync-feature-order-'));
    const out = join(dir, 'feature-order.json');
    const requests: string[] = [];
    await syncFeatureOrder({ version: '1.0', out, fetchFile: fakeFetch(upstream(), requests) });
    expect(requests).toEqual([
      `${REPOSITORY}@1.0-summary/${BIOMES_PATH}`,
      `${REPOSITORY}@1.0-summary/${BIOME_TAGS_PATH}`,
    ]);
    const written = JSON.parse(await readFile(out, 'utf8')) as FeatureOrderFile;
    expect(written.steps[6]).toEqual(['minecraft:ore_a', 'minecraft:ore_b', 'minecraft:ore_c']);
    expect(written.steps[7]).toEqual(['minecraft:fire']);
    expect(written.steps[9]).toEqual(['minecraft:flower', 'minecraft:tree']);
    expect(written.steps).toHaveLength(11);
    expect(written.source.ref).toBe('1.0-summary');
    expect(written.source.files).toEqual([BIOMES_PATH, BIOME_TAGS_PATH]);
  });

  it('refuses a bad version and bad data', async () => {
    dir = await mkdtemp(join(tmpdir(), 'sync-feature-order-'));
    const out = join(dir, 'feature-order.json');
    await expect(syncFeatureOrder({ version: 'latest', out })).rejects.toThrow(/--version/);
    const files = { ...upstream(), [BIOMES_PATH]: [] };
    await expect(
      syncFeatureOrder({ version: '1.0', out, fetchFile: fakeFetch(files, []) }),
    ).rejects.toThrow(/invalid mcmeta data/);
  });
});

describe('the vendored order against the reference pack', () => {
  /** `feature_indices.txt`: `step<n>`, index and id per line (CRLF line ends). */
  async function referenceOrder(): Promise<Map<number, string[]>> {
    const text = await readFile(
      join(REPOSITORY_ROOT, 'docs/reference/vanilla-worldgen/tools/feature_indices.txt'),
      'utf8',
    );
    const steps = new Map<number, string[]>();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === '') continue;
      const [step, index, id] = line.split('\t') as [string, string, string];
      const list = steps.get(Number(step.slice(4))) ?? [];
      list[Number(index)] = id;
      steps.set(Number(step.slice(4)), list);
    }
    return steps;
  }

  it('reproduces the measured overworld order of feature_indices.txt for the first target', async () => {
    const reference = await referenceOrder();
    expect([...reference.values()].reduce((total, list) => total + list.length, 0)).toBe(171);
    const vendored = JSON.parse(
      await readFile(
        join(REPOSITORY_ROOT, 'packages/targets/mc-26.3/vendor/worldgen/feature-order.json'),
        'utf8',
      ),
    ) as FeatureOrderFile;
    for (const [step, expected] of reference) {
      // The vendored order also holds the Nether's and the End's features; restricted to the
      // overworld's it is the measured order, index for index.
      const overworld = new Set(expected);
      const actual = (vendored.steps[step] ?? []).filter((id) => overworld.has(id));
      expect(actual, `step ${step}`).toEqual(expected);
    }
  });
});
