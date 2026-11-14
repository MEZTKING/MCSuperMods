import { NbtCompound, NbtString } from 'deepslate/nbt';
import { describe, expect, it } from 'vitest';
import {
  bitsForPalette,
  blockStateString,
  isFullChunk,
  ChunkFormatError,
  decompressChunk,
  locateChunk,
  parseChunk,
  RegionFormatError,
  readLevelSummary,
  readWorldArea,
  sectionIndexAt,
  type WorldArea,
  WorldReadError,
} from '../../src/index';
import {
  at,
  buildRegion,
  type ChunkSpec,
  chunkNbt,
  entityChunkNbt,
  levelDat,
  MemorySave,
  type SectionSpec,
  type StoredSpec,
  stateCompound,
} from './encoder';

const AIR = 'minecraft:air';

/** The block state at world `(x, y, z)` of an area, or `undefined` outside it. */
function stateAt(area: WorldArea, x: number, y: number, z: number): string | undefined {
  const gx = x - area.origin.x;
  const gy = y - area.origin.y;
  const gz = z - area.origin.z;
  if (gx < 0 || gy < 0 || gz < 0 || gx >= 48 || gy >= 32 || gz >= 48) return undefined;
  return area.palette[area.blocks[(gy * area.size.z + gz) * area.size.x + gx] ?? 0];
}

/**
 * A flat chunk: sections -4..19 (the Overworld's -64..319), stone up to `ground - 1`, grass
 * at `ground`, air above, plus single blocks at world positions.
 */
function flatChunk(
  cx: number,
  cz: number,
  ground = 60,
  marks: { x: number; y: number; z: number; state: string }[] = [],
  extra: Partial<ChunkSpec> = {},
): ChunkSpec {
  const sections: SectionSpec[] = [];
  for (let sy = -4; sy <= 19; sy += 1) {
    const palette = [AIR, 'minecraft:stone', 'minecraft:grass_block[snowy=false]'];
    const indexes = new Uint16Array(4096);
    let used = false;
    for (let ly = 0; ly < 16; ly += 1) {
      const y = sy * 16 + ly;
      const value = y < ground ? 1 : y === ground ? 2 : 0;
      if (value !== 0) used = true;
      for (let i = 0; i < 256; i += 1) indexes[(ly << 8) | i] = value;
    }
    for (const mark of marks) {
      if (mark.x >> 4 !== cx || mark.z >> 4 !== cz || mark.y >> 4 !== sy) continue;
      let index = palette.indexOf(mark.state);
      if (index === -1) index = palette.push(mark.state) - 1;
      indexes[at(mark.x & 15, mark.y & 15, mark.z & 15)] = index;
      used = true;
    }
    sections.push(used ? { y: sy, palette, indexes } : { y: sy, palette: [AIR] });
  }
  return { sections, ...extra };
}

/** A save with flat chunks for every chunk in the given ranges. */
function flatSave(
  chunkXs: [number, number],
  chunkZs: [number, number],
  options: {
    ground?: number;
    marks?: { x: number; y: number; z: number; state: string }[];
    skip?: string[];
    stored?: (key: string) => Partial<StoredSpec>;
    level?: Parameters<typeof levelDat>[0];
  } = {},
): MemorySave {
  const save = new MemorySave();
  save.files.set('level.dat', levelDat(options.level ?? { spawn: { x: 0, y: 61, z: 0 } }));
  const chunks = new Map<string, StoredSpec>();
  for (let cz = chunkZs[0]; cz <= chunkZs[1]; cz += 1) {
    for (let cx = chunkXs[0]; cx <= chunkXs[1]; cx += 1) {
      const key = `${cx},${cz}`;
      if (options.skip?.includes(key)) continue;
      chunks.set(key, {
        nbt: chunkNbt(cx, cz, flatChunk(cx, cz, options.ground, options.marks ?? [])),
        ...options.stored?.(key),
      });
    }
  }
  save.addChunks(chunks);
  return save;
}

