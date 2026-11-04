import {
  NbtByteArray,
  NbtCompound,
  NbtDouble,
  NbtInt,
  NbtIntArray,
  NbtList,
  NbtShort,
  NbtString,
} from 'deepslate/nbt';
import { describe, expect, it } from 'vitest';
import {
  canonicalBlockState,
  decodeVarints,
  encodeVarints,
  parseBlockState,
  parseSnbt,
  printBlockState,
  printSnbt,
  readNbt,
  type StructureTemplateData,
  schemFromStructureTemplate,
  structureTemplateFromNbt,
  structureTemplateFromSchem,
  structureTemplateToNbt,
  writeNbt,
} from '../src/index';

/** Every tag type, nested lists, a list of compounds and strings that need escaping. */
const EVERY_TAG =
  '{byte:-5b,short:1234s,int:-70000,long:-9007199254740993L,float:0.1f,double:0.30000000000000004d,' +
  'big:1e+21d,tiny:1.5e-7f,whole:3.0d,bytes:[B;-128B,0B,127B],ints:[I;-1,0,2147483647],' +
  'longs:[L;-9223372036854775808L,0L,9223372036854775807L],empty:[],' +
  'nested:[[1,2],[3]],compounds:[{a:1b},{b:"x"}],' +
  'quote:"say \\"hi\\" \\\\ back",single:"it\'s",' +
  '"key with space":1,unicode:"Größe",Items:[{Slot:0b,id:"minecraft:bread",count:3}]}';

describe('SNBT', () => {
  it('round-trips every tag type through parse, print and binary NBT', () => {
    const tag = parseSnbt(EVERY_TAG);
    const printed = printSnbt(tag);
    expect(parseSnbt(printed).equals(tag)).toBe(true);
    expect(printSnbt(parseSnbt(printed))).toBe(printed);
    const reread = readNbt(writeNbt(tag)).root;
    expect(printSnbt(reread)).toBe(printed);
    // The types survive: spot checks.
    expect(tag.get('longs')?.isLongArray()).toBe(true);
    expect(tag.get('big')?.isDouble()).toBe(true);
    expect(tag.get('tiny')?.isFloat()).toBe(true);
    expect(tag.getString('quote')).toBe('say "hi" \\ back');
    expect(printed).toContain('long:-9007199254740993L');
    expect(printed).toContain('float:0.1f');
  });

  it("does not rely on deepslate's printer, which loses long arrays and large doubles", () => {
    const tag = parseSnbt('{longs:[L;1L,2L],big:1e+21d}');
    // deepslate 0.27.2 prints `[I;1L,2L]` and `1e+21`, which do not read back as the same tags.
    const printed = tag.toString();
    expect(printed).toContain('[I;1L,2L]');
    expect(() => parseSnbt(printed)).toThrow(/SNBT/);
    expect(parseSnbt(printSnbt(tag)).equals(tag)).toBe(true);
  });

  it('prints floats read from binary in their shortest form', () => {
    const tag = readNbt(writeNbt(parseSnbt('{f:0.1f,g:-2.5f}'))).root;
    expect(printSnbt(tag)).toBe('{f:0.1f,g:-2.5f}');
  });

  it('rejects text that is not one compound', () => {
    expect(() => parseSnbt('[1,2]')).toThrow(/SNBT/);
    expect(() => parseSnbt('{a:1} extra')).toThrow(/SNBT/);
    expect(() => parseSnbt('{a:')).toThrow(/SNBT/);
  });
});

describe('block states', () => {
  it('parses with and without namespace and prints properties sorted', () => {
    expect(parseBlockState('oak_stairs[half=bottom, facing=north]')).toEqual({
      name: 'minecraft:oak_stairs',
      properties: { half: 'bottom', facing: 'north' },
    });
    expect(parseBlockState('example:ruby_block')).toEqual({
      name: 'example:ruby_block',
      properties: {},
    });
    expect(canonicalBlockState('oak_stairs[half=bottom,facing=north]')).toBe(
      'minecraft:oak_stairs[facing=north,half=bottom]',
    );
    expect(printBlockState({ name: 'minecraft:stone', properties: {} })).toBe('minecraft:stone');
    expect(canonicalBlockState('stone[]')).toBe('minecraft:stone');
  });

  it('rejects malformed states', () => {
    for (const bad of ['', 'Stone', 'stone[facing]', 'stone[a=1,a=2]', 'stone[a=1']) {
      expect(() => parseBlockState(bad), bad).toThrow();
    }
  });
});

describe('varints', () => {
  it('round-trips small and multi-byte values', () => {
    const values = [0, 1, 127, 128, 300, 16_383, 16_384, 2_000_000];
    const bytes = encodeVarints(values);
    expect(bytes.every((byte) => byte >= -128 && byte <= 127)).toBe(true);
    expect(decodeVarints(bytes, values.length)).toEqual(values);
    expect(() => decodeVarints([-128], 1)).toThrow(/ends/);
  });
});

