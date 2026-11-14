import type { JsonObject, OutputFile } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  classifyChanges,
  type DevJarFacts,
  type DevNext,
  type DevOutputSource,
  devPathClass,
  hashOutputs,
  type InstalledDevRecord,
  installedDevRecord,
  installedFiles,
  overlayAfterReload,
  overlayTarget,
  restartReasonKey,
  webCryptoSha256,
} from '../../src/index';

const facts = { worldDataFolders: ['worldgen', 'dimension_type', 'enchantment'] };
const jar: DevJarFacts = {
  modId: 'ruby',
  runtime: '1.4.0',
  fabricApi: '0.140.0+9.1',
  modJson: 'c'.repeat(64),
};
const text = (s: string) => new TextEncoder().encode(s);

function block(events: JsonObject, components: JsonObject = {}): JsonObject {
  return { components, events };
}

/** A small project: a block with an event, a function, a script, a texture, sounds, a biome. */
function project(
  overrides: Partial<Record<string, OutputFile['contents'] | null>> = {},
): DevOutputSource[] {
  const base: Record<
    string,
    { layer: OutputFile['layer']; contents: OutputFile['contents']; elementId?: string }
  > = {
    'msm/ruby/block/lamp.json': {
      layer: 'msm',
      contents: block(
        { glow: { actions: [{ type: 'play_sound', sound: 'ruby:ding' }] } },
        {
          'msm:on_interact': { event: 'glow' },
        },
      ),
      elementId: 'lamp',
    },
    'msm/ruby/item/gem.json': { layer: 'msm', contents: { components: {} }, elementId: 'gem' },
    'data/ruby/function/hello.mcfunction': { layer: 'datapack', contents: text('say hi\n') },
    'msm/ruby/script/main.ts': { layer: 'msm', contents: text('msm.log("hi");\n') },
    'assets/ruby/textures/block/lamp.png': {
      layer: 'resourcepack',
      contents: new Uint8Array([1, 2, 3]),
    },
    'assets/ruby/sounds.json': {
      layer: 'resourcepack',
      contents: { ding: { sounds: ['ruby:ding'] } },
    },
    'data/ruby/worldgen/biome/glade.json': { layer: 'datapack', contents: { temperature: 0.5 } },
  };
  const out: DevOutputSource[] = [];
  for (const [path, file] of Object.entries(base)) {
    const override = overrides[path];
    if (override === null) continue;
    out.push({
      path,
      layer: file.layer,
      contents: override ?? file.contents,
      ...(file.elementId ? { elementId: file.elementId } : {}),
    });
  }
  for (const [path, contents] of Object.entries(overrides)) {
    if (path in base || contents === null || contents === undefined) continue;
    const layer = path.startsWith('assets/')
      ? 'resourcepack'
      : path.startsWith('data/')
        ? 'datapack'
        : 'msm';
    out.push({ path, layer, contents });
  }
  return out;
}

async function installedFrom(files: DevOutputSource[]): Promise<InstalledDevRecord> {
  return installedDevRecord(jar, installedFiles(await hashOutputs(files, webCryptoSha256)));
}

async function nextFrom(files: DevOutputSource[], nextJar: DevJarFacts = jar): Promise<DevNext> {
  return { jar: nextJar, files: await hashOutputs(files, webCryptoSha256) };
}

describe('devPathClass', () => {
  it('sorts jar paths', () => {
    const w = facts.worldDataFolders;
    expect(devPathClass('msm/ruby/block/lamp.json', w)).toBe('definition');
    expect(devPathClass('msm/ruby/loot_addition/a/b.json', w)).toBe('definition');
    expect(devPathClass('msm/ruby/script/a/main.ts', w)).toBe('script');
    expect(devPathClass('msm/ruby/other/x.json', w)).toBe('mod-file');
    expect(devPathClass('assets/ruby/sounds.json', w)).toBe('sounds');
    expect(devPathClass('assets/ruby/lang/en_us.json', w)).toBe('asset');
    expect(devPathClass('data/ruby/recipe/gem.json', w)).toBe('data');
    expect(devPathClass('data/ruby/worldgen/biome/glade.json', w)).toBe('world-data');
    expect(devPathClass('data/ruby/enchantment/zap.json', w)).toBe('world-data');
    expect(devPathClass('data/ruby/enchantment_provider/x.json', w)).toBe('data');
    expect(devPathClass('fabric.mod.json', w)).toBe('mod-file');
  });
});

