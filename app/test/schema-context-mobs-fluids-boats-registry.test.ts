/**
 * The registry view of vanilla parity 3 batch 2 (B538; B530 and B531 notes): a bucketable mob
 * counts its bucket `<id>_bucket` and the bucket's item model; a fluid with `cauldron` and
 * `bottle` counts `<id>_cauldron` (block) and `<id>_bottle` (item) and their models; a boat item
 * counts its own id as an entity type and its chest boat as an item and an entity type, with the
 * chest boat's item model.
 */
import type { Element, Project } from '@msm/core';
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  dataRegistryIds,
  entityIsBucketable,
  projectRegistryIds,
} from '../src/renderer/src/session/schema-context';

const element = (id: string, kind: string, data: Json): Element =>
  ({ formatVersion: 1, id, kind, data, meta: {} }) as unknown as Element;
const project = (...elements: Element[]): Project => ({
  formatVersion: 1,
  name: 'Demo',
  targets: [],
  plugins: [],
  settings: {},
  namespaces: [{ name: 'demo', elements, assets: [] }],
});

const FISH = element('demo:glowfin', 'msm:entity', {
  spawn_egg: false,
  components: {
    'msm:animated_model': { model: 'demo:glowfin', texture: 'demo:entity/glowfin' },
    'msm:movement': { mode: 'swim' },
    'msm:bucketable': {},
  },
});
const OIL = element('demo:oil', 'msm:fluid', {
  format: 1,
  cauldron: { levels: true },
  bottle: {},
});
const TAR = element('demo:tar', 'msm:fluid', { format: 1, behaves_like: 'lava', cauldron: {} });
const BOAT = element('demo:maple_boat', 'msm:item', {
  components: { 'msm:boat': { chest: true } },
});
const RAFT = element('demo:reed_raft', 'msm:item', {
  components: { 'msm:boat': { raft: true } },
});

describe('registry view of buckets, cauldrons, bottles and boats', () => {
  it("counts a bucketable mob's bucket item and its model", () => {
    expect(entityIsBucketable(FISH.data)).toBe(true);
    expect(entityIsBucketable({ components: {} })).toBe(false);
    const ids = dataRegistryIds(project(FISH));
    expect(ids.item).toEqual(['demo:glowfin_bucket']);
    expect(projectRegistryIds(project(FISH)).model).toEqual(['demo:item/glowfin_bucket']);
  });

  it("counts a fluid's cauldron and bottle and their models", () => {
    const ids = dataRegistryIds(project(OIL, TAR));
    expect(ids.block).toEqual(['demo:oil', 'demo:oil_cauldron', 'demo:tar', 'demo:tar_cauldron']);
    expect(ids.item).toEqual(['demo:oil_bottle', 'demo:oil_bucket', 'demo:tar_bucket']);
    expect(projectRegistryIds(project(OIL, TAR)).model).toEqual([
      'demo:block/oil',
      'demo:block/oil_cauldron_full',
      'demo:block/oil_cauldron_level1',
      'demo:block/oil_cauldron_level2',
      'demo:block/tar',
      'demo:block/tar_cauldron',
      'demo:item/oil_bottle',
      'demo:item/oil_bucket',
      'demo:item/tar_bucket',
    ]);
  });

  it('counts a boat as an entity type and its chest boat as an item and an entity type', () => {
    const ids = dataRegistryIds(project(BOAT, RAFT));
    expect(ids.item).toEqual(['demo:maple_boat', 'demo:maple_chest_boat', 'demo:reed_raft']);
    expect(ids.entity_type).toEqual(['demo:maple_boat', 'demo:maple_chest_boat', 'demo:reed_raft']);
    expect(projectRegistryIds(project(BOAT)).model).toEqual(['demo:item/maple_chest_boat']);
  });
});
