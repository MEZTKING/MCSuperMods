import {
  type StructureTemplateData,
  structureTemplateToNbt,
  writeNbt,
} from '@msm/plugin-structures';
import type { PieceTemplate as EnginePieceTemplate } from '@msm/terrain';
import { describe, expect, it } from 'vitest';
import {
  createVanillaPieceReader,
  NOT_SET_UP_VANILLA_PIECES,
  PIECE_IDS_PER_CALL,
  type PieceTemplate,
  parsePieceTemplate,
  type ReadVanillaStructureTemplates,
  vanillaPieceId,
} from '../../../../src/renderer/src/liveviews/structures/vanilla-pieces';

/**
 * MSM's own fixture template (no Mojang file): a 3 by 2 by 3 hut floor with a chest, a sideways
 * jigsaw without a written joint, and a downward jigsaw with priorities and a joint.
 */
const HUT: StructureTemplateData = {
  size: [3, 2, 3],
  palette: [
    'minecraft:stone',
    'minecraft:jigsaw[orientation=east_up]',
    'minecraft:jigsaw[orientation=down_south]',
    'minecraft:chest[facing=north,type=single,waterlogged=false]',
    'minecraft:air',
  ],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 0, 0],
    [2, 0, 0, 1],
    [1, 0, 1, 2],
    [1, 1, 1, 3],
    [0, 1, 0, 4],
  ],
  block_entities: [{ pos: [1, 1, 1], nbt: '{LootTable:"minecraft:chests/made_up"}' }],
  jigsaws: [
    {
      pos: [2, 0, 0],
      pool: 'minecraft:made_up/streets',
      name: 'minecraft:door',
      target: 'minecraft:street',
      final_state: 'minecraft:stone',
    },
    {
      pos: [1, 0, 1],
      pool: 'minecraft:made_up/cellars',
      name: 'minecraft:floor',
      target: 'minecraft:ceiling',
      final_state: 'minecraft:air',
      joint: 'aligned',
      selection_priority: 2,
      placement_priority: 5,
    },
  ],
};

/** The fixture as a gzipped structure file, as the jar stores templates. */
const HUT_BYTES = writeNbt(structureTemplateToNbt(HUT, 5100), 'gzip');

function fakeRead(ready: { value: boolean }, files: Record<string, Uint8Array>) {
  const calls: string[][] = [];
  const read: ReadVanillaStructureTemplates = async (version, ids) => {
    calls.push([...ids]);
    if (!ready.value) return null;
    const templates: Record<string, Uint8Array> = {};
    const missing: string[] = [];
    const refused: string[] = [];
    for (const id of ids) {
      if (id === 'minecraft:made_up/refused') refused.push(id);
      else if (Object.hasOwn(files, id)) templates[id] = files[id] as Uint8Array;
      else missing.push(id);
    }
    return { version, templates, missing, refused };
  };
  return { read, calls };
}