describe('hashOutputs', () => {
  it('hashes JSON values as stable text and adds the frozen part for definitions and sounds', async () => {
    const a = await hashOutputs(
      [
        {
          path: 'msm/ruby/item/gem.json',
          layer: 'msm',
          contents: { b: 1, a: 2 },
          elementId: 'gem',
        },
      ],
      webCryptoSha256,
    );
    const b = await hashOutputs(
      [
        {
          path: 'msm/ruby/item/gem.json',
          layer: 'msm',
          contents: text('{\n  "a": 2,\n  "b": 1\n}\n'),
        },
      ],
      webCryptoSha256,
    );
    expect(a[0]?.sha256).toBe(b[0]?.sha256);
    expect(a[0]?.frozen).toMatch(/^[0-9a-f]{64}$/);
    expect(a[0]?.element).toBe('gem');
    const plain = await hashOutputs(
      [{ path: 'data/ruby/function/x.mcfunction', layer: 'datapack', contents: text('say x') }],
      webCryptoSha256,
    );
    expect(plain[0]?.frozen).toBeUndefined();
  });
});

describe('classifyChanges', () => {
  it('finds nothing to do for the installed project', async () => {
    const files = project();
    const changes = classifyChanges(await installedFrom(files), await nextFrom(files), facts);
    expect(changes).toEqual({
      reload: { data: [], scripts: [], events: [], assets: [] },
      reopenWorld: [],
      restart: [],
      stale: [],
      pending: 0,
    });
  });

  it('reloads data, scripts, assets, events-only edits and sound changes in place', async () => {
    const installed = await installedFrom(project());
    const next = await nextFrom(
      project({
        'data/ruby/function/hello.mcfunction': text('say hello\n'),
        'data/ruby/recipe/gem.json': { type: 'minecraft:crafting_shapeless' },
        'msm/ruby/script/main.ts': text('msm.log("hello");\n'),
        'assets/ruby/textures/block/lamp.png': new Uint8Array([9]),
        'assets/ruby/sounds.json': { ding: { sounds: ['ruby:ding2'] } },
        'msm/ruby/block/lamp.json': block(
          { glow: { actions: [{ type: 'play_sound', sound: 'ruby:other' }] } },
          { 'msm:on_interact': { event: 'glow' } },
        ),
      }),
    );
    const changes = classifyChanges(installed, next, facts);
    expect(changes.restart).toEqual([]);
    expect(changes.reopenWorld).toEqual([]);
    expect(changes.reload.data).toEqual([
      { path: 'data/ruby/function/hello.mcfunction', change: 'changed' },
      { path: 'data/ruby/recipe/gem.json', change: 'added' },
    ]);
    expect(changes.reload.scripts).toEqual([
      { path: 'msm/ruby/script/main.ts', change: 'changed' },
    ]);
    expect(changes.reload.events).toEqual([
      { path: 'msm/ruby/block/lamp.json', change: 'changed', elementId: 'lamp' },
    ]);
    expect(changes.reload.assets.map((c) => c.path)).toEqual([
      'assets/ruby/sounds.json',
      'assets/ruby/textures/block/lamp.png',
    ]);
    expect(changes.pending).toBe(6);
  });

  it('asks to reopen the world for world data', async () => {
    const installed = await installedFrom(project());
    const next = await nextFrom(
      project({ 'data/ruby/worldgen/biome/glade.json': { temperature: 0.9 } }),
    );
    const changes = classifyChanges(installed, next, facts);
    expect(changes.reopenWorld).toEqual([
      { path: 'data/ruby/worldgen/biome/glade.json', change: 'changed' },
    ]);
    expect(changes.restart).toEqual([]);
    expect(changes.pending).toBe(1);
  });

  it('needs a restart for a component change, a new trigger, a new definition or a removed file', async () => {
    const installed = await installedFrom(project());
    const next = await nextFrom(
      project({
        'msm/ruby/block/lamp.json': block(
          { glow: { actions: [] }, broken: { actions: [] } },
          { 'msm:on_interact': { event: 'glow' }, 'msm:on_break': { event: 'broken' } },
        ),
        'msm/ruby/block/new_lamp.json': block({}),
        'data/ruby/function/hello.mcfunction': null,
        'data/ruby/function/fine.mcfunction': text('say fine\n'),
      }),
    );
    const changes = classifyChanges(installed, next, facts);
    expect(changes.restart).toEqual([
      { reason: 'file-removed', path: 'data/ruby/function/hello.mcfunction' },
      {
        reason: 'definition-changed',
        path: 'msm/ruby/block/lamp.json',
        kind: 'block',
        elementId: 'lamp',
      },
      { reason: 'new-definition', path: 'msm/ruby/block/new_lamp.json', kind: 'block' },
    ]);
    // The in-place part still reloads.
    expect(changes.reload.data).toEqual([
      { path: 'data/ruby/function/fine.mcfunction', change: 'added' },
    ]);
    expect(restartReasonKey('new-definition')).toBe('play.restart.new-definition');
  });

  it('names a renamed definition once, by its element', async () => {
    const installed = await installedFrom(project());
    const files = project({ 'msm/ruby/item/gem.json': null });
    files.push({
      path: 'msm/ruby/item/jewel.json',
      layer: 'msm',
      contents: { components: {} },
      elementId: 'gem',
    });
    const changes = classifyChanges(installed, await nextFrom(files), facts);
    expect(changes.restart).toEqual([
      {
        reason: 'definition-renamed',
        path: 'msm/ruby/item/jewel.json',
        from: 'msm/ruby/item/gem.json',
        kind: 'item',
        elementId: 'gem',
      },
    ]);
  });

  it('needs a restart for new sound events, other mod files and jar changes', async () => {
    const installed = await installedFrom(project());
    const next = await nextFrom(
      project({
        'assets/ruby/sounds.json': {
          ding: { sounds: ['ruby:ding'] },
          dong: { sounds: ['ruby:dong'] },
        },
        'msm/ruby/unknown/x.json': {},
      }),
      { ...jar, runtime: '1.5.0', fabricApi: '0.141.0+9.1', modJson: 'd'.repeat(64) },
    );
    const changes = classifyChanges(installed, next, facts);
    expect(changes.restart.map((r) => [r.reason, r.path])).toEqual([
      ['sound-events', 'assets/ruby/sounds.json'],
      ['fabric-api-version', 'fabric.mod.json'],
      ['mod-file', 'fabric.mod.json'],
      ['runtime-version', 'fabric.mod.json'],
      ['mod-file', 'msm/ruby/unknown/x.json'],
    ]);
    const renamedMod = classifyChanges(
      installed,
      await nextFrom(project(), { ...jar, modId: 'gems' }),
      facts,
    );
    expect(renamedMod.restart).toEqual([{ reason: 'mod-id', path: 'fabric.mod.json' }]);
  });

  it('counts only what differs from the current overlay and lists stale overlay files', async () => {
    const installed = await installedFrom(project());
    const edited = await nextFrom(
      project({
        'data/ruby/function/hello.mcfunction': text('say hello\n'),
        'msm/ruby/script/main.ts': text('msm.log("hello");\n'),
      }),
    );
    const first = classifyChanges(installed, edited, facts);
    expect(first.pending).toBe(2);
    const afterReload = { ...installed, overlay: overlayAfterReload(first, edited) };
    expect(Object.keys(afterReload.overlay)).toEqual([
      'data/ruby/function/hello.mcfunction',
      'msm/ruby/script/main.ts',
    ]);
    // Nothing new: the same overlay is wanted.
    const again = classifyChanges(afterReload, edited, facts);
    expect(again.pending).toBe(0);
    expect(again.stale).toEqual([]);
    // The script edit is undone: its overlay copy goes, the function stays.
    const reverted = await nextFrom(
      project({ 'data/ruby/function/hello.mcfunction': text('say hello\n') }),
    );
    const third = classifyChanges(afterReload, reverted, facts);
    expect(third.reload.scripts).toEqual([]);
    expect(third.stale).toEqual(['msm/ruby/script/main.ts']);
    expect(third.pending).toBe(1);
  });
});

