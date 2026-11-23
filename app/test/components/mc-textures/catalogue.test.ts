import { describe, expect, it } from 'vitest';
import { shownTiles } from '../../../src/renderer/src/components/home/tiles';
import {
  animationMeta,
  filterTextures,
  folderOfPath,
  isStrip,
  minecraftTextures,
  textureName,
} from '../../../src/renderer/src/components/mc-textures/catalogue';
import { tileEntries } from '../../../src/renderer/src/search/sources/tiles';
import { PATHS } from './paths';

describe('Minecraft textures (ADR 0129 D4)', () => {
  it('names textures from their file names and keeps the offered folders', () => {
    const list = minecraftTextures(PATHS);
    expect(list.map((texture) => `${texture.folder}: ${texture.name}`)).toEqual([
      'block: Dirt',
      'block: Stone',
      'block: Stone bricks',
      'block: Water still',
      'item: Diamond sword',
      'entity: Cow',
      'entity: Normal (chest)',
      'particle: Flame',
      'gui: Full (heart)',
      'painting: Kebab',
    ]);
    const water = list.find((texture) => texture.name === 'Water still');
    expect(water).toMatchObject({
      animated: true,
      id: 'minecraft:block/water_still',
      assetPath: 'textures/block/water_still.png',
      jarPath: 'assets/minecraft/textures/block/water_still.png',
    });
    expect(list.find((texture) => texture.name === 'Stone')?.animated).toBe(false);
    expect(textureName('sprites/hud/heart/full')).toBe('Full (heart)');
    expect(textureName('cow/brown_mooshroom')).toBe('Brown mooshroom (cow)');
  });

  it('filters by folder and by words, the closest name first', () => {
    const list = minecraftTextures(PATHS);
    expect(filterTextures(list, 'entity', '').map((t) => t.name)).toEqual([
      'Cow',
      'Normal (chest)',
    ]);
    expect(filterTextures(list, 'all', 'stone').map((t) => t.name)).toEqual([
      'Stone',
      'Stone bricks',
    ]);
    expect(filterTextures(list, 'all', 'bricks stone').map((t) => t.name)).toEqual([
      'Stone bricks',
    ]);
    expect(filterTextures(list, 'all', 'minecraft:item/diamond').map((t) => t.name)).toEqual([
      'Diamond sword',
    ]);
    expect(filterTextures(list, 'item', 'stone')).toEqual([]);
  });

  it('writes MSM’s own animation sidecar from the timing only', () => {
    const vanilla = new TextEncoder().encode(
      JSON.stringify({ animation: { frametime: 2, frames: [0, 1, { index: 2, time: 4 }], x: 1 } }),
    );
    const meta = animationMeta(vanilla);
    expect(JSON.parse(new TextDecoder().decode(meta as Uint8Array))).toEqual({
      animation: { frames: [0, 1, { index: 2, time: 4 }], frametime: 2 },
    });
    expect(animationMeta(new TextEncoder().encode('{}'))).toBeNull();
    expect(animationMeta(new TextEncoder().encode('not json'))).toBeNull();
    expect(animationMeta(null)).toBeNull();
    expect(isStrip(16, 64)).toBe(true);
    expect(isStrip(16, 16)).toBe(false);
    expect(isStrip(16, 40)).toBe(false);
    expect(folderOfPath('demo:textures/item/ruby.png')).toBe('item');
    expect(folderOfPath('textures/mob_effect/x.png')).toBeUndefined();
  });

  it('offers Change a Minecraft texture on Home, found by search as the palette command', () => {
    const shown = shownTiles({ flowAvailable: () => false, rules: false, ai: false });
    expect(shown.map((entry) => entry.tile.id)).toContain('minecraft-texture');
    const entries = tileEntries({
      flowAvailable: () => false,
      starterAvailable: () => false,
      rules: false,
    });
    const tile = entries.find((entry) => entry.id === 'tile:minecraft-texture');
    expect(tile?.title).toBe('Change a Minecraft texture');
    expect(tile?.action).toEqual({ type: 'command', command: 'changeMinecraftTexture' });
  });
});
