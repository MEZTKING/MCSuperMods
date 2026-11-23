import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STRUCTURE_TEMPLATE_MAX_BYTES as INTEROP_TEMPLATE_MAX_BYTES,
  STRUCTURE_TEMPLATES_MAX_TOTAL_BYTES as INTEROP_TEMPLATES_MAX_TOTAL_BYTES,
  STRUCTURE_TEMPLATES_MAX_IDS,
} from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { gzipSync, strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocationResolver } from '../src/main/platform/locations';
import { createMinecraftService, type MinecraftService } from '../src/main/platform/minecraft';
import { createSettingsStore, resolveMsmHome } from '../src/main/platform/settings';
import {
  InvokeChannels,
  ipcContract,
  STRUCTURE_TEMPLATE_IDS_MAX,
  STRUCTURE_TEMPLATE_MAX_BYTES,
  STRUCTURE_TEMPLATES_MAX_TOTAL_BYTES,
} from '../src/shared/ipc-contract';

/**
 * The jar's structure templates in the cache (ADR 0122, Live views 4; B636, the B634 spike's
 * 4S6): extracted in bulk at schema 7 and read back by id through `minecraft:structureTemplates`.
 * A made-up version id and made-up gzipped bytes: no real target's, and no Mojang file.
 */
const VERSION = '9.9-msm-test';

const gz = (text: string) => gzipSync(strToU8(text), { mtime: 0 });
const HUT = gz('msm made-up hut template');
const TOWER = gz('msm made-up tower template');

function structureJar(): Uint8Array {
  return zipSync({
    'assets/minecraft/lang/en_us.json': strToU8('{}'),
    'data/minecraft/structure/made_up/hut.nbt': HUT,
    'data/minecraft/structure/made_up/towers/tower_1.nbt': TOWER,
    'data/minecraft/structure/made_up/notes.json': strToU8('{}'),
    'data/minecraft/structures/made_up/old.nbt': gz('old folder name'),
    'data/msm_other/structure/made_up/hut.nbt': gz('another namespace'),
  });
}

let temp: string;
let msmHome: string;
let minecraftDir: string;
let service: MinecraftService;

const cacheDir = () => join(msmHome, 'cache', 'assets', VERSION);
const jarPath = () => join(minecraftDir, 'versions', VERSION, `${VERSION}.jar`);

async function installJar(jar: Uint8Array): Promise<void> {
  await mkdir(join(minecraftDir, 'versions', VERSION), { recursive: true });
  await writeFile(jarPath(), jar);
}