describe('overlayTarget', () => {
  it('maps each reloadable file to its place in the game folder', () => {
    const w = facts.worldDataFolders;
    expect(overlayTarget('data/ruby/function/a.mcfunction', 'msm-test-ruby', w)).toBe(
      'saves/msm-test-ruby/datapacks/msm-dev/data/ruby/function/a.mcfunction',
    );
    expect(overlayTarget('data/ruby/worldgen/biome/glade.json', 'msm-test-ruby', w)).toBe(
      'saves/msm-test-ruby/datapacks/msm-dev/data/ruby/worldgen/biome/glade.json',
    );
    expect(overlayTarget('assets/ruby/lang/en_us.json', 'msm-test-ruby', w)).toBe(
      'resourcepacks/msm-dev/assets/ruby/lang/en_us.json',
    );
    expect(overlayTarget('msm/ruby/script/a/main.ts', 'msm-test-ruby', w)).toBe(
      'msm-dev/overlay/msm/ruby/script/a/main.js',
    );
    expect(overlayTarget('msm/ruby/block/lamp.json', 'msm-test-ruby', w)).toBe(
      'msm-dev/overlay/msm/ruby/block/lamp.json',
    );
    expect(overlayTarget('fabric.mod.json', 'msm-test-ruby', w)).toBeUndefined();
  });
});
