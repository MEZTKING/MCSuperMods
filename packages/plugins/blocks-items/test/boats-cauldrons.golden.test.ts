/**
 * Golden tests of boats (`msm:boat`, ADR 0110 D1) and of fluid cauldrons and bottles (ADR 0108
 * D2, D3; B531): every sample is lowered for every built-in target, every output is validated
 * against the schema it declares, and the outputs are compared with
 * `fixtures/<target id>/expected/<folder>/<name>.json`. Set `UPDATE_GOLDENS=1` to rewrite the
 * expected files instead of comparing. Also: the vanilla parents, pictures and tags lowering
 * names are in both targets' vendored registries, and the id helpers follow the runtime's
 * `BoatParser` rules.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json, JsonObject, OutputFile, ResourceLocation, TargetFacts } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  BOAT_ITEM_TAGS,
  BOTTLE_FALLBACK_LAYERS,
  boatChestId,
  boatCompanionIds,
  boatPlanksId,
  boatTextureId,
  boatTexturePaths,
  boatWoodOf,
  CAULDRON_BLOCK_TAGS,
  CAULDRON_PICTURES,
  CAULDRON_TEMPLATES,
  CHEST_BOAT_FALLBACK_ITEM,
  FLUID_KIND,
  fluidBottleId,
  fluidBucketId,
  fluidCauldronHasLevels,
  fluidCauldronId,
  fluidCompanionIds,
  fluidDefinition,
  fluidKind,
  fluidRegistryIds,
  itemDefinition,
  lowerCauldron,
} from '../src/index';
import { ITEM_KIND, itemKind } from '../src/kinds';
import {
  blockingProblems,
  element,
  indexesFor,
  PROJECT_IDS,
  sortedJson,
  type TargetIndexes,
} from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  name: string;
  kind: typeof ITEM_KIND | typeof FLUID_KIND;
  id: ResourceLocation;
  data: JsonObject;
}

const SAMPLES: Sample[] = [
  {
    name: 'boat-plain',
    kind: ITEM_KIND,
    id: 'example:willow_boat',
    data: {
      format: 1,
      model: 'example:item/willow_boat',
      display_name: 'Willow Boat',
      components: { 'msm:boat': {} },
      boat_textures: { boat: 'example:entity/boat/willow' },
    },
  },
  {
    name: 'boat-chest',
    kind: ITEM_KIND,
    id: 'example:woods/ash_boat',
    data: {
      format: 1,
      model: 'example:item/ash_boat',
      display_name: 'Ash Boat',
      chest_boat_display_name: 'Ash Chest Boat',
      max_stack_size: 1,
      components: { 'msm:boat': { chest: true } },
      boat_textures: {
        boat: 'example:pictures/ash_boat',
        chest_boat: 'example:pictures/ash_chest_boat',
        chest_boat_item: 'example:item/ash_chest_boat',
      },
    },
  },
  {
    name: 'raft-chest',
    kind: ITEM_KIND,
    id: 'example:reed_raft',
    data: {
      format: 1,
      model: 'minecraft:item/bamboo_raft',
      display_name: 'Reed Raft',
      components: { 'msm:boat': { chest: true, raft: true, wood_texture: 'minecraft:bamboo' } },
    },
  },
  {
    name: 'cauldron-levels-bottle',
    kind: FLUID_KIND,
    id: 'example:tea',
    data: {
      format: 1,
      behaves_like: 'water',
      tint: 0x8a5a2b,
      display_name: 'Tea',
      cauldron: { levels: true },
      bottle: {
        food: { nutrition: 1, saturation: 0.2 },
        on_drink: 'example:warm',
      },
      events: {
        'example:warm': {
          actions: [
            { type: 'apply_effect', effect: 'minecraft:speed', seconds: 3, target: 'self' },
          ],
        },
      },
      textures: {
        still: 'example:block/tea_still',
        flowing: 'example:block/tea_flow',
        bucket: 'example:item/tea_bucket',
        bottle: 'example:item/tea_bottle',
      },
    },
  },
  {
    name: 'cauldron-lava-full',
    kind: FLUID_KIND,
    id: 'example:liquids/slag',
    data: {
      format: 1,
      behaves_like: 'lava',
      display_name: 'Slag',
      cauldron_display_name: 'Cauldron of Slag',
      cauldron: { levels: true },
      mixing: [{ with: 'water', source: 'minecraft:obsidian', flowing: 'minecraft:cobblestone' }],
    },
  },
  {
    name: 'bottle-only',
    kind: FLUID_KIND,
    id: 'example:dew',
    data: { format: 1, bottle: { effects: [{ effect: 'minecraft:luck', seconds: 30 }] } },
  },
];

/** Every string in `value`, nested lists and objects included. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/** The test indexes with the ids a sample brings, as the app's registry index counts them. */
function withSampleIds(
  indexes: TargetIndexes,
  sample: Sample,
  files: OutputFile[],
  target: TargetFacts,
): TargetIndexes {
  const modelIds = files
    .map((file) => /^assets\/([^/]+)\/models\/(.+)\.json$/.exec(file.path))
    .filter((match) => match !== null)
    .map((match) => `${match[1]}:${match[2]}`);
  const textures = [...strings(sample.data.textures), ...strings(sample.data.boat_textures)].filter(
    (id) => !id.startsWith('minecraft:'),
  );
  const project: Record<string, readonly string[]> =
    sample.kind === FLUID_KIND
      ? {
          ...PROJECT_IDS,
          block: [
            ...(PROJECT_IDS.block ?? []),
            sample.id,
            ...(fluidCompanionIds(sample.id, sample.data).block ?? []),
          ],
          item: [
            ...(PROJECT_IDS.item ?? []),
            fluidBucketId(sample.id),
            ...(fluidCompanionIds(sample.id, sample.data).item ?? []),
          ],
          model: [...(PROJECT_IDS.model ?? []), ...modelIds],
          fluid: fluidRegistryIds(target, sample.id),
          texture: textures,
        }
      : {
          ...PROJECT_IDS,
          item: [
            ...(PROJECT_IDS.item ?? []),
            sample.id,
            ...boatCompanionIds(sample.id, sample.data),
            boatPlanksId(sample.id),
          ],
          model: [
            ...(PROJECT_IDS.model ?? []),
            ...modelIds,
            ...strings(sample.data.model).filter((id) => !id.startsWith('minecraft:')),
          ],
          texture: textures,
        };
  return { ...indexes, registries: createRegistryIndex({ vanilla: indexes.vanilla, project }) };
}

