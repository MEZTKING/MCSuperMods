/**
 * Vanilla pack safety (ADR 0066) for storage 2 and own sounds (ADR 0104 D3 to D6, ADR 0105 D1,
 * D4; B515), on the real blocks-items lowering:
 *
 * - a double, waterlogged chest and a per-player chest are blocks like any other: their loot
 *   tables name the mod-only block item and are left out of the vanilla data pack with
 *   `export.mod-only-reference`;
 * - a block's own `block_sound_set` entry (written where block sounds are data) names
 *   sounds only by `sounds.json` key (`{ "sound_id" }`), never the block, so it is kept: it
 *   loads on a vanilla server and does nothing there;
 * - the rules for vanilla blocks lower to the runtime layer only, so the vanilla packs never
 *   see them (limit N9).
 */
import type { Element, OutputFile, ResourceLocation } from '@msm/plugin-api';
import plugin from '@msm/plugin-blocks-items';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { MOD_ONLY_REFERENCE, modOnlyIdsOf, vanillaSafeDataFiles } from '../src/index';

const element = (kind: string, id: string, data: Element['data']): Element => ({
  formatVersion: 1,
  id: id as ResourceLocation,
  kind,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const BLOCKS: Element[] = [
  element('msm:block', 'demo:sea_chest', {
    format: 1,
    type: 'horizontal',
    loot: 'self',
    textures: { all: 'demo:block/sea_chest' },
    components: { 'msm:container': { double: true }, 'msm:waterloggable': {} },
  }),
  element('msm:block', 'demo:void_chest', {
    format: 1,
    loot: 'self',
    model: 'demo:block/void_chest',
    components: { 'msm:container': { per_player: true } },
  }),
  element('msm:block', 'demo:chime_block', {
    format: 1,
    loot: 'self',
    model: 'demo:block/chime_block',
    block_sounds: {
      break: 'demo:block.chime.break',
      step: 'minecraft:block.amethyst_block.step',
      place: 'demo:block.chime.place',
      hit: 'minecraft:block.amethyst_block.hit',
      fall: 'minecraft:block.amethyst_block.fall',
    },
  }),
];

const RULES = element('msm:vanilla_block_rules', 'demo:farm_rules', {
  format: 1,
  strip: [{ block: 'minecraft:mossy_cobblestone', into: 'minecraft:cobblestone' }],
});

const kindOf = (id: string) => {
  const kind = plugin.contributes.elementKinds?.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`no kind ${id}`);
  return kind;
};

const ids = BLOCKS.map((block) => block.id as string);
const modOnly = modOnlyIdsOf({ block: ids, item: ids });

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle.target] as const))(
  'storage 2 and own sounds, vanilla data pack (%s)',
  (_id, target) => {
    const lowered = async (elements: Element[]): Promise<OutputFile[]> =>
      (await Promise.all(elements.map((entry) => kindOf(entry.kind).lower(entry, target)))).flat();
    const loot = (path: string) =>
      `data/demo/${target.folders.data.loot_table}/blocks/${path}.json`;

    it('leaves out the chests and sound block loot tables with mod-only-reference', async () => {
      const result = vanillaSafeDataFiles(await lowered(BLOCKS), modOnly, target.folders.data);
      const left = result.problems.filter((problem) => problem.code === MOD_ONLY_REFERENCE);
      expect(left.map((problem) => problem.file).sort()).toEqual(
        ['chime_block', 'sea_chest', 'void_chest'].map(loot),
      );
      expect(result.files.some((file) => file.path.includes('/loot_table/'))).toBe(false);
    });

    it('keeps the block_sound_set entry where sounds are data', async () => {
      const result = vanillaSafeDataFiles(await lowered(BLOCKS), modOnly, target.folders.data);
      const entries = result.files.filter((file) => file.path.includes('/block_sound_set/'));
      expect(entries.map((file) => file.path)).toEqual(
        target.blocks?.soundModel === 'block_sound_set'
          ? ['data/demo/block_sound_set/chime_block.json']
          : [],
      );
      expect(JSON.stringify(entries)).not.toContain('"demo:chime_block"');
    });

    it('writes the vanilla block rules to the runtime layer only', async () => {
      const files = await lowered([RULES]);
      expect(files.map((file) => file.layer)).toEqual(['msm']);
      expect(vanillaSafeDataFiles(files, modOnly, target.folders.data).files).toEqual(files);
    });
  },
);