/** A template using every feature: block entity with every tag type, a jigsaw, an entity. */
const FULL: StructureTemplateData = {
  size: [3, 2, 3],
  palette: [
    'minecraft:stone',
    'minecraft:chest[facing=north,type=single,waterlogged=false]',
    'minecraft:jigsaw[orientation=north_up]',
  ],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 0, 2],
    [2, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0],
    [2, 0, 1, 0],
    [1, 1, 1, 1],
  ],
  block_entities: [{ pos: [1, 1, 1], nbt: printSnbt(parseSnbt(EVERY_TAG)) }],
  jigsaws: [
    {
      pos: [1, 0, 0],
      pool: 'example:streets',
      name: 'example:entrance',
      target: 'example:street',
      final_state: 'minecraft:stone',
      joint: 'rollable',
      placement_priority: 1,
      selection_priority: 2,
    },
  ],
  entities: [
    {
      pos: [1.5, 1, 2.25],
      block_pos: [1, 1, 2],
      nbt: '{id:"minecraft:armor_stand",Invisible:1b,Rotation:[90.0f,0.0f]}',
    },
  ],
};

describe('structure template NBT', () => {
  it('round-trips data → NBT → data deep-equal', () => {
    const root = structureTemplateToNbt(FULL, 4000);
    const back = structureTemplateFromNbt(readNbt(writeNbt(root)).root);
    expect(back.data).toEqual(FULL);
    expect(back.problems).toEqual([]);
    expect(back.dataVersion).toBe(4000);
  });

  it('writes vanilla fields: size, palette Name/Properties, blocks, entities, DataVersion', () => {
    const root = structureTemplateToNbt(FULL, 4000);
    expect([...root.keys()]).toEqual(['size', 'palette', 'blocks', 'entities', 'DataVersion']);
    const chest = root.getList('palette', 10).getCompound(1);
    expect(chest.getString('Name')).toBe('minecraft:chest');
    expect(chest.getCompound('Properties').getString('facing')).toBe('north');
    const jigsaw = root.getList('blocks', 10).getCompound(1).getCompound('nbt');
    expect(printSnbt(jigsaw)).toBe(
      '{name:"example:entrance",target:"example:street",pool:"example:streets",final_state:"minecraft:stone",joint:"rollable",placement_priority:1,selection_priority:2,id:"minecraft:jigsaw"}',
    );
  });

  it('sorts blocks by y, z, x on import and keeps the first of several palettes', () => {
    const palette = (name: string) =>
      new NbtList([new NbtCompound().set('Name', new NbtString(name))]);
    const block = (x: number, y: number, z: number) =>
      new NbtCompound()
        .set('pos', new NbtList([new NbtInt(x), new NbtInt(y), new NbtInt(z)]))
        .set('state', new NbtInt(0));
    const root = new NbtCompound()
      .set('size', new NbtList([new NbtInt(2), new NbtInt(2), new NbtInt(2)]))
      .set('palettes', new NbtList([palette('minecraft:stone'), palette('minecraft:dirt')]))
      .set('blocks', new NbtList([block(1, 1, 0), block(0, 0, 1), block(1, 0, 0), block(0, 0, 0)]))
      .set('entities', new NbtList())
      .set('DataVersion', new NbtInt(99_999));
    const result = structureTemplateFromNbt(root, { targetDataVersion: 5 });
    expect(result.data).toEqual({
      size: [2, 2, 2],
      palette: ['minecraft:stone'],
      blocks: [
        [0, 0, 0, 0],
        [1, 0, 0, 0],
        [0, 0, 1, 0],
        [1, 1, 0, 0],
      ],
    });
    expect(result.problems.map((problem) => problem.code)).toEqual([
      'structures.random-palettes',
      'structures.newer-data-version',
    ]);
  });

  it('reports templates over 48 blocks and rejects broken data', () => {
    const big = structureTemplateFromNbt(
      structureTemplateToNbt({ size: [49, 1, 1], palette: [], blocks: [] }, 1),
    );
    expect(big.problems.map((problem) => problem.code)).toEqual(['structures.template-too-large']);
    expect(() =>
      structureTemplateToNbt({ size: [1, 1, 1], palette: ['stone'], blocks: [[0, 0, 0, 1]] }, 1),
    ).toThrow(/palette index/);
    expect(() =>
      structureTemplateToNbt({ size: [1, 1, 1], palette: ['stone'], blocks: [[1, 0, 0, 0]] }, 1),
    ).toThrow(/outside/);
    expect(() =>
      structureTemplateToNbt({ ...FULL, block_entities: [{ pos: [2, 1, 2], nbt: '{}' }] }, 1),
    ).toThrow(/no block/);
    expect(() =>
      structureTemplateToNbt({ ...FULL, block_entities: [{ pos: [1, 1, 1], nbt: '{' }] }, 1),
    ).toThrow(/SNBT/);
    expect(() => structureTemplateFromNbt(new NbtCompound())).toThrow(/size/);
  });
});

