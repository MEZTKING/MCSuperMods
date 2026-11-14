/**
 * A small Anvil encoder for tests: builds 1.18+ chunk NBT, region files and `level.dat` from
 * plain descriptions, so no Mojang save data is committed.
 */
import {
  NbtCompound,
  NbtDouble,
  NbtFile,
  NbtInt,
  NbtIntArray,
  NbtList,
  NbtLong,
  NbtLongArray,
  NbtString,
  type NbtTag,
} from 'deepslate/nbt';
import { gzipSync, zlibSync } from 'fflate';

/**
 * The three palette entry forms of the reference pack's `region.state()`: `{ Name, Properties }`
 * (older), `{ id, properties }` (26.x) and a bare string.
 */
export type PaletteForm = 'Name' | 'id' | 'string';

/** Turns `minecraft:oak_stairs[half=bottom,facing=north]` into a palette compound. */
export function stateCompound(state: string, form: 'Name' | 'id' = 'Name'): NbtCompound {
  const bracket = state.indexOf('[');
  const compound = new NbtCompound().set(
    form === 'id' ? 'id' : 'Name',
    new NbtString(bracket === -1 ? state : state.slice(0, bracket)),
  );
  if (bracket !== -1) {
    const properties = new NbtCompound();
    for (const pair of state.slice(bracket + 1, -1).split(',')) {
      const [key, value] = pair.split('=');
      properties.set(key ?? '', new NbtString(value ?? ''));
    }
    compound.set(form === 'id' ? 'properties' : 'Properties', properties);
  }
  return compound;
}

/** A palette entry in `form`. */
export function paletteEntry(state: string, form: PaletteForm = 'Name'): NbtTag {
  return form === 'string' ? new NbtString(state) : stateCompound(state, form);
}

/** Packs 4,096 palette indexes the 1.16+ way (no spanning), with an explicit bit count. */
export function packIndexes(indexes: ArrayLike<number>, bits: number): bigint[] {
  const perLong = Math.floor(64 / bits);
  const longs: bigint[] = [];
  for (let start = 0; start < 4096; start += perLong) {
    let value = 0n;
    for (let j = 0; j < perLong && start + j < 4096; j += 1) {
      value |= BigInt(indexes[start + j] ?? 0) << BigInt(j * bits);
    }
    longs.push(BigInt.asIntN(64, value));
  }
  return longs;
}

/** A section: its Y, palette and, for more than one entry, an index per block (YZX order). */
export interface SectionSpec {
  y: number;
  palette: string[];
  indexes?: ArrayLike<number>;
  /** How the palette entries are written (default `Name`). */
  form?: PaletteForm;
}

/** A chunk description. */
export interface ChunkSpec {
  dataVersion?: number;
  status?: string;
  /** The key the status is saved under (default `Status`); `null` saves none. */
  statusKey?: 'Status' | 'status' | null;
  sections: SectionSpec[];
  blockEntities?: { x: number; y: number; z: number; id?: string }[];
  /** Write the pre-1.18 `Level` wrapper instead (for refusal tests). */
  oldLayout?: boolean;
}

/** The section index of local `(x, y, z)`. */
export const at = (x: number, y: number, z: number): number => (y << 8) | (z << 4) | x;

function bitsFor(size: number): number {
  return size <= 1 ? 0 : Math.max(4, Math.ceil(Math.log2(size)));
}

/** Uncompressed chunk NBT bytes. */
export function chunkNbt(cx: number, cz: number, spec: ChunkSpec): Uint8Array {
  const sections = new NbtList<NbtTag>();
  for (const section of spec.sections) {
    const states = new NbtCompound().set(
      'palette',
      new NbtList<NbtTag>(section.palette.map((state) => paletteEntry(state, section.form))),
    );
    const bits = bitsFor(section.palette.length);
    if (bits > 0) {
      states.set('data', new NbtLongArray(packIndexes(section.indexes ?? [], bits)));
    }
    sections.add(new NbtCompound().set('Y', new NbtInt(section.y)).set('block_states', states));
  }
  const blockEntities = new NbtList<NbtTag>(
    (spec.blockEntities ?? []).map((entity) =>
      new NbtCompound()
        .set('id', new NbtString(entity.id ?? 'minecraft:chest'))
        .set('x', new NbtInt(entity.x))
        .set('y', new NbtInt(entity.y))
        .set('z', new NbtInt(entity.z)),
    ),
  );
  const body = new NbtCompound()
    .set('xPos', new NbtInt(cx))
    .set('zPos', new NbtInt(cz))
    .set('yPos', new NbtInt(-4))
    .set('sections', sections)
    .set('block_entities', blockEntities);
  const statusKey = spec.statusKey === undefined ? 'Status' : spec.statusKey;
  if (statusKey !== null) body.set(statusKey, new NbtString(spec.status ?? 'minecraft:full'));
  const root = spec.oldLayout
    ? new NbtCompound().set('Level', body).set('DataVersion', new NbtInt(spec.dataVersion ?? 2730))
    : body.set('DataVersion', new NbtInt(spec.dataVersion ?? 4440));
  return new NbtFile('', root, 'none', false, undefined).write();
}