describe('block states and palettes', () => {
  it('writes properties sorted by key', () => {
    expect(
      blockStateString(
        stateCompound(
          'minecraft:oak_stairs[waterlogged=false,shape=straight,half=bottom,facing=north]',
        ),
      ),
    ).toBe('minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]');
    expect(blockStateString(stateCompound('minecraft:stone'))).toBe('minecraft:stone');
  });

  it('reads all three palette entry forms of the reference pack (region.state)', () => {
    const palette = [AIR, 'minecraft:stone', 'minecraft:leaf_litter[facing=east,segment_amount=3]'];
    const indexes = Uint16Array.from({ length: 4096 }, (_, i) => i % 3);
    for (const form of ['Name', 'id', 'string'] as const) {
      const chunk = parseChunk(chunkNbt(0, 0, { sections: [{ y: 0, palette, indexes, form }] }));
      // A reader that knows only `Name` turns every 26.x `{ id, properties }` entry into air.
      expect(chunk.sections.get(0)?.palette, form).toEqual(palette);
    }
    expect(blockStateString(stateCompound('stone', 'id'))).toBe('minecraft:stone');
    expect(blockStateString(new NbtString('oak_log[axis=y]'))).toBe('minecraft:oak_log[axis=y]');
    expect(blockStateString(new NbtCompound().set('', new NbtString('minecraft:dirt')))).toBe(
      'minecraft:dirt',
    );
  });

  it('reads the status under Status or status, and a chunk with none as full', () => {
    const sections = [{ y: 0, palette: ['minecraft:stone'] }];
    expect(parseChunk(chunkNbt(0, 0, { sections, statusKey: 'status' })).status).toBe(
      'minecraft:full',
    );
    const none = parseChunk(chunkNbt(0, 0, { sections, statusKey: null }));
    expect(none.status).toBe('');
    expect(isFullChunk(none.status)).toBe(true);
    expect(isFullChunk('minecraft:features')).toBe(false);
    expect(isFullChunk('full')).toBe(true);
  });

  it('uses max(4, ceil(log2 n)) bits per entry', () => {
    expect([1, 2, 16, 17, 256, 257, 300, 4096].map(bitsForPalette)).toEqual([
      0, 4, 4, 5, 8, 9, 9, 12,
    ]);
  });

  for (const size of [1, 2, 17, 300]) {
    it(`reads a section with a palette of ${size}`, () => {
      const palette = Array.from({ length: size }, (_, i) =>
        i === 0 ? AIR : `minecraft:test_${i}[n=${i}]`,
      );
      const indexes = Uint16Array.from({ length: 4096 }, (_, i) => (i * 7919) % size);
      const chunk = parseChunk(chunkNbt(0, 0, { sections: [{ y: 3, palette, indexes }] }));
      const section = chunk.sections.get(3);
      expect(section?.palette).toEqual(palette);
      for (let i = 0; i < 4096; i += 1) {
        const x = i & 15;
        const z = (i >> 4) & 15;
        const y = i >> 8;
        expect(sectionIndexAt(section ?? { palette, data: null, bits: 0 }, x, y, z)).toBe(
          indexes[i],
        );
      }
    });
  }

  it('refuses a chunk in the pre-1.18 layout', () => {
    expect(() => parseChunk(chunkNbt(0, 0, { sections: [], oldLayout: true }))).toThrow(
      ChunkFormatError,
    );
    expect(() => parseChunk(chunkNbt(0, 0, { sections: [], dataVersion: 2730 }))).toThrow(
      /before Minecraft 1.18/,
    );
  });
});

describe('region files', () => {
  it('finds chunks, reports missing ones and reads every compression', () => {
    const nbt = chunkNbt(1, 2, { sections: [{ y: 0, palette: ['minecraft:stone'] }] });
    const { region, external } = buildRegion(
      new Map<string, StoredSpec>([
        ['1,2', { nbt, compression: 'gzip' }],
        ['2,2', { nbt, compression: 'none' }],
        ['3,2', { nbt, compression: 'zlib', external: true }],
        ['4,2', { nbt, compression: 'lz4' }],
      ]),
    );
    expect(locateChunk(region, 0, 0)).toBeNull();
    const gzip = locateChunk(region, 1, 2);
    expect(gzip?.compression).toBe(1);
    expect(decompressChunk(1, gzip?.payload ?? new Uint8Array())).toEqual(nbt);
    const none = locateChunk(region, 2, 2);
    expect(decompressChunk(3, none?.payload ?? new Uint8Array())).toEqual(nbt);
    const ext = locateChunk(region, 3, 2);
    expect(ext).toMatchObject({ external: true, compression: 2 });
    expect(decompressChunk(2, external.get('c.3.2.mcc') ?? new Uint8Array())).toEqual(nbt);
    const lz4 = locateChunk(region, 4, 2);
    expect(() => decompressChunk(lz4?.compression ?? 0, lz4?.payload ?? new Uint8Array())).toThrow(
      /LZ4/,
    );
    expect(locateChunk(new Uint8Array(), 0, 0)).toBeNull();
    expect(() => locateChunk(new Uint8Array(100), 0, 0)).toThrow(RegionFormatError);
    expect(() => locateChunk(region.subarray(0, 8192 + 10), 1, 2)).toThrow(RegionFormatError);
  });
});

