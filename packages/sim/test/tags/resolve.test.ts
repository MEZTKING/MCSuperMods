/**
 * Tags as the game loads them (B600's 2S5, observed on both targets with MSM's own fixture in
 * `docs/reference/spikes/b600/spike-src/make_pack.py`; the answers are `results/server-*.json`
 * "tags"). Vanilla's tags here are small stand-ins: Mojang's files are never in the repository.
 */
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createTagResolver,
  filesLookup,
  layeredLookup,
  resolveTag,
  type SimFiles,
} from '../../src/index.js';
import { type FileTable, tableLookup } from '../predicates/helpers.js';

const tag = (values: Json[], replace?: boolean): Json =>
  replace === undefined ? { values } : { values, replace };

/** Stand-ins for vanilla's files (a few members each). */
const VANILLA: FileTable = {
  'tags/item': {
    'minecraft:logs': tag(['#minecraft:oak_logs', '#minecraft:birch_logs']),
    'minecraft:oak_logs': tag(['minecraft:oak_log', 'minecraft:oak_wood']),
    'minecraft:birch_logs': tag(['minecraft:birch_log', 'minecraft:birch_wood']),
    'minecraft:wool': tag(['minecraft:white_wool', 'minecraft:red_wool']),
  },
  'tags/enchantment': {
    'minecraft:curse': tag(['minecraft:binding_curse', 'minecraft:vanishing_curse']),
  },
};

/** The fixture's tags (make_pack.py, "tags"). */
const PROJECT: FileTable = {
  'tags/item': {
    'msm_b600:three': tag(['minecraft:stone', 'minecraft:dirt', 'minecraft:sand']),
    'msm_b600:plain': tag(['minecraft:stone', 'minecraft:dirt']),
    'msm_b600:nested': tag(['#msm_b600:plain', 'minecraft:sand', '#minecraft:logs']),
    'msm_b600:with_optional': tag([
      'minecraft:stone',
      { id: 'msm_b600:nope', required: false },
      { id: '#msm_b600:nope_tag', required: false },
    ]),
    'msm_b600:with_missing': tag(['minecraft:stone', 'msm_b600:nope']),
    'msm_b600:names_missing': tag(['#msm_b600:with_missing', 'minecraft:dirt']),
    'msm_b600:missing_tag': tag(['minecraft:stone', '#msm_b600:nope_tag']),
    'msm_b600:cycle_a': tag(['#msm_b600:cycle_b', 'minecraft:stone']),
    'msm_b600:cycle_b': tag(['#msm_b600:cycle_a', 'minecraft:dirt']),
    'msm_b600:dupes': tag(['minecraft:stone', 'minecraft:stone', '#msm_b600:plain']),
    'minecraft:logs': tag(['minecraft:stone']),
    'minecraft:wool': tag(['minecraft:stone'], true),
    'msm_b600:spiky': tag(['minecraft:diamond_sword']),
  },
  'tags/enchantment': {
    'minecraft:curse': tag(['msm_b600:spike_curse']),
  },
};

/** Only the fixture's `nope` does not exist (the game's item registry decides; a stand-in here). */
const exists = (_registry: string, id: string): boolean => id !== 'msm_b600:nope';

const resolver = () =>
  createTagResolver(layeredLookup(tableLookup(PROJECT), tableLookup(VANILLA)), { exists });

const ids = (registry: string, id: string): string[] | 'absent' => {
  const resolved = resolver()(registry, id);
  return resolved.dropped ? 'absent' : resolved.members.map((member) => member.id);
};

