import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import {
  NbtCompound,
  NbtFile,
  NbtInt,
  NbtIntArray,
  NbtList,
  NbtLong,
  NbtString,
  type NbtTag,
} from 'deepslate/nbt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIpcHandlers } from '../../src/main/ipc';
import { createLocationResolver } from '../../src/main/platform/locations';
import type { MainPlatform } from '../../src/main/platform/node-platform';
import { createSettingsStore } from '../../src/main/platform/settings';
import {
  createTryItWorldsService,
  MANAGED_GAME_FOLDER_ID,
  type TryItWorldsService,
} from '../../src/main/platform/try-it-worlds';
import { InvokeChannels, ipcContract } from '../../src/shared/ipc-contract';

let temp: string;
let minecraftDir: string;

/** A synthetic gzip `level.dat` (never a Mojang file). */
function levelDat(name: string, spawn: [number, number, number], dataVersion = 4440): Uint8Array {
  const data = new NbtCompound()
    .set('LevelName', new NbtString(name))
    .set('DataVersion', new NbtInt(dataVersion))
    .set('LastPlayed', new NbtLong(BigInt(Date.UTC(2026, 10, 1 + spawn[1] / 100))))
    .set('Version', new NbtCompound().set('Name', new NbtString('9.9-msm-test')))
    .set(
      'spawn',
      new NbtCompound()
        .set('dimension', new NbtString('minecraft:overworld'))
        .set('pos', new NbtIntArray(spawn)),
    );
  return new NbtFile('', new NbtCompound().set('Data', data), 'gzip', false, undefined).write();
}

/** A full chunk: one block state per section, `stone` below section 4 (y < 64), air above. */
function chunk(cx: number, cz: number, top: string): Uint8Array {
  const sections = new NbtList<NbtTag>();
  for (let y = -4; y <= 19; y += 1) {
    const state = y < 3 ? 'minecraft:stone' : y === 3 ? top : 'minecraft:air';
    sections.add(
      new NbtCompound()
        .set('Y', new NbtInt(y))
        .set(
          'block_states',
          new NbtCompound().set(
            'palette',
            new NbtList([new NbtCompound().set('Name', new NbtString(state))]),
          ),
        ),
    );
  }
  const root = new NbtCompound()
    .set('DataVersion', new NbtInt(4440))
    .set('xPos', new NbtInt(cx))
    .set('zPos', new NbtInt(cz))
    .set('Status', new NbtString('minecraft:full'))
    .set('sections', sections);
  return new NbtFile('', root, 'none', false, undefined).write();
}

