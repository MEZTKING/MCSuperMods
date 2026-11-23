import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIpcHandlers } from '../../src/main/ipc';
import { createLocationResolver } from '../../src/main/platform/locations';
import { createMinecraftService, type MinecraftService } from '../../src/main/platform/minecraft';
import type { MainPlatform } from '../../src/main/platform/node-platform';
import { createSettingsStore, resolveMsmHome } from '../../src/main/platform/settings';
import {
  LANG_FILE_MAX_BYTES,
  namesFromLang,
  parseLangNames,
  readTargetNames,
  VANILLA_NAME_MAX_LENGTH,
} from '../../src/main/platform/vanilla-names';
import { InvokeChannels, ipcContract } from '../../src/shared/ipc-contract';

/**
 * `minecraft:names` (ADR 0124 D3, B656): the names of vanilla things from the cached
 * `en_us.json`. A made-up version id and a made-up lang file: no real target's, no Mojang text.
 */
const VERSION = '9.9-msm-test';

const LANG = {
  'block.minecraft.made_up_rock': 'Made-up Rock',
  'block.minecraft.made_up_rock.desc': 'Left out: not an id',
  'block.minecraft.banner.made_up.black': 'Left out: dotted',
  'item.minecraft.made_up_stick': 'Made-up Stick',
  'item.minecraft.potion.effect.made_up_brew': 'Potion of Made-up Brew',
  'entity.minecraft.made_up_beast': 'Made-up Beast',
  'entity.minecraft.made_up_beast.job': 'Left out: dotted',
  'biome.minecraft.made_up_fields': 'Made-up Fields',
  'effect.minecraft.made_up_glow': 'Made-up Glow',
  'enchantment.minecraft.made_up_edge': 'Made-up Edge',
  'subtitles.entity.made_up_beast.ambient': 'Made-up Beast hums',
  'gui.made_up': 'Left out: another prefix',
  'item.minecraft.made_up_number': 7,
  'item.minecraft.made_up_empty': '  ',
  'item.minecraft.made_up_control': 'Bad\u0007name',
  'item.minecraft.made_up_long': 'x'.repeat(VANILLA_NAME_MAX_LENGTH + 1),
  'item.minecraft.Made_Up_Upper': 'Left out: upper case',
};

let temp: string;
let msmHome: string;
let minecraftDir: string;
let service: MinecraftService;

const cacheDir = () => join(msmHome, 'cache', 'assets', VERSION);
const langPath = () => join(cacheDir(), 'assets', 'minecraft', 'lang', 'en_us.json');

async function installJar(lang: unknown): Promise<void> {
  const jar = zipSync({
    'assets/minecraft/lang/en_us.json': strToU8(JSON.stringify(lang)),
    'assets/minecraft/models/block/made_up_rock.json': strToU8('{}'),
  });
  await mkdir(join(minecraftDir, 'versions', VERSION), { recursive: true });
  await writeFile(join(minecraftDir, 'versions', VERSION, `${VERSION}.jar`), jar);
  await service.extract(VERSION);
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-names-'));
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

describe('vanilla names from the cached en_us.json (B656)', () => {
  it('answers null without a cache', async () => {
    expect(await service.readLangNames(VERSION)).toBeNull();
  });

  it('keeps the wanted keys by sort and checks every value', async () => {
    await installJar(LANG);
    const names = await service.readLangNames(VERSION);
    expect(names).toEqual({
      version: VERSION,
      blocks: { 'minecraft:made_up_rock': 'Made-up Rock' },
      items: { 'minecraft:made_up_stick': 'Made-up Stick' },
      entityTypes: { 'minecraft:made_up_beast': 'Made-up Beast' },
      biomes: { 'minecraft:made_up_fields': 'Made-up Fields' },
      effects: { 'minecraft:made_up_glow': 'Made-up Glow' },
      enchantments: { 'minecraft:made_up_edge': 'Made-up Edge' },
      potions: { 'minecraft:made_up_brew': 'Potion of Made-up Brew' },
      subtitles: { 'entity.made_up_beast.ambient': 'Made-up Beast hums' },
    });
    // The answer passes the contract.
    const { response } = ipcContract[InvokeChannels.minecraftNames];
    expect(response.safeParse(names).success).toBe(true);
  });

  it('answers null when the cache holds no lang file', async () => {
    await installJar(LANG);
    await unlink(langPath());
    expect(await service.readLangNames(VERSION)).toBeNull();
  });

  it('refuses a lang file linked out of the cache folder', async () => {
    await installJar(LANG);
    const outside = join(temp, 'outside.json');
    await writeFile(outside, JSON.stringify(LANG));
    await unlink(langPath());
    await symlink(outside, langPath());
    await expect(service.readLangNames(VERSION)).rejects.toThrow(/outside the asset cache/);
  });

  it('refuses a traversal in the version or the target id', async () => {
    await expect(service.readLangNames('../9.9-msm-test')).rejects.toThrow(/single path segment/);
    await expect(service.readLangNames('a/b')).rejects.toThrow(/single path segment/);
    const read = (mcVersion: string) => service.readLangNames(mcVersion);
    await expect(readTargetNames(read, '../../etc')).rejects.toThrow(/Unknown target/);
    await expect(readTargetNames(read, 'mc-0.0')).rejects.toThrow(/Unknown target/);
    const { request } = ipcContract[InvokeChannels.minecraftNames];
    expect(request.safeParse({ targetId: 'mc-26.3' }).success).toBe(true);
    for (const targetId of ['../x', 'a/b', 'a\\b', '', '.hidden', 'Mc-26.3']) {
      expect(request.safeParse({ targetId }).success, targetId).toBe(false);
    }
  });

  it('refuses a lang file that is too large or not an object', () => {
    expect(() => parseLangNames(new Uint8Array(LANG_FILE_MAX_BYTES + 1), VERSION)).toThrow(
      /too large/,
    );
    expect(() => parseLangNames(strToU8('[1]'), VERSION)).toThrow(/not a JSON object/);
    expect(() => parseLangNames(strToU8('{'), VERSION)).toThrow(/not valid JSON/);
    expect(() => namesFromLang(null, VERSION)).toThrow(/not a JSON object/);
  });

  it('serves minecraft:names through the IPC handlers by target', async () => {
    await installJar(LANG);
    const asked: string[] = [];
    const minecraft = {
      readLangNames: (mcVersion: string) => {
        asked.push(mcVersion);
        return service.readLangNames(VERSION);
      },
    };
    const handlers = createIpcHandlers(
      { minecraft } as unknown as MainPlatform,
      {} as never,
      {} as never,
      {} as never,
    );
    const context = { sendProgress() {}, sender: {} as never };
    const names = await handlers[InvokeChannels.minecraftNames]({ targetId: 'mc-26.3' }, context);
    expect(asked).toEqual(['26.3']);
    expect(names?.blocks['minecraft:made_up_rock']).toBe('Made-up Rock');
    await expect(
      handlers[InvokeChannels.minecraftNames]({ targetId: 'mc-0.0' }, context),
    ).rejects.toThrow(/Unknown target/);
  });
});