describe('the vanilla structure template reader (ADR 0122, B636)', () => {
  it('parses a template file into the engine shape', () => {
    const template = parsePieceTemplate('minecraft:made_up/hut', HUT_BYTES);
    // The mirrored type is the engine's.
    const engine: EnginePieceTemplate = template;
    const back: PieceTemplate = engine;
    expect(back).toBe(template);
    expect(template.id).toBe('minecraft:made_up/hut');
    expect(template.size).toEqual([3, 2, 3]);
    expect(template.palette).toContain('minecraft:stone');
    expect(template.blocks).toHaveLength(6);
    const chest = template.blocks?.find((block) => block.nbt !== undefined);
    expect(chest?.pos).toEqual([1, 1, 1]);
    expect(String(chest?.nbt)).toContain('minecraft:chests/made_up');
    expect(template.palette[chest?.state ?? -1]).toMatch(/^minecraft:chest\[/);
    expect(template.jigsaws).toEqual([
      {
        pos: [2, 0, 0],
        orientation: 'east_up',
        name: 'minecraft:door',
        target: 'minecraft:street',
        pool: 'minecraft:made_up/streets',
        joint: 'aligned',
        finalState: 'minecraft:stone',
        selectionPriority: 0,
        placementPriority: 0,
      },
      {
        pos: [1, 0, 1],
        orientation: 'down_south',
        name: 'minecraft:floor',
        target: 'minecraft:ceiling',
        pool: 'minecraft:made_up/cellars',
        joint: 'aligned',
        finalState: 'minecraft:air',
        selectionPriority: 2,
        placementPriority: 5,
      },
    ]);
  });

  it('reads a vertical jigsaw without a written joint as rollable', () => {
    const jigsaws = [{ ...(HUT.jigsaws?.[1] as NonNullable<typeof HUT.jigsaws>[number]) }];
    delete jigsaws[0]?.joint;
    const bytes = writeNbt(structureTemplateToNbt({ ...HUT, jigsaws }, 5100), 'gzip');
    expect(parsePieceTemplate('minecraft:x', bytes).jigsaws[0]?.joint).toBe('rollable');
  });

  it('answers "not set up" without a cache, and asks again', async () => {
    const ready = { value: false };
    const { read, calls } = fakeRead(ready, { 'minecraft:made_up/hut': HUT_BYTES });
    const reader = createVanillaPieceReader({ mcVersion: '9.9', read });
    expect(await reader.template('made_up/hut')).toEqual({ status: 'not_set_up' });
    expect(reader.cached('made_up/hut')).toBeUndefined();
    ready.value = true;
    const answer = await reader.template('made_up/hut');
    expect(answer.status).toBe('ready');
    expect(calls).toEqual([['minecraft:made_up/hut'], ['minecraft:made_up/hut']]);
  });

  it('parses each template once and keeps it by id', async () => {
    const { read, calls } = fakeRead({ value: true }, { 'minecraft:made_up/hut': HUT_BYTES });
    const reader = createVanillaPieceReader({ mcVersion: '9.9', read });
    const [first, second] = await Promise.all([
      reader.template('minecraft:made_up/hut'),
      reader.template('made_up/hut'),
    ]);
    expect(first?.status).toBe('ready');
    expect(second).toBe(first);
    const third = await reader.template('made_up/hut');
    expect(third).toBe(first);
    expect(calls).toEqual([['minecraft:made_up/hut']]);
    expect(reader.cached('made_up/hut')).toBe(first?.status === 'ready' ? first.template : null);
    reader.forget();
    expect(reader.cached('made_up/hut')).toBeUndefined();
    await reader.template('made_up/hut');
    expect(calls).toHaveLength(2);
  });

  it('asks several ids together, 256 a call, and tells missing from unreadable', async () => {
    const { read, calls } = fakeRead(
      { value: true },
      { 'minecraft:made_up/hut': HUT_BYTES, 'minecraft:made_up/broken': new Uint8Array([1, 2]) },
    );
    const reader = createVanillaPieceReader({ mcVersion: '9.9', read });
    const ids = [
      'made_up/hut',
      'minecraft:made_up/none',
      'made_up/broken',
      'made_up/refused',
      ...Array.from({ length: PIECE_IDS_PER_CALL }, (_, i) => `made_up/extra_${i}`),
    ];
    const answers = await reader.templates(ids);
    expect(calls.map((call) => call.length)).toEqual([PIECE_IDS_PER_CALL, 4]);
    expect(answers.get('minecraft:made_up/hut')?.status).toBe('ready');
    expect(answers.get('minecraft:made_up/none')).toEqual({
      status: 'missing',
      id: 'minecraft:made_up/none',
    });
    expect(answers.get('minecraft:made_up/broken')?.status).toBe('unreadable');
    expect(answers.get('minecraft:made_up/refused')?.status).toBe('unreadable');
    expect(reader.cached('made_up/none')).toBeNull();
    expect(reader.cached('made_up/broken')).toBeNull();
    await reader.templates(['made_up/hut', 'made_up/none']);
    expect(calls).toHaveLength(2);
  });

  it('refuses ids that are not vanilla template ids, asking nothing', async () => {
    const { read, calls } = fakeRead({ value: true }, {});
    const reader = createVanillaPieceReader({ mcVersion: '9.9', read });
    for (const id of ['other:a', '../a', 'minecraft:a/../b', 'minecraft:A', '']) {
      expect(vanillaPieceId(id), id).toBeNull();
      await expect(reader.template(id), id).rejects.toThrow(/template id/);
    }
    expect(calls).toEqual([]);
    expect(vanillaPieceId('igloo/top')).toBe('minecraft:igloo/top');
  });

  it('the reader without a cache asks nothing', async () => {
    expect(await NOT_SET_UP_VANILLA_PIECES.template('a')).toEqual({ status: 'not_set_up' });
    expect(NOT_SET_UP_VANILLA_PIECES.cached('a')).toBeUndefined();
  });
});
