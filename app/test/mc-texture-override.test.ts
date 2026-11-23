/**
 * Change a Minecraft texture (ADR 0129 D4) through the session: the painted picture is saved at
 * the same path in the `minecraft` namespace (with MSM's own animation sidecar for a strip) in
 * one undo step, and the resource pack export carries it there, so the game shows the user's
 * version. The pictures are MSM-made test PNGs, never Mojang's.
 */

import { createMemoryFileSystem, utf8 } from '@msm/core';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  animationMeta,
  minecraftTextures,
} from '../src/renderer/src/components/mc-textures/catalogue';
import {
  hasOverride,
  overrideOf,
  pictureChange,
} from '../src/renderer/src/components/mc-textures/picture-change';
import { makePng } from './helpers/synthetic-jar';
import { newSession } from './session-fixture';

const TEXTURES = minecraftTextures([
  'assets/minecraft/textures/block/stone.png',
  'assets/minecraft/textures/block/lava_still.png',
  'assets/minecraft/textures/block/lava_still.png.mcmeta',
]);
const byName = (name: string) => {
  const found = TEXTURES.find((texture) => texture.name === name);
  if (found === undefined) throw new Error(`No ${name}`);
  return found;
};
const STONE = byName('Stone');
const LAVA = byName('Lava still');

async function project() {
  const fs = createMemoryFileSystem();
  const { session, calls } = newSession(fs);
  await session.newProject();
  return { fs, session, calls };
}

describe('Change a Minecraft texture: the override (ADR 0129 D4)', () => {
  it('names the same path in the minecraft namespace', () => {
    expect(LAVA.animated).toBe(true);
    expect(STONE.animated).toBe(false);
    expect(overrideOf(STONE)).toEqual({ namespace: 'minecraft', path: 'textures/block/stone.png' });
  });

  it('saves the picture at the override path in one undo step and exports it', async () => {
    const { fs, session, calls } = await project();
    const stone = STONE;
    const { namespace, path } = overrideOf(stone);
    const painted = makePng(16, 16);
    const change = pictureChange(session.snapshot.project, namespace, path, painted);
    expect(change.writes).toEqual([]);
    await session.applyChangeset(change.items, 'Change how Stone looks');
    expect(await fs.readFile('assets/minecraft/textures/block/stone.png')).toEqual(painted);
    expect(hasOverride(session.snapshot.project, stone)).toBe(true);
    expect(session.snapshot.undoLabel).toBe('Change how Stone looks');

    const result = await session.exportResourcePack('zip');
    expect(result.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    const entries = unzipSync(calls.saved[0]?.data as Uint8Array);
    expect(entries['assets/minecraft/textures/block/stone.png']).toEqual(painted);

    // A second paint writes over it (Undo restores the first).
    const again = makePng(16, 16).map((byte, index) => (index > 40 ? byte ^ 1 : byte));
    const second = pictureChange(session.snapshot.project, namespace, path, again);
    expect(second.items).toEqual([]);
    await session.applyChangeset([], 'Paint textures/block/stone.png', { writes: second.writes });
    expect(await fs.readFile('assets/minecraft/textures/block/stone.png')).toEqual(again);
    expect(session.undo()).toBe(true);
    await expect
      .poll(() => fs.readFile('assets/minecraft/textures/block/stone.png'))
      .toEqual(painted);

    // Undo of the first step removes the override altogether.
    expect(session.undo()).toBe(true);
    expect(hasOverride(session.snapshot.project, stone)).toBe(false);
  });

  it('brings MSM’s own animation sidecar with a strip, and not with a square', async () => {
    const { fs, session } = await project();
    const lava = LAVA;
    const mcmeta = animationMeta(
      utf8.encode(JSON.stringify({ animation: { frametime: 2, interpolate: true, extra: 1 } })),
    );
    expect(mcmeta).not.toBeNull();
    const { namespace, path } = overrideOf(lava);
    const strip = makePng(16, 64);
    const change = pictureChange(session.snapshot.project, namespace, path, strip, mcmeta);
    expect(change.items.map((item) => item.asset?.path)).toEqual([path, `${path}.mcmeta`]);
    await session.applyChangeset(change.items, 'Change how Lava still looks');
    expect(JSON.parse(utf8.decode(await fs.readFile(`assets/minecraft/${path}.mcmeta`)))).toEqual({
      animation: { frametime: 2, interpolate: true },
    });
    expect(session.undo()).toBe(true);
    expect(hasOverride(session.snapshot.project, lava)).toBe(false);
    await expect
      .poll(() => fs.list().filter((file) => file.startsWith('assets/minecraft/')))
      .toEqual([]);

    const square = pictureChange(
      session.snapshot.project,
      namespace,
      path,
      makePng(16, 16),
      mcmeta,
    );
    expect(square.items.map((item) => item.asset?.path)).toEqual([path]);
  });
});
