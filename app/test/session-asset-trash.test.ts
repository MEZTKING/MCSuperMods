import { createMemoryFileSystem } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { ASSET_TRASH_DIR } from '../src/renderer/src/session/project-session';
import { makePng } from './helpers/synthetic-jar';
import { newSession } from './session-fixture';

const LIVE = 'assets/demo/textures/block/ruby_block.png';
const TRASHED = `${ASSET_TRASH_DIR}/demo/textures/block/ruby_block.png`;

async function withTexture() {
  const fs = createMemoryFileSystem();
  const { session } = newSession(fs);
  await session.newProject();
  await session.importAssets(
    'demo',
    [{ name: 'ruby_block.png', data: makePng(4, 4) }],
    'textures/block',
  );
  return { fs, session };
}

describe('ProjectSession: asset removal is undoable', () => {
  it('moves removed bytes to the trash and restores them on undo', async () => {
    const { fs, session } = await withTexture();
    await session.removeAsset('demo', 'textures/block/ruby_block.png');
    expect(fs.list()).not.toContain(LIVE);
    expect(fs.list()).toContain(TRASHED);

    expect(session.undo()).toBe(true);
    await session.flushAssetFiles();
    expect(session.snapshot.project?.namespaces[0]?.assets.map((asset) => asset.path)).toEqual([
      'textures/block/ruby_block.png',
    ]);
    expect(await fs.readFile(LIVE)).toEqual(makePng(4, 4));
    expect(fs.list()).not.toContain(TRASHED);

    expect(session.redo()).toBe(true);
    await session.flushAssetFiles();
    expect(fs.list()).not.toContain(LIVE);
    expect(fs.list()).toContain(TRASHED);
  });

  it('undoing an import trashes the bytes and redo brings them back', async () => {
    const { fs, session } = await withTexture();
    expect(session.undo()).toBe(true);
    await session.flushAssetFiles();
    expect(fs.list()).not.toContain(LIVE);
    expect(session.redo()).toBe(true);
    await session.flushAssetFiles();
    expect(await fs.readFile(LIVE)).toEqual(makePng(4, 4));
  });

  it('keeps the trash across a save and empties it when a project is opened', async () => {
    const { fs, session } = await withTexture();
    await session.removeAsset('demo', 'textures/block/ruby_block.png');
    await session.save();
    expect(fs.list()).toContain(TRASHED);
    session.undo();
    await session.flushAssetFiles();
    expect(fs.list()).toContain(LIVE);

    await session.removeAsset('demo', 'textures/block/ruby_block.png');
    await session.save();
    await session.openProject();
    expect(fs.list().some((path) => path.startsWith(`${ASSET_TRASH_DIR}/`))).toBe(false);
    expect(session.snapshot.project?.namespaces[0]?.assets).toEqual([]);
  });
});