const kindOf = (sample: Sample) => (sample.kind === FLUID_KIND ? fluidKind : itemKind);

const lowerFor = async (sample: Sample, target: TargetFacts): Promise<OutputFile[]> =>
  kindOf(sample).lower(element(sample.kind, sample.id, sample.data), target);

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(
    `./fixtures/${targetId}/expected/${kindOf(sample).folder}/${sample.name}.json`,
    import.meta.url,
  );

const byName = (name: string): Sample => {
  const found = SAMPLES.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'boat and cauldron lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((sample) => [sample.name, sample] as const))('%s', async (_, sample) => {
      const files = await lowerFor(sample, bundle.target);
      const indexes = withSampleIds(await indexesFor(bundle), sample, files, bundle.target);
      const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
      expect(problems(kindOf(sample).schema, sample.data)).toEqual([]);
      for (const file of files) {
        expect(file.schema, file.path).toBeDefined();
        if (file.schema === undefined) continue;
        expect(problems(file.schema, file.contents as Json), file.path).toEqual([]);
      }
      const actual = sortedJson(
        files.map((file) => ({
          contents: file.contents,
          layer: file.layer,
          merge: file.merge,
          path: file.path,
          schema: file.schema,
        })),
      );
      const url = fixtureUrl(targetId, sample);
      if (UPDATE) {
        await mkdir(dirname(fileURLToPath(url)), { recursive: true });
        await writeFile(url, actual);
      }
      expect(actual).toBe(await readFile(url, 'utf8'));
    });

    it("names only vanilla's parents, pictures and tags of the target", async () => {
      const { registries } = await indexesFor(bundle);
      for (const parent of Object.values(CAULDRON_TEMPLATES)) {
        expect(registries.has('model', parent), parent).toBe(true);
      }
      for (const picture of [
        ...Object.values(CAULDRON_PICTURES),
        ...BOTTLE_FALLBACK_LAYERS,
        ...Object.values(CHEST_BOAT_FALLBACK_ITEM),
      ]) {
        expect(registries.has('texture', picture), picture).toBe(true);
      }
      for (const tag of CAULDRON_BLOCK_TAGS) {
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      }
      for (const tag of Object.values(BOAT_ITEM_TAGS)) {
        expect(registries.has('tag/item', `minecraft:${tag}`), tag).toBe(true);
      }
      // The raft sample borrows vanilla bamboo's pictures at their fixed paths.
      const raft = byName('raft-chest');
      for (const slot of ['boat', 'chest_boat'] as const) {
        const id = boatTextureId(raft.id, raft.data, slot);
        expect(registries.has('texture', id), id).toBe(true);
      }
      // The cauldron's ids are none of vanilla's.
      for (const sample of SAMPLES.filter((entry) => entry.kind === FLUID_KIND)) {
        expect(bundle.target.blocks?.cauldrons ?? []).not.toContain(fluidCauldronId(sample.id));
      }
    });
  },
);