describe('level.dat', () => {
  it('reads the 1.21.9+ spawn compound and the older SpawnX/SpawnZ', () => {
    expect(
      readLevelSummary(levelDat({ spawn: { x: 5, y: 70, z: -9 }, lastPlayed: 1_700_000_000_000n })),
    ).toEqual({
      name: 'Test World',
      dataVersion: 4440,
      versionName: '9.9-msm-test',
      lastPlayed: 1_700_000_000_000,
      spawn: { x: 5, y: 70, z: -9, dimension: 'minecraft:overworld' },
    });
    expect(
      readLevelSummary(levelDat({ spawn: { x: 1, y: 2, z: 3 }, legacySpawn: true }))?.spawn,
    ).toEqual({ x: 1, y: 2, z: 3, dimension: 'minecraft:overworld' });
    expect(readLevelSummary(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('readWorldArea', () => {
  it('reads an area spanning four regions around the spawn, quickly', async () => {
    // Centre (0, 0): X and Z from -24 to 23, chunks -2..1, regions -1 and 0 on each axis.
    const marks = [
      { x: -1, y: 61, z: -1, state: 'minecraft:diamond_block' },
      { x: 0, y: 61, z: 0, state: 'minecraft:gold_block' },
      { x: -24, y: 61, z: -24, state: 'minecraft:oak_stairs[facing=east,half=top]' },
      { x: 23, y: 61, z: 23, state: 'minecraft:cave_air' },
      { x: 15, y: 61, z: 16, state: 'minecraft:emerald_block' },
    ];
    const save = flatSave([-3, 2], [-3, 2], { marks });
    expect([...save.files.keys()].filter((path) => path.endsWith('.mca')).sort()).toEqual([
      'region/r.-1.-1.mca',
      'region/r.-1.0.mca',
      'region/r.0.-1.mca',
      'region/r.0.0.mca',
    ]);
    // Warm the module code once, then time a fresh read.
    await readWorldArea(save.read, save.dir, { centre: 'spawn' });
    const started = performance.now();
    const area = await readWorldArea(save.read, `${save.dir}/`, { centre: 'spawn' });
    const elapsed = performance.now() - started;
    console.log(`readWorldArea over 4 regions: ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(300);

    expect(area.format).toBe(1);
    expect(area.world).toBe('Test World');
    expect(area.dataVersion).toBe(4440);
    expect(area.size).toEqual({ x: 48, y: 32, z: 48 });
    // Highest block at the centre column is the gold block at 61: from 53 up.
    expect(area.origin).toEqual({ x: -24, y: 53, z: -24 });
    expect(area.blocks.length).toBe(48 * 48 * 32);
    expect(area.palette[0]).toBe(AIR);
    expect(stateAt(area, -1, 61, -1)).toBe('minecraft:diamond_block');
    expect(stateAt(area, 0, 61, 0)).toBe('minecraft:gold_block');
    expect(stateAt(area, -24, 61, -24)).toBe('minecraft:oak_stairs[facing=east,half=top]');
    expect(stateAt(area, 15, 61, 16)).toBe('minecraft:emerald_block');
    expect(stateAt(area, 23, 61, 23)).toBe(AIR);
    expect(stateAt(area, 23, 60, 23)).toBe('minecraft:grass_block[snowy=false]');
    expect(stateAt(area, 5, 53, -20)).toBe('minecraft:stone');
    expect(stateAt(area, 5, 84, -20)).toBe(AIR);
    expect(area.palette).not.toContain('minecraft:cave_air');
    expect(new Set(area.palette).size).toBe(area.palette.length);
    expect(area.skipped).toEqual({ blockEntities: 0, entities: 0, missingChunks: 0 });
    expect(area.warnings).toEqual([]);
    // Each region file is read once.
    expect(save.reads.filter((path) => path === `${save.dir}/region/r.0.0.mca`)).toHaveLength(2);
  });

  it('reads a 26.x save whose Overworld lives under dimensions/minecraft/overworld', async () => {
    const save = flatSave([-2, 1], [-2, 1], {
      marks: [{ x: 0, y: 61, z: 0, state: 'minecraft:gold_block' }],
    });
    for (const [path, bytes] of [...save.files]) {
      if (!path.startsWith('region/')) continue;
      save.files.delete(path);
      save.files.set(`dimensions/minecraft/overworld/${path}`, bytes);
    }
    const area = await readWorldArea(save.read, save.dir, { centre: 'spawn' });
    expect(stateAt(area, 0, 61, 0)).toBe('minecraft:gold_block');
    expect(area.skipped.missingChunks).toBe(0);
  });

  it('reads chunks that are not generated as air, with a warning', async () => {
    const save = flatSave([-2, 1], [-2, 1], { skip: ['0,0', '-1,0'] });
    // A chunk that is only partly generated counts as missing too.
    const partial = new Map<string, StoredSpec>([
      ['1,1', { nbt: chunkNbt(1, 1, flatChunk(1, 1, 60, [], { status: 'minecraft:noise' })) }],
    ]);
    const regionPath = 'region/r.0.0.mca';
    const merged = new Map<string, StoredSpec>();
    for (let cz = 0; cz <= 1; cz += 1) {
      for (let cx = 0; cx <= 1; cx += 1) {
        const key = `${cx},${cz}`;
        if (key === '0,0') continue;
        merged.set(key, partial.get(key) ?? { nbt: chunkNbt(cx, cz, flatChunk(cx, cz)) });
      }
    }
    save.files.set(regionPath, buildRegion(merged).region);
    const area = await readWorldArea(save.read, save.dir, { centre: { x: 0.7, z: -0.2 } });
    expect(area.origin.x).toBe(-24);
    expect(area.origin.z).toBe(-25);
    expect(area.skipped.missingChunks).toBe(3);
    expect(area.warnings[0]).toMatch(/3 chunks of the area are not generated yet/);
    expect(stateAt(area, 3, 59, 3)).toBe(AIR);
    expect(stateAt(area, -10, 59, -10)).toBe('minecraft:stone');
  });

  it('reads gzip, uncompressed and external chunks, and warns about LZ4', async () => {
    const kinds: Record<string, Partial<StoredSpec>> = {
      '-1,-1': { compression: 'gzip' },
      '0,-1': { compression: 'none' },
      '-1,0': { external: true },
      '1,1': { compression: 'lz4' },
    };
    const save = flatSave([-2, 1], [-2, 1], {
      marks: [{ x: -5, y: 61, z: 3, state: 'minecraft:glass' }],
      stored: (key) => kinds[key] ?? {},
    });
    expect(save.files.has('region/c.-1.0.mcc')).toBe(true);
    const area = await readWorldArea(save.read, save.dir, { centre: 'spawn' });
    expect(stateAt(area, -5, 61, 3)).toBe('minecraft:glass');
    expect(stateAt(area, -5, 55, -5)).toBe('minecraft:stone');
    expect(stateAt(area, 5, 55, -5)).toBe('minecraft:stone');
    expect(stateAt(area, 20, 55, 20)).toBe(AIR);
    expect(area.skipped.missingChunks).toBe(1);
    expect(area.warnings.join('\n')).toMatch(/Chunk 1, 1 reads as air: .*LZ4/);
  });

  it('refuses a world saved before 1.18 and warns about old chunks in a newer one', async () => {
    const old = flatSave([-2, 1], [-2, 1], {
      level: { dataVersion: 2730, versionName: '1.17.1' },
    });
    await expect(readWorldArea(old.read, old.dir, { centre: 'spawn' })).rejects.toMatchObject({
      code: 'old-format',
      message: expect.stringMatching(/1\.17\.1.*1\.18 or later/),
    });

    const mixed = flatSave([-2, 1], [-2, 1]);
    const merged = new Map<string, StoredSpec>();
    for (let cz = 0; cz <= 1; cz += 1) {
      for (let cx = 0; cx <= 1; cx += 1) {
        merged.set(`${cx},${cz}`, {
          nbt: chunkNbt(
            cx,
            cz,
            cx === 1 && cz === 1 ? { sections: [], oldLayout: true } : flatChunk(cx, cz),
          ),
        });
      }
    }
    mixed.files.set('region/r.0.0.mca', buildRegion(merged).region);
    const area = await readWorldArea(mixed.read, mixed.dir, { centre: 'spawn' });
    expect(area.skipped.missingChunks).toBe(1);
    expect(area.warnings.join('\n')).toMatch(/saved before Minecraft 1.18/);
  });

  it('clamps the height to the world', async () => {
    const high = flatSave([-2, 1], [-2, 1], {
      marks: [{ x: 0, y: 318, z: 0, state: 'minecraft:glowstone' }],
    });
    const top = await readWorldArea(high.read, high.dir, { centre: 'spawn' });
    expect(top.origin.y).toBe(319 - 31);
    expect(stateAt(top, 0, 318, 0)).toBe('minecraft:glowstone');

    const low = flatSave([-2, 1], [-2, 1], { ground: -62 });
    const bottom = await readWorldArea(low.read, low.dir, { centre: 'spawn' });
    expect(bottom.origin.y).toBe(-64);
    expect(stateAt(bottom, 3, -62, 3)).toBe('minecraft:grass_block[snowy=false]');
    expect(stateAt(bottom, 3, -64, 3)).toBe('minecraft:stone');
  });

  it('centres on the spawn or on typed coordinates', async () => {
    const save = flatSave([2, 6], [-8, -4], {
      level: { spawn: { x: 70, y: 64, z: -100 } },
      marks: [{ x: 70, y: 61, z: -100, state: 'minecraft:bell' }],
    });
    const spawn = await readWorldArea(save.read, save.dir, { centre: 'spawn' });
    expect(spawn.origin).toEqual({ x: 46, y: 53, z: -124 });
    const typed = await readWorldArea(save.read, save.dir, { centre: { x: 80, z: -90 } });
    expect(typed.origin).toEqual({ x: 56, y: 52, z: -114 });

    const legacy = flatSave([-2, 1], [-2, 1], {
      level: { spawn: { x: 10, y: 64, z: 10 }, legacySpawn: true },
    });
    expect((await readWorldArea(legacy.read, legacy.dir, { centre: 'spawn' })).origin.x).toBe(-14);

    const nether = flatSave([-2, 1], [-2, 1], {
      level: { spawn: { x: 500, y: 64, z: 500, dimension: 'minecraft:the_nether' } },
    });
    const fallback = await readWorldArea(nether.read, nether.dir, { centre: 'spawn' });
    expect(fallback.origin.x).toBe(-24);
    expect(fallback.warnings[0]).toMatch(/only the Overworld/);
  });

  it('counts block entities and entities in the area without importing them', async () => {
    const save = new MemorySave();
    save.files.set('level.dat', levelDat({ spawn: { x: 0, y: 64, z: 0 } }));
    const chunks = new Map<string, StoredSpec>();
    for (let cz = -2; cz <= 1; cz += 1) {
      for (let cx = -2; cx <= 1; cx += 1) {
        chunks.set(`${cx},${cz}`, {
          nbt: chunkNbt(
            cx,
            cz,
            flatChunk(cx, cz, 60, [], {
              blockEntities:
                cx === 0 && cz === 0
                  ? [
                      { x: 1, y: 61, z: 1 },
                      { x: 2, y: 200, z: 2 },
                    ]
                  : [],
            }),
          ),
        });
      }
    }
    save.addChunks(chunks);
    save.addChunks(
      new Map<string, StoredSpec>([
        [
          '-1,-1',
          {
            nbt: entityChunkNbt([
              [-3.5, 61, -3.5],
              [-30, 61, -3],
            ]),
          },
        ],
        ['0,0', { nbt: entityChunkNbt([[4.2, 62, 4.9]]) }],
      ]),
      'entities',
    );
    const area = await readWorldArea(save.read, save.dir, { centre: 'spawn' });
    expect(area.skipped).toEqual({ blockEntities: 1, entities: 2, missingChunks: 0 });
    expect(area.warnings).toEqual([
      'Not brought in: 1 block entity (chest contents, signs and the like) and 2 entities (mobs, items, frames).',
    ]);
  });

  it('fails plainly without level.dat or when a file cannot be read', async () => {
    const empty = new MemorySave();
    await expect(readWorldArea(empty.read, empty.dir, { centre: 'spawn' })).rejects.toMatchObject({
      code: 'no-level-dat',
    });

    const save = flatSave([-2, 1], [-2, 1]);
    const failing = async (path: string) => {
      if (path.endsWith('.mca')) throw new Error('EBUSY: resource busy or locked');
      return save.read(path);
    };
    const error = await readWorldArea(failing, save.dir, { centre: 'spawn' }).catch((e) => e);
    expect(error).toBeInstanceOf(WorldReadError);
    expect(error.code).toBe('read-failed');
    expect(error.message).toMatch(/EBUSY.*open in Minecraft can still be read/);
  });

  it('uses the given inflate function', async () => {
    const save = flatSave([-2, 1], [-2, 1]);
    const formats: string[] = [];
    const { fflateInflate } = await import('../../src/index');
    await readWorldArea(save.read, save.dir, {
      centre: 'spawn',
      inflate: (data, format) => {
        formats.push(format);
        return fflateInflate(data, format);
      },
    });
    expect(formats.length).toBe(16);
  });
});