describe('tags as B600 observed them', () => {
  it('resolves plain tags in the order written', () => {
    expect(ids('item', 'msm_b600:three')).toEqual([
      'minecraft:stone',
      'minecraft:dirt',
      'minecraft:sand',
    ]);
    expect(ids('item', 'msm_b600:plain')).toEqual(['minecraft:stone', 'minecraft:dirt']);
    expect(ids('minecraft:item', 'msm_b600:spiky')).toEqual(['minecraft:diamond_sword']);
  });

  it('resolves tags naming tags, each member once, with the chain it came through', () => {
    const nested = resolver()('item', 'msm_b600:nested');
    expect(nested.dropped).toBe(false);
    expect(nested.members.map((m) => m.id)).toEqual([
      'minecraft:stone',
      'minecraft:dirt',
      'minecraft:sand',
      'minecraft:oak_log',
      'minecraft:oak_wood',
      'minecraft:birch_log',
      'minecraft:birch_wood',
    ]);
    const oak = nested.members.find((m) => m.id === 'minecraft:oak_log');
    expect(oak).toEqual({
      id: 'minecraft:oak_log',
      origin: 'vanilla',
      chain: ['minecraft:logs', 'minecraft:oak_logs'],
    });
    expect(nested.members[0]).toEqual({
      id: 'minecraft:stone',
      origin: 'project',
      chain: ['msm_b600:plain'],
    });
    expect(ids('item', 'msm_b600:dupes')).toEqual(['minecraft:stone', 'minecraft:dirt']);
  });

  it('merges a project file into vanilla, vanilla first, and replaces with replace', () => {
    const logs = resolver()('item', 'minecraft:logs');
    expect(logs.replaced).toBe(false);
    expect(logs.members.map((m) => [m.id, m.origin])).toEqual([
      ['minecraft:oak_log', 'vanilla'],
      ['minecraft:oak_wood', 'vanilla'],
      ['minecraft:birch_log', 'vanilla'],
      ['minecraft:birch_wood', 'vanilla'],
      ['minecraft:stone', 'project'],
    ]);
    const wool = resolver()('item', 'minecraft:wool');
    expect(wool.replaced).toBe(true);
    expect(wool.members.map((m) => m.id)).toEqual(['minecraft:stone']);
    expect(ids('enchantment', 'minecraft:curse')).toEqual([
      'minecraft:binding_curse',
      'minecraft:vanishing_curse',
      'msm_b600:spike_curse',
    ]);
  });

  it('skips missing optional entries without a word', () => {
    const optional = resolver()('item', 'msm_b600:with_optional');
    expect(optional.members.map((m) => m.id)).toEqual(['minecraft:stone']);
    expect(optional.missing).toEqual([]);
    expect(optional.dropped).toBe(false);
  });

  it('drops a tag with a missing required entry, and every tag naming it', () => {
    const missing = resolver()('item', 'msm_b600:with_missing');
    expect(missing).toMatchObject({ dropped: true, members: [], missing: ['msm_b600:nope'] });
    const names = resolver()('item', 'msm_b600:names_missing');
    expect(names).toMatchObject({
      dropped: true,
      members: [],
      missing: ['#msm_b600:with_missing'],
    });
    const missingTag = resolver()('item', 'msm_b600:missing_tag');
    expect(missingTag).toMatchObject({ dropped: true, missing: ['#msm_b600:nope_tag'] });
  });

  it('drops every tag in a cycle and reports the cycle', () => {
    for (const id of ['msm_b600:cycle_a', 'msm_b600:cycle_b']) {
      const resolved = resolver()('item', id);
      expect(resolved.dropped).toBe(true);
      expect(resolved.members).toEqual([]);
      expect(resolved.cycles).toHaveLength(1);
      expect([...(resolved.cycles[0] ?? [])].sort()).toEqual([
        'msm_b600:cycle_a',
        'msm_b600:cycle_b',
      ]);
    }
    // A tag naming one of them is dropped too.
    const lookup = layeredLookup(
      tableLookup({
        'tags/item': { ...PROJECT['tags/item'], 'msm_b600:outer': tag(['#msm_b600:cycle_a']) },
      }),
      tableLookup(VANILLA),
    );
    const outer = resolveTag('item', 'msm_b600:outer', lookup);
    expect(outer).toMatchObject({ dropped: true, missing: ['#msm_b600:cycle_a'] });
    expect(outer.cycles).toHaveLength(1);
    const self = resolveTag(
      'item',
      'x:self',
      tableLookup({ 'tags/item': { 'x:self': tag(['#x:self']) } }),
    );
    expect(self.dropped).toBe(true);
    expect(self.cycles).toEqual([['x:self']]);
  });

  it('answers a tag no file defines as dropped, with itself missing', () => {
    const none = resolver()('item', 'msm_b600:nope_tag');
    expect(none).toMatchObject({ dropped: true, members: [], missing: ['#msm_b600:nope_tag'] });
  });

  it('keeps every element when it cannot tell whether one exists', () => {
    const lookup = layeredLookup(tableLookup(PROJECT), tableLookup(VANILLA));
    expect(resolveTag('item', 'msm_b600:with_missing', lookup).members.map((m) => m.id)).toEqual([
      'minecraft:stone',
      'msm_b600:nope',
    ]);
  });

  it('takes the project beside a vanilla-only lookup, and counts a single lookup as vanilla', () => {
    const viaOption = resolveTag('item', 'minecraft:logs', tableLookup(VANILLA), {
      project: tableLookup(PROJECT),
    });
    expect(viaOption.members.at(-1)).toEqual({
      id: 'minecraft:stone',
      origin: 'project',
      chain: [],
    });
    const single = resolveTag('item', 'minecraft:wool', tableLookup(VANILLA));
    expect(single.members.map((m) => m.origin)).toEqual(['vanilla', 'vanilla']);
  });

  it('works each tag out once', () => {
    let reads = 0;
    const vanilla = tableLookup(VANILLA);
    const counting = (folder: string, id: string) => {
      reads++;
      return vanilla(folder, id);
    };
    const resolve = createTagResolver(counting);
    resolve('item', 'minecraft:logs');
    const first = reads;
    expect(resolve('item', 'minecraft:logs')).toBe(resolve('item', 'logs'));
    resolve('item', 'minecraft:oak_logs');
    expect(reads).toBe(first);
  });

  it('reads the project from lowered files', () => {
    const files: SimFiles = new Map<string, string>([
      [
        'data/msm_b600/tags/item/plain.json',
        JSON.stringify(PROJECT['tags/item']?.['msm_b600:plain']),
      ],
      ['data/minecraft/tags/item/logs.json', JSON.stringify({ values: ['minecraft:stone'] })],
      ['data/msm_b600/tags/item/broken.json', '{ not json'],
    ]);
    const lookup = layeredLookup(filesLookup(files), tableLookup(VANILLA));
    expect(resolveTag('item', 'msm_b600:plain', lookup).members.map((m) => m.id)).toEqual([
      'minecraft:stone',
      'minecraft:dirt',
    ]);
    expect(resolveTag('item', 'minecraft:logs', lookup).members).toHaveLength(5);
    expect(resolveTag('item', 'msm_b600:broken', lookup).dropped).toBe(true);
  });
});