describe('msm:boat', () => {
  it("derives the wood, chest boat and planks as the runtime's BoatParser does", () => {
    const plain = { components: { 'msm:boat': {} } };
    const raft = { components: { 'msm:boat': { raft: true } } };
    expect(boatWoodOf('demo:maple_boat', plain)).toBe('demo:maple');
    expect(boatWoodOf('demo:reed_raft', raft)).toBe('demo:reed');
    expect(boatWoodOf('demo:canoe', plain)).toBe('demo:canoe');
    // A path that is only the ending keeps it, as `BoatParser.stripEnding`.
    expect(boatWoodOf('demo:_boat', plain)).toBe('demo:_boat');
    expect(
      boatWoodOf('demo:maple_boat', { components: { 'msm:boat': { wood_texture: 'other:elm' } } }),
    ).toBe('other:elm');
    expect(boatChestId('demo:maple_boat', plain)).toBe('demo:maple_chest_boat');
    expect(boatChestId('demo:reed_raft', raft)).toBe('demo:reed_chest_raft');
    expect(boatChestId('demo:woods/ash_boat', plain)).toBe('demo:woods/ash_chest_boat');
    expect(boatPlanksId('demo:woods/ash_boat')).toBe('demo:woods/ash_planks');
    expect(boatCompanionIds('demo:maple_boat', plain)).toEqual([]);
    expect(
      boatCompanionIds('demo:maple_boat', { components: { 'msm:boat': { chest: true } } }),
    ).toEqual(['demo:maple_chest_boat']);
    expect(boatCompanionIds('demo:stick', { components: {} })).toEqual([]);
  });

  it('names the pictures the host copies to the fixed boat texture paths', () => {
    const target = builtInTargets[0]?.target as TargetFacts;
    const chest = byName('boat-chest');
    expect(boatTexturePaths(target, chest)).toEqual([
      {
        slot: 'boat',
        from: 'assets/example/textures/pictures/ash_boat.png',
        to: 'assets/example/textures/entity/boat/woods/ash.png',
        textureId: 'example:entity/boat/woods/ash',
      },
      {
        slot: 'chest_boat',
        from: 'assets/example/textures/pictures/ash_chest_boat.png',
        to: 'assets/example/textures/entity/chest_boat/woods/ash.png',
        textureId: 'example:entity/chest_boat/woods/ash',
      },
    ]);
    // Already at the fixed path: nothing to copy, `from` equals `to`.
    const [plain] = boatTexturePaths(target, byName('boat-plain'));
    expect(plain?.from).toBe(plain?.to);
    // No chest: the chest boat picture is not named.
    expect(
      boatTexturePaths(target, {
        id: 'demo:maple_boat' as ResourceLocation,
        data: {
          components: { 'msm:boat': {} },
          boat_textures: { boat: 'demo:a', chest_boat: 'demo:b' },
        },
      }).map((entry) => entry.slot),
    ).toEqual(['boat']);
    expect(boatTexturePaths(target, byName('raft-chest'))).toEqual([]);
  });

  it('stacks a boat to 1 and strips the boat fields from the definition', () => {
    const chest = byName('boat-chest');
    const definition = itemDefinition(element(ITEM_KIND, chest.id, chest.data));
    expect(definition.max_stack_size).toBe(1);
    expect(definition.boat_textures).toBeUndefined();
    expect(definition.chest_boat_display_name).toBeUndefined();
    // Not a boat: only the stray element fields go.
    const stick = itemDefinition(
      element(ITEM_KIND, 'demo:stick' as ResourceLocation, {
        format: 1,
        boat_textures: { boat: 'demo:a' },
      }),
    );
    expect(stick.max_stack_size).toBeUndefined();
    expect(stick.boat_textures).toBeUndefined();
  });
});

describe('fluid cauldrons and bottles', () => {
  it('derives the cauldron and bottle ids and levels', () => {
    expect(fluidCauldronId('example:liquids/slag')).toBe('example:liquids/slag_cauldron');
    expect(fluidBottleId('example:tea')).toBe('example:tea_bottle');
    expect(fluidCauldronHasLevels(byName('cauldron-levels-bottle').data)).toBe(true);
    // Lava-like: always full only.
    expect(fluidCauldronHasLevels(byName('cauldron-lava-full').data)).toBe(false);
    expect(fluidCompanionIds('example:dew', byName('bottle-only').data)).toEqual({
      item: ['example:dew_bottle'],
    });
    expect(fluidCompanionIds('example:plain', {})).toEqual({});
  });

  it('strips the cauldron and bottle names from the definition and lowers nothing without them', () => {
    const slag = byName('cauldron-lava-full');
    const definition = fluidDefinition(element(FLUID_KIND, slag.id, slag.data));
    expect(definition.cauldron_display_name).toBeUndefined();
    expect(definition.mixing).toEqual(slag.data.mixing);
    const target = builtInTargets[0]?.target as TargetFacts;
    expect(
      lowerCauldron(
        element(FLUID_KIND, 'example:plain' as ResourceLocation, { format: 1 }),
        target,
      ),
    ).toEqual([]);
  });

  it("draws a bottle without its own picture as vanilla's potion in the fluid's colour", async () => {
    const target = builtInTargets[0]?.target as TargetFacts;
    const files = await lowerFor(byName('bottle-only'), target);
    const definition = files.find((file) => file.path === 'assets/example/items/dew_bottle.json');
    expect(definition?.contents).toEqual({
      model: {
        type: 'minecraft:model',
        model: 'example:item/dew_bottle',
        tints: [{ type: 'minecraft:constant', value: 0x385dc6 }],
      },
    });
    // No display name: no language keys at all.
    expect(files.some((file) => file.path.includes('/lang/'))).toBe(false);
  });
});