/** Entity chunk NBT bytes (`entities/` region). */
export function entityChunkNbt(positions: [number, number, number][]): Uint8Array {
  const entities = new NbtList<NbtTag>(
    positions.map(([x, y, z]) =>
      new NbtCompound()
        .set('id', new NbtString('minecraft:pig'))
        .set('Pos', new NbtList([new NbtDouble(x), new NbtDouble(y), new NbtDouble(z)])),
    ),
  );
  return new NbtFile(
    '',
    new NbtCompound().set('Entities', entities).set('DataVersion', new NbtInt(4440)),
    'none',
    false,
    undefined,
  ).write();
}

/** A stored chunk: NBT bytes and how to compress them. */
export interface StoredSpec {
  nbt: Uint8Array;
  compression?: 'gzip' | 'zlib' | 'none' | 'lz4';
  /** Store in `c.<x>.<z>.mcc` (the returned `external` map holds its bytes). */
  external?: boolean;
}

/** Builds a region file; chunks are keyed by world chunk coordinates `"cx,cz"`. */
export function buildRegion(chunks: Map<string, StoredSpec>): {
  region: Uint8Array;
  external: Map<string, Uint8Array>;
} {
  const header = new Uint8Array(8192);
  const body: Uint8Array[] = [];
  const external = new Map<string, Uint8Array>();
  let sector = 2;
  for (const [key, spec] of chunks) {
    const [cx, cz] = key.split(',').map(Number) as [number, number];
    const compression = spec.compression ?? 'zlib';
    const type = { gzip: 1, zlib: 2, none: 3, lz4: 4 }[compression];
    const data =
      compression === 'gzip'
        ? gzipSync(spec.nbt)
        : compression === 'zlib'
          ? zlibSync(spec.nbt)
          : spec.nbt;
    let stored: Uint8Array;
    if (spec.external) {
      external.set(`c.${cx}.${cz}.mcc`, data);
      stored = new Uint8Array(5);
      new DataView(stored.buffer).setUint32(0, 1);
      stored[4] = type | 128;
    } else {
      stored = new Uint8Array(5 + data.length);
      new DataView(stored.buffer).setUint32(0, data.length + 1);
      stored[4] = type;
      stored.set(data, 5);
    }
    const sectors = Math.ceil(stored.length / 4096);
    const padded = new Uint8Array(sectors * 4096);
    padded.set(stored);
    const index = ((cz & 31) << 5) | (cx & 31);
    new DataView(header.buffer).setUint32(index * 4, (sector << 8) | sectors);
    body.push(padded);
    sector += sectors;
  }
  const region = new Uint8Array(sector * 4096);
  region.set(header);
  let offset = 8192;
  for (const part of body) {
    region.set(part, offset);
    offset += part.length;
  }
  return { region, external };
}

/** A gzip `level.dat`; `spawn` uses the 1.21.9+ compound unless `legacySpawn`. */
export function levelDat(options: {
  name?: string;
  dataVersion?: number;
  versionName?: string;
  spawn?: { x: number; y: number; z: number; dimension?: string };
  legacySpawn?: boolean;
  lastPlayed?: bigint;
}): Uint8Array {
  const data = new NbtCompound()
    .set('LevelName', new NbtString(options.name ?? 'Test World'))
    .set('DataVersion', new NbtInt(options.dataVersion ?? 4440))
    .set(
      'Version',
      new NbtCompound().set('Name', new NbtString(options.versionName ?? '9.9-msm-test')),
    );
  if (options.lastPlayed !== undefined) data.set('LastPlayed', new NbtLong(options.lastPlayed));
  const spawn = options.spawn;
  if (spawn !== undefined) {
    if (options.legacySpawn) {
      data
        .set('SpawnX', new NbtInt(spawn.x))
        .set('SpawnY', new NbtInt(spawn.y))
        .set('SpawnZ', new NbtInt(spawn.z));
    } else {
      data.set(
        'spawn',
        new NbtCompound()
          .set('dimension', new NbtString(spawn.dimension ?? 'minecraft:overworld'))
          .set('pos', new NbtIntArray([spawn.x, spawn.y, spawn.z])),
      );
    }
  }
  return new NbtFile('', new NbtCompound().set('Data', data), 'gzip', false, undefined).write();
}

/** An in-memory save: paths relative to the world folder. */
export class MemorySave {
  readonly files = new Map<string, Uint8Array>();
  readonly reads: string[] = [];
  readonly dir: string;
  constructor(dir = '/saves/world') {
    this.dir = dir;
  }

  /** Adds the region file(s) holding these chunks (keyed `"cx,cz"`), under `folder`. */
  addChunks(chunks: Map<string, StoredSpec>, folder = 'region'): void {
    const byRegion = new Map<string, Map<string, StoredSpec>>();
    for (const [key, spec] of chunks) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      const name = `r.${cx >> 5}.${cz >> 5}.mca`;
      const group = byRegion.get(name) ?? new Map<string, StoredSpec>();
      group.set(key, spec);
      byRegion.set(name, group);
    }
    for (const [name, group] of byRegion) {
      const { region, external } = buildRegion(group);
      this.files.set(`${folder}/${name}`, region);
      for (const [file, bytes] of external) this.files.set(`${folder}/${file}`, bytes);
    }
  }

  /** The reader {@link readWorldArea} takes. */
  readonly read = async (path: string): Promise<Uint8Array | null> => {
    this.reads.push(path);
    const prefix = `${this.dir}/`;
    if (!path.startsWith(prefix)) throw new Error(`Read outside the save: ${path}`);
    return this.files.get(path.slice(prefix.length)) ?? null;
  };
}
