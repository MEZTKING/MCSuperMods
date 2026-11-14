/**
 * Vanilla pack safety for machines and containers (ADR 0066, ADR 0075 D10, ADR 0074 D6): a
 * machine recipe names the machine's block id in its `type` (ADR 0075 D2), which is a mod-only
 * id, so it is left out of the vanilla data pack with `export.mod-only-reference` even when
 * every item in it is vanilla; a vanilla cooking recipe of vanilla items stays; the
 * keep-contents loot table (`copy_components` from the block entity) names the mod-only block
 * item and is left out with the block's other loot. The generic scan covers `type` (it is not
 * one of the skipped keys), so the rule needs no `recipe_serializer` registry: the host's
 * `block` ids already hold every machine id.
 *
 * Files are hand-written `OutputFile`s shaped like the blocks-items lowering's (B315). On a
 * vanilla server an unknown recipe `type` fails the whole data pack (F22 of the containers and
 * machines plan, probed 2026-11-14 on vanilla servers of both targets), so leaving the file out is
 * required, not cosmetic.
 */
import type { Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  modOnlyReferenceMessage,
  vanillaSafeDataFiles,
} from '../src/index';

const MACHINE = 'demo:grinder';
const CRATE = 'demo:crate';

/** The mod-only ids as the app computes them: each block and its block item. */
const modOnly = modOnlyIdsOf({ block: [MACHINE, CRATE], item: [MACHINE, CRATE] });

const json = (path: string, contents: Json): OutputFile => ({
  path,
  contents,
  layer: 'datapack',
});

/** A machine recipe of vanilla items only (ADR 0075 D2). */
const machineRecipe: Json = {
  type: MACHINE,
  ingredient: 'minecraft:cobblestone',
  count: 1,
  result: { id: 'minecraft:gravel', count: 2 },
  time: 100,
  experience: 0.1,
};

/** A machine recipe with a tag ingredient and a list: still vanilla items only. */
const machineTagRecipe: Json = {
  type: MACHINE,
  ingredient: ['#minecraft:logs', 'minecraft:bamboo_block'],
  result: { id: 'minecraft:stick', count: 6 },
};

/** A vanilla smelting recipe the project writes for vanilla items. */
const smelting: Json = {
  type: 'minecraft:smelting',
  category: 'misc',
  ingredient: 'minecraft:cobblestone',
  result: { id: 'minecraft:stone' },
  experience: 0.1,
  cookingtime: 200,
};

/** The keep-contents loot preset (ADR 0074 D6): vanilla's shulker box loot. */
function keepContentsLoot(block: string): Json {
  return {
    type: 'minecraft:block',
    pools: [
      {
        rolls: 1,
        entries: [
          {
            type: 'minecraft:item',
            name: block,
            functions: [
              {
                function: 'minecraft:copy_components',
                source: 'block_entity',
                include: ['minecraft:custom_name', 'minecraft:container', 'minecraft:lock'],
              },
            ],
          },
        ],
        conditions: [{ condition: 'minecraft:survives_explosion' }],
      },
    ],
  };
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle.target] as const))(
  'machine recipes and containers, vanilla data pack (%s)',
  (_id, target) => {
    const folders = target.folders.data;
    const recipe = (path: string) => `data/demo/${folders.recipe}/${path}.json`;
    const loot = (path: string) => `data/demo/${folders.loot_table}/${path}.json`;
    const grinderRecipe = recipe('grinder/gravel');
    const grinderTagRecipe = recipe('grinder/stick');
    const smeltingRecipe = recipe('stone');
    const grinderLoot = loot('blocks/grinder');
    const crateLoot = loot('blocks/crate');

    const files = (): OutputFile[] => [
      json(grinderRecipe, machineRecipe),
      json(grinderTagRecipe, machineTagRecipe),
      json(smeltingRecipe, smelting),
      json(grinderLoot, keepContentsLoot(MACHINE)),
      json(crateLoot, keepContentsLoot(CRATE)),
    ];
    const paths = (out: readonly OutputFile[]) => out.map((file) => file.path);

    it('leaves out a machine recipe of vanilla items, for its type alone', () => {
      const result = vanillaSafeDataFiles([json(grinderRecipe, machineRecipe)], modOnly, folders);
      expect(paths(result.files)).toEqual([]);
      expect(result.problems).toEqual([
        {
          severity: 'warning',
          code: MOD_ONLY_REFERENCE,
          file: grinderRecipe,
          message: modOnlyReferenceMessage(grinderRecipe, MACHINE),
        },
      ]);
    });

    it('keeps a vanilla smelting recipe of vanilla items', () => {
      const input = [json(smeltingRecipe, smelting)];
      const result = vanillaSafeDataFiles(input, modOnly, folders);
      expect(result.files).toBe(input);
      expect(result.problems).toEqual([]);
    });

    it('leaves out the keep-contents loot table naming the block item', () => {
      const result = vanillaSafeDataFiles(
        [json(crateLoot, keepContentsLoot(CRATE))],
        modOnly,
        folders,
      );
      expect(paths(result.files)).toEqual([]);
      expect(result.problems.map((problem) => [problem.code, problem.file])).toEqual([
        [MOD_ONLY_REFERENCE, crateLoot],
      ]);
      expect(result.problems[0]?.message).toContain(CRATE);
    });

    it('leaves out every machine file, one warning per element, and keeps the rest', () => {
      const owners: Record<string, ResourceLocation> = {
        [grinderRecipe]: MACHINE,
        [grinderTagRecipe]: MACHINE,
        [grinderLoot]: MACHINE,
        [crateLoot]: CRATE,
        [smeltingRecipe]: 'demo:stone',
      };
      const result = vanillaSafeDataFiles(files(), modOnly, folders, (path) => owners[path]);
      expect(paths(result.files)).toEqual([smeltingRecipe]);
      const [first, ...rest] = [grinderLoot, grinderRecipe, grinderTagRecipe].sort();
      // Warnings follow each element's first path: `crate` sorts before `grinder`.
      expect(result.problems).toEqual([
        {
          severity: 'warning',
          code: MOD_ONLY_REFERENCE,
          file: crateLoot,
          elementId: CRATE,
          message: modOnlyReferenceMessage(crateLoot, CRATE),
        },
        {
          severity: 'warning',
          code: MOD_ONLY_REFERENCE,
          file: first,
          elementId: MACHINE,
          message: modOnlyReferenceMessage(first as string, MACHINE, rest.length),
        },
      ]);
    });

    it('leaves the files alone when the project has no mod-only ids', () => {
      const input = files();
      const result = vanillaSafeDataFiles(input, modOnlyIdsOf({}), folders);
      expect(result.files).toBe(input);
      expect(result.problems).toEqual([]);
    });
  },
);
