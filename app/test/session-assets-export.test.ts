import { createMemoryFileSystem, utf8 } from '@msm/core';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { makePng } from './helpers/synthetic-jar';
import { defaultTarget, newSession } from './session-fixture';

async function rubyProject(options: Parameters<typeof newSession>[1] = {}) {
  const fs = createMemoryFileSystem();
  const { session, calls } = newSession(fs, options);
  await session.newProject();
  session.addElement({ id: 'demo:block/ruby_block', kind: 'minecraft:model' });
  await session.importAssets(
    'demo',
    [{ name: 'ruby_block.png', data: makePng() }],
    'textures/block',
  );
  return { fs, session, calls };
}

describe('ProjectSession: assets', () => {
  it('imports a PNG texture: bytes on disk and an undoable record', async () => {
    const { fs, session } = await rubyProject();
    expect(fs.list()).toContain('assets/demo/textures/block/ruby_block.png');
    expect(session.snapshot.project?.namespaces[0]?.assets).toEqual([
      { path: 'textures/block/ruby_block.png', mediaType: 'image/png' },
    ]);
    expect(await session.readAsset('demo', 'textures/block/ruby_block.png')).toEqual(makePng());
    expect(session.snapshot.undoLabel).toBe('Add asset demo:textures/block/ruby_block.png');
  });

  it('rejects files that are not PNGs, unsafe names and wrong folders', async () => {
    const { fs, session } = await rubyProject();
    const result = await session.importAssets(
      'demo',
      [
        { name: 'fake.png', data: utf8.encode('not a png at all, just some text here') },
        { name: 'Bad Name.png', data: makePng() },
        { name: 'notes.txt', data: utf8.encode('x') },
        { name: 'ok.png', data: makePng(16, 16) },
      ],
      'textures/item',
    );
    expect(result.imported).toEqual(['textures/item/ok.png']);
    expect(result.rejected.map((entry) => entry.name)).toEqual([
      'fake.png',
      'Bad Name.png',
      'notes.txt',
    ]);
    expect(fs.list()).not.toContain('assets/demo/textures/item/fake.png');
    await expect(
      session.importAssets('demo', [{ name: 'a.ogg', data: utf8.encode('nope') }], 'sounds'),
    ).resolves.toMatchObject({ imported: [] });
    await expect(session.importAssets('missing', [], 'sounds')).rejects.toThrow(/missing/);
  });

  it('re-importing replaces the bytes and keeps one record', async () => {
    const { fs, session } = await rubyProject();
    await session.importAssets(
      'demo',
      [{ name: 'ruby_block.png', data: makePng(4, 4) }],
      'textures/block',
    );
    expect(session.snapshot.project?.namespaces[0]?.assets).toHaveLength(1);
    expect(await fs.readFile('assets/demo/textures/block/ruby_block.png')).toEqual(makePng(4, 4));
  });

  it('removes an asset record and its file', async () => {
    const { fs, session } = await rubyProject();
    await session.removeAsset('demo', 'textures/block/ruby_block.png');
    expect(session.snapshot.project?.namespaces[0]?.assets).toEqual([]);
    expect(fs.list()).not.toContain('assets/demo/textures/block/ruby_block.png');
  });
});

describe('ProjectSession: export and install', () => {
  it('exports a zip with pack.mcmeta, msm.export.json, the model and the texture', async () => {
    const { session, calls } = await rubyProject();
    const result = await session.exportResourcePack('zip');
    expect(result.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(calls.saved).toHaveLength(1);
    const saved = calls.saved[0] as (typeof calls.saved)[number];
    expect(saved.defaultName).toBe(`demo-${defaultTarget.id}.zip`);
    expect(result.location).toBe(`/exports/${saved.defaultName}`);

    const entries = unzipSync(saved.data);
    const modelFolder = defaultTarget.folders.resource.model;
    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining([
        'pack.mcmeta',
        'msm.export.json',
        `assets/demo/${modelFolder}/block/ruby_block.json`,
        'assets/demo/textures/block/ruby_block.png',
      ]),
    );
    const mcmeta = JSON.parse(utf8.decode(entries['pack.mcmeta'] as Uint8Array));
    expect(mcmeta.pack.description).toBe('');
    const manifest = JSON.parse(utf8.decode(entries['msm.export.json'] as Uint8Array));
    expect(JSON.stringify(manifest)).toContain('0.1.0-test');
  });

  it('reports a cancelled save dialog', async () => {
    const { session } = await rubyProject({ savePath: null });
    const result = await session.exportResourcePack('zip');
    expect(result.ok).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.location).toBeUndefined();
  });

  it('blocks the export when an element has schema errors', async () => {
    const { session, calls } = await rubyProject();
    session.setElementValue('demo:block/ruby_block', '/ambientocclusion', 'yes');
    const result = await session.exportResourcePack('zip');
    expect(result.ok).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.problems.some((problem) => problem.code === 'schema.type-mismatch')).toBe(true);
    expect(calls.saved).toEqual([]);
    // Saving is still allowed.
    await session.save();
    expect(session.snapshot.dirty).toBe(false);
  });

  it('installs into the game through the platform', async () => {
    const { session, calls } = await rubyProject();
    const result = await session.exportResourcePack('install');
    expect(result.ok).toBe(true);
    expect(calls.installed.map((entry) => entry.fileName)).toEqual([
      `demo-${defaultTarget.id}.zip`,
    ]);
    expect(result.location).toBe(`/minecraft/resourcepacks/demo-${defaultTarget.id}.zip`);
    expect(Object.keys(unzipSync(calls.installed[0]?.data as Uint8Array))).toContain('pack.mcmeta');
  });

  it('does not offer folder export yet', async () => {
    const { session } = await rubyProject();
    await expect(session.exportResourcePack('folder')).rejects.toThrow(/folder/);
  });
});