/** Every file below `dir`, as `/`-separated paths relative to it. */
async function filesBelow(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(dir.length + 1)
        .split('\\')
        .join('/'),
    )
    .sort();
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-structures-'));
  msmHome = resolveMsmHome({ MSM_HOME: join(temp, 'msm-home') }, join(temp, 'home'));
  minecraftDir = join(temp, 'minecraft');
  await mkdir(minecraftDir, { recursive: true });
  const installEnv = { platform: 'linux', home: join(temp, 'home') };
  const settings = createSettingsStore({ msmHome, installEnv });
  await settings.set({ minecraftDir });
  const fs = createNodeInstallFileSystem();
  service = createMinecraftService({
    msmHome,
    fs,
    locations: createLocationResolver({ fs, env: installEnv, settings }),
    now: () => '2026-01-01T00:00:00.000Z',
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('vanilla structure templates (ADR 0122, B636)', () => {
  it('answers "not set up" without a jar or a cache', async () => {
    expect(await service.readStructureTemplates(VERSION, ['minecraft:made_up/hut'])).toBeNull();
    await expect(service.extract(VERSION)).rejects.toThrow(/not installed/);
    expect(await service.readStructureTemplates(VERSION, ['minecraft:made_up/hut'])).toBeNull();
  });

  it('extracts the templates in bulk and nothing else of their folders', async () => {
    await installJar(structureJar());
    const info = await service.extract(VERSION);
    expect(info.schemaVersion).toBe(7);
    expect(info.fileCount).toBe(3);
    expect(await filesBelow(cacheDir())).toEqual([
      'assets/minecraft/lang/en_us.json',
      'cache.json',
      'data/minecraft/structure/made_up/hut.nbt',
      'data/minecraft/structure/made_up/towers/tower_1.nbt',
    ]);
  });

  it('reads templates by id as the bytes the jar stores', async () => {
    await installJar(structureJar());
    await service.extract(VERSION);
    const answer = await service.readStructureTemplates(VERSION, [
      'minecraft:made_up/hut',
      'minecraft:made_up/towers/tower_1',
      'minecraft:made_up/none',
      'minecraft:made_up/hut',
    ]);
    expect(answer).toEqual({
      version: VERSION,
      templates: { 'minecraft:made_up/hut': HUT, 'minecraft:made_up/towers/tower_1': TOWER },
      missing: ['minecraft:made_up/none'],
      refused: [],
    });
    expect(ipcContract[InvokeChannels.minecraftStructureTemplates].response.parse(answer)).toEqual(
      answer,
    );
  });

  it('refuses ids that are not vanilla template ids, before reading anything', async () => {
    for (const id of [
      'minecraft:../cache',
      'minecraft:made_up/../../x',
      'other:a',
      'minecraft:A',
    ]) {
      await expect(service.readStructureTemplates(VERSION, [id]), id).rejects.toThrow(
        /template id/,
      );
    }
    const many = Array.from({ length: STRUCTURE_TEMPLATES_MAX_IDS + 1 }, (_, i) => `t${i}`);
    await expect(service.readStructureTemplates(VERSION, many)).rejects.toThrow(/At most/);
    expect(
      ipcContract[InvokeChannels.minecraftStructureTemplates].request.safeParse({
        mcVersion: VERSION,
        ids: ['minecraft:../cache'],
      }).success,
    ).toBe(false);
  });

  it('refuses a cached file linked out of the cache folder', async () => {
    await installJar(structureJar());
    await service.extract(VERSION);
    const outside = join(temp, 'outside.nbt');
    await writeFile(outside, gz('not in the cache'));
    await symlink(
      outside,
      join(cacheDir(), 'data', 'minecraft', 'structure', 'made_up', 'link.nbt'),
    );
    const answer = await service.readStructureTemplates(VERSION, ['minecraft:made_up/link']);
    expect(answer?.templates).toEqual({});
    expect(answer?.refused).toEqual(['minecraft:made_up/link']);
  });

  it('extracts a schema 6 cache again by itself while its jar is there', async () => {
    await installJar(structureJar());
    await mkdir(cacheDir(), { recursive: true });
    await writeFile(
      join(cacheDir(), 'cache.json'),
      JSON.stringify({
        version: VERSION,
        jarSha1: 'old',
        jarPath: jarPath(),
        dataFolders: [],
        fileCount: 1,
        byteCount: 2,
        extractedAt: '2026-01-01T00:00:00.000Z',
        schemaVersion: 6,
      }),
    );
    let status = await service.status(VERSION);
    expect(status.cache).toBeNull();
    expect(status.cacheOutdated).toBe(true);
    expect(await service.readStructureTemplates(VERSION, ['minecraft:made_up/hut'])).toBeNull();
    await service.extract(VERSION);
    status = await service.status(VERSION);
    expect(status.cache?.schemaVersion).toBe(7);
    expect(status.cacheOutdated).toBe(false);
    const answer = await service.readStructureTemplates(VERSION, ['minecraft:made_up/hut']);
    expect(answer?.templates['minecraft:made_up/hut']).toEqual(HUT);
  });

  it("keeps the contract's limits equal to interop's", () => {
    expect(STRUCTURE_TEMPLATE_IDS_MAX).toBe(STRUCTURE_TEMPLATES_MAX_IDS);
    expect(STRUCTURE_TEMPLATE_MAX_BYTES).toBe(INTEROP_TEMPLATE_MAX_BYTES);
    expect(STRUCTURE_TEMPLATES_MAX_TOTAL_BYTES).toBe(INTEROP_TEMPLATES_MAX_TOTAL_BYTES);
  });

  it('stay in the cache: only the pieces reader asks for them, and no exporter or AI code', async () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const sources = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { recursive: true, withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
        .map((entry) => join(entry.parentPath, entry.name));
    };
    const names = /readStructureTemplates|minecraftStructureTemplates|vanilla-pieces/;
    const offenders: string[] = [];
    for (const folder of [
      'app/src/renderer/src/ai',
      'app/src/main/ai',
      'packages/ai/src',
      'packages/exporters/src',
      'packages/core/src',
    ]) {
      for (const file of await sources(join(root, folder))) {
        if (names.test(await readFile(file, 'utf8'))) offenders.push(file);
      }
    }
    const reader = join('liveviews', 'structures', 'vanilla-pieces.ts');
    for (const file of await sources(join(root, 'app', 'src', 'renderer', 'src'))) {
      if (file.endsWith(reader)) continue;
      if (/readStructureTemplates/.test(await readFile(file, 'utf8'))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