/** A region file holding the given chunks (zlib), keyed by world chunk coordinates. */
function region(chunks: [number, number, Uint8Array][]): Uint8Array {
  const parts: Uint8Array[] = [];
  const header = new Uint8Array(8192);
  let sector = 2;
  for (const [cx, cz, nbt] of chunks) {
    const data = deflateSync(nbt);
    const sectors = Math.ceil((data.length + 5) / 4096);
    const stored = new Uint8Array(sectors * 4096);
    new DataView(stored.buffer).setUint32(0, data.length + 1);
    stored[4] = 2;
    stored.set(data, 5);
    new DataView(header.buffer).setUint32(
      (((cz & 31) << 5) | (cx & 31)) * 4,
      (sector << 8) | sectors,
    );
    parts.push(stored);
    sector += sectors;
  }
  const out = new Uint8Array(sector * 4096);
  out.set(header);
  let offset = 8192;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Writes a save with the four regions around (0, 0); `top` fills section 3 (y 48..63). */
async function makeWorld(
  gameDir: string,
  folder: string,
  options: {
    name?: string;
    spawn?: [number, number, number];
    top?: string;
    dataVersion?: number;
    icon?: boolean;
  } = {},
): Promise<string> {
  const world = join(gameDir, 'saves', folder);
  await mkdir(join(world, 'region'), { recursive: true });
  await writeFile(
    join(world, 'level.dat'),
    levelDat(options.name ?? folder, options.spawn ?? [0, 64, 0], options.dataVersion),
  );
  const top = options.top ?? 'minecraft:grass_block';
  for (const [rx, rz] of [
    [-1, -1],
    [-1, 0],
    [0, -1],
    [0, 0],
  ] as const) {
    const chunks: [number, number, Uint8Array][] = [];
    for (let i = 0; i < 4; i += 1) {
      const cx = rx * 32 + (rx < 0 ? 32 - 1 - (i & 1) : i & 1);
      const cz = rz * 32 + (rz < 0 ? 32 - 1 - (i >> 1) : i >> 1);
      chunks.push([cx, cz, chunk(cx, cz, top)]);
    }
    await writeFile(join(world, 'region', `r.${rx}.${rz}.mca`), region(chunks));
  }
  if (options.icon) await writeFile(join(world, 'icon.png'), new Uint8Array([137, 80, 78, 71]));
  return world;
}

async function serviceFor(managed: string | null = null): Promise<TryItWorldsService> {
  const fs = createNodeInstallFileSystem();
  const installEnv = { platform: 'linux', home: join(temp, 'home') };
  const settings = createSettingsStore({ msmHome: join(temp, 'msm-home'), installEnv });
  await settings.set({ minecraftDir });
  return createTryItWorldsService({
    locations: createLocationResolver({ fs, env: installEnv, settings }),
    managedGameDir: () => managed,
  });
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-tryit-worlds-'));
  minecraftDir = join(temp, 'minecraft');
  await mkdir(join(minecraftDir, 'saves'), { recursive: true });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('Try it worlds', () => {
  it('lists worlds with name, folder, game folder, last played and icon', async () => {
    await makeWorld(minecraftDir, 'Castle', {
      name: 'Castle Build',
      spawn: [0, 200, 0],
      icon: true,
    });
    await makeWorld(minecraftDir, 'Old', { dataVersion: 2730 });
    await mkdir(join(minecraftDir, 'saves', 'Empty'));
    const service = await serviceFor();
    const worlds = await service.listWorlds();
    expect(worlds.map((world) => [world.folder, world.name, world.readable])).toEqual([
      ['Castle', 'Castle Build', true],
      ['Old', 'Old', false],
    ]);
    const castle = worlds[0];
    expect(castle?.id).toBe('official:default/Castle');
    expect(castle?.gameFolder).toEqual({
      id: 'official:default',
      name: 'Official launcher',
      selected: true,
    });
    expect(castle?.lastPlayed).toBe('2026-11-03T00:00:00.000Z');
    expect(castle?.versionName).toBe('9.9-msm-test');
    expect(castle?.icon).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(worlds[1]?.icon).toBeNull();
    expect(ipcContract[InvokeChannels.tryItListWorlds].response.safeParse(worlds).success).toBe(
      true,
    );
  });

  it('lists the seed of each world from world_gen_settings.dat (B574 WS17)', async () => {
    const settings = (seed: bigint) =>
      new NbtFile(
        '',
        new NbtCompound().set('data', new NbtCompound().set('seed', new NbtLong(seed))),
        'gzip',
        false,
        undefined,
      ).write();
    for (const [folder, seed] of [
      ['Plus', 12345n],
      ['Minus', -7046235981325167892n],
    ] as const) {
      const world = await makeWorld(minecraftDir, folder);
      await mkdir(join(world, 'data', 'minecraft'), { recursive: true });
      await writeFile(join(world, 'data', 'minecraft', 'world_gen_settings.dat'), settings(seed));
    }
    await makeWorld(minecraftDir, 'NoSettings');
    const worlds = await (await serviceFor()).listWorlds();
    const seeds = Object.fromEntries(worlds.map((world) => [world.folder, world.seed]));
    expect(seeds).toEqual({
      Plus: '12345',
      Minus: '-7046235981325167892',
      NoSettings: null,
    });
    expect(ipcContract[InvokeChannels.tryItListWorlds].response.safeParse(worlds).success).toBe(
      true,
    );
  });

  it('reads the area around the spawn from level.dat', async () => {
    await makeWorld(minecraftDir, 'Flat', { spawn: [5, 64, -3], top: 'minecraft:sand' });
    const service = await serviceFor();
    const area = await service.readArea({ worldId: 'official:default/Flat', centre: 'spawn' });
    // Highest block at the centre is sand at y 63 (sand fills 48..63): the area runs from 55 to 86.
    expect(area.origin).toEqual({ x: 5 - 24, y: 55, z: -3 - 24 });
    expect(area.palette).toEqual(['minecraft:air', 'minecraft:sand']);
    const at = (x: number, y: number, z: number) =>
      area.palette[area.blocks[(y * 48 + z) * 48 + x] ?? 0];
    expect(at(0, 0, 0)).toBe('minecraft:sand');
    expect(at(47, 8, 47)).toBe('minecraft:sand');
    expect(at(10, 9, 10)).toBe('minecraft:air');
    expect(area.skipped.missingChunks).toBe(0);
    expect(ipcContract[InvokeChannels.tryItReadArea].response.safeParse(area).success).toBe(true);

    const typed = await service.readArea({
      worldId: 'official:default/Flat',
      centre: { x: 100, z: 100 },
    });
    expect(typed.origin.x).toBe(76);
    expect(typed.skipped.missingChunks).toBe(16);
    expect(typed.warnings[0]).toMatch(/not generated yet/);
  });

  it('never reads outside saves/', async () => {
    await makeWorld(minecraftDir, 'Real');
    // A world folder that is a symlink to a save elsewhere is not listed or read.
    const elsewhere = join(temp, 'elsewhere');
    await makeWorld(elsewhere, 'Outside');
    await symlink(join(elsewhere, 'saves', 'Outside'), join(minecraftDir, 'saves', 'Linked'));
    // A region file that is a symlink out of the world folder is refused.
    const sneaky = await makeWorld(minecraftDir, 'Sneaky');
    await rm(join(sneaky, 'region', 'r.0.0.mca'));
    await symlink(
      join(elsewhere, 'saves', 'Outside', 'region', 'r.0.0.mca'),
      join(sneaky, 'region', 'r.0.0.mca'),
    );
    const service = await serviceFor();
    const folders = (await service.listWorlds()).map((world) => world.folder).sort();
    expect(folders).toEqual(['Real', 'Sneaky']);
    await expect(
      service.readArea({ worldId: 'official:default/Linked', centre: 'spawn' }),
    ).rejects.toThrow(/tryit\.unknown-world/);
    await expect(
      service.readArea({ worldId: 'official:default/Sneaky', centre: 'spawn' }),
    ).rejects.toThrow(/tryit\.read-failed: .*outside the world folder/);
    for (const worldId of [
      'official:default/..',
      'official:default/../../elsewhere',
      'nowhere/Real',
      '/Real',
    ]) {
      await expect(service.readArea({ worldId, centre: 'spawn' })).rejects.toThrow(
        /tryit\.unknown-world/,
      );
    }
    // Reading never writes: the save holds the same files afterwards.
    expect((await readdir(join(minecraftDir, 'saves', 'Real'))).sort()).toEqual([
      'level.dat',
      'region',
    ]);
  });

  it('reports a world saved before 1.18 plainly', async () => {
    await makeWorld(minecraftDir, 'Old', { dataVersion: 2730 });
    const service = await serviceFor();
    await expect(
      service.readArea({ worldId: 'official:default/Old', centre: 'spawn' }),
    ).rejects.toThrow(/tryit\.old-format: .*1\.18 or later/);
  });

  it('includes the managed Play instance once', async () => {
    const instance = join(temp, 'prism', 'instances', 'MCSuperMods Test (9.9-msm-test)');
    const gameDir = join(instance, 'minecraft');
    await makeWorld(gameDir, 'msm-test-ruby');
    const service = await serviceFor(gameDir);
    const worlds = await service.listWorlds();
    const managed = worlds.find((world) => world.folder === 'msm-test-ruby');
    expect(managed?.id).toBe(`${MANAGED_GAME_FOLDER_ID}/msm-test-ruby`);
    expect(managed?.gameFolder.name).toBe('MCSuperMods Test (9.9-msm-test)');
    const area = await service.readArea({ worldId: managed?.id ?? '', centre: 'spawn' });
    expect(area.origin.y).toBe(55);
    // Pointing the managed folder at the official one does not list it twice.
    const same = await serviceFor(minecraftDir);
    await makeWorld(minecraftDir, 'Once');
    expect((await same.listWorlds()).filter((world) => world.folder === 'Once')).toHaveLength(1);
  });

  it('serves both channels through the IPC handlers', async () => {
    await makeWorld(minecraftDir, 'Flat');
    const tryItWorlds = await serviceFor();
    const handlers = createIpcHandlers(
      { tryItWorlds } as unknown as MainPlatform,
      {} as never,
      {} as never,
      {} as never,
    );
    const context = { sendProgress() {}, sender: {} as never };
    const worlds = await handlers[InvokeChannels.tryItListWorlds](undefined, context);
    expect(worlds.map((world) => world.id)).toEqual(['official:default/Flat']);
    const request = ipcContract[InvokeChannels.tryItReadArea].request.parse({
      worldId: 'official:default/Flat',
      centre: { x: 0, z: 0 },
    });
    const area = await handlers[InvokeChannels.tryItReadArea](request, context);
    expect(area.blocks).toBeInstanceOf(Uint16Array);
    expect(area.size).toEqual({ x: 48, y: 32, z: 48 });
  });
});