describe('Sponge schematics', () => {
  it('writes Version 3 with structure void for absent positions', () => {
    const { root, problems } = schemFromStructureTemplate(FULL, 4000);
    expect(problems).toEqual([]);
    const schematic = root.getCompound('Schematic');
    expect(schematic.getNumber('Version')).toBe(3);
    expect(schematic.getNumber('DataVersion')).toBe(4000);
    expect([
      schematic.getNumber('Width'),
      schematic.getNumber('Height'),
      schematic.getNumber('Length'),
    ]).toEqual([3, 2, 3]);
    expect(schematic.getIntArray('Offset').map((item) => item.getAsNumber())).toEqual([0, 0, 0]);
    const palette = schematic.getCompound('Blocks').getCompound('Palette');
    expect([...palette.keys()]).toContain('minecraft:structure_void');
  });

  it('is byte-identical after one normalising pass (v3 → data → v3)', () => {
    const first = writeNbt(schemFromStructureTemplate(FULL, 4000).root);
    const once = structureTemplateFromSchem(readNbt(first).root);
    expect(once.version).toBe(3);
    expect(once.problems).toEqual([]);
    const second = writeNbt(schemFromStructureTemplate(once.data, 4000).root);
    const twice = structureTemplateFromSchem(readNbt(second).root);
    const third = writeNbt(schemFromStructureTemplate(twice.data, 4000).root);
    expect(third).toEqual(second);
    expect(twice.data).toEqual(once.data);
    // Blocks, jigsaws and block entity content survive the schematic route.
    expect(once.data.blocks).toEqual(FULL.blocks);
    expect(once.data.jigsaws).toEqual(FULL.jigsaws);
    // The schematic carries the block entity id separately; it comes back as the last key.
    expect(once.data.block_entities?.[0]?.nbt).toBe(
      `${FULL.block_entities?.[0]?.nbt.slice(0, -1)},id:"minecraft:chest"}`,
    );
    const entity = parseSnbt(once.data.block_entities?.[0]?.nbt ?? '{}');
    expect(entity.get('longs')?.isLongArray()).toBe(true);
    expect(once.data.entities).toEqual([
      {
        pos: [1.5, 1, 2.25],
        block_pos: [1, 1, 2],
        nbt: '{Invisible:1b,Rotation:[90.0f,0.0f],id:"minecraft:armor_stand"}',
      },
    ]);
  });

  it('imports a hand-built Version 2 file with the same blocks as its Version 3 twin', () => {
    // 2×1×2: stone, air / dirt, chest (block entity). Index = x + z·W + y·W·L.
    const palette = new NbtCompound()
      .set('minecraft:stone', new NbtInt(0))
      .set('minecraft:air', new NbtInt(1))
      .set('minecraft:dirt', new NbtInt(2))
      .set('minecraft:chest[facing=north,type=single,waterlogged=false]', new NbtInt(3));
    const data = new NbtByteArray(encodeVarints([0, 1, 2, 3]));
    const v2 = new NbtCompound()
      .set('Version', new NbtInt(2))
      .set('DataVersion', new NbtInt(3000))
      .set('Width', new NbtShort(2))
      .set('Height', new NbtShort(1))
      .set('Length', new NbtShort(2))
      .set('Offset', new NbtIntArray([5, 6, 7]))
      .set('PaletteMax', new NbtInt(4))
      .set('Palette', palette)
      .set('BlockData', data)
      .set(
        'BlockEntities',
        new NbtList([
          new NbtCompound()
            .set('Pos', new NbtIntArray([1, 0, 1]))
            .set('Id', new NbtString('minecraft:chest'))
            .set('Items', new NbtList()),
        ]),
      )
      .set(
        'Entities',
        new NbtList([
          new NbtCompound()
            .set('Pos', new NbtList([new NbtDouble(0.5), new NbtDouble(1), new NbtDouble(0.5)]))
            .set('Id', new NbtString('minecraft:pig')),
        ]),
      );
    const fromV2 = structureTemplateFromSchem(readNbt(writeNbt(v2, 'gzip', 'Schematic')).root);
    expect(fromV2.version).toBe(2);
    const v3 = schemFromStructureTemplate(fromV2.data, 3000).root;
    const fromV3 = structureTemplateFromSchem(readNbt(writeNbt(v3)).root);
    expect(fromV3.version).toBe(3);
    expect(fromV3.data).toEqual(fromV2.data);
    expect(fromV2.data).toEqual({
      size: [2, 1, 2],
      palette: [
        'minecraft:stone',
        'minecraft:air',
        'minecraft:dirt',
        'minecraft:chest[facing=north,type=single,waterlogged=false]',
      ],
      blocks: [
        [0, 0, 0, 0],
        [1, 0, 0, 1],
        [0, 0, 1, 2],
        [1, 0, 1, 3],
      ],
      block_entities: [{ pos: [1, 0, 1], nbt: '{Items:[],id:"minecraft:chest"}' }],
      entities: [{ pos: [0.5, 1, 0.5], block_pos: [0, 1, 0], nbt: '{id:"minecraft:pig"}' }],
    });
  });

  it('rejects unsupported versions', () => {
    const v1 = new NbtCompound().set('Version', new NbtInt(1));
    expect(() => structureTemplateFromSchem(v1)).toThrow(/version 1/);
  });
});
