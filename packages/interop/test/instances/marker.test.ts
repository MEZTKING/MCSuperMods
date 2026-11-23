import { describe, expect, it } from 'vitest';
import {
  instanceMarkerText,
  LOADER_COMPONENTS,
  parseInstanceMarker,
  recipeMmcPack,
} from '../../src/index';

describe('the marker', () => {
  it('reads version 1 as the test instance with Fabric', () => {
    const v1 = '{"formatVersion":1,"generator":"MCSuperMods","loader":"0.20.1","minecraft":"9.1"}';
    const marker = parseInstanceMarker(v1);
    expect(marker).toEqual({
      formatVersion: 1,
      role: 'test',
      owner: null,
      loaderKind: 'fabric',
      loader: '0.20.1',
      minecraft: '9.1',
      files: {},
      worlds: [],
    });
    // Written back unchanged (sorted keys, two spaces, a final newline).
    expect(instanceMarkerText(marker ?? (null as never))).toBe(
      `${JSON.stringify(JSON.parse(v1), null, 2)}\n`,
    );
  });

  it('round-trips version 2 and drops records it cannot trust', () => {
    const sha = 'a'.repeat(128);
    const text = JSON.stringify({
      files: {
        'resourcepacks/p.zip': { sha512: sha },
        '../escape.zip': { sha512: sha },
        'resourcepacks/q.zip': { sha512: 'short' },
      },
      formatVersion: 2,
      generator: 'MCSuperMods',
      loader: null,
      loaderKind: 'none',
      minecraft: '9.1',
      owner: null,
      purpose: 'plain',
      worlds: ['b', 'a', '../up', 'a'],
    });
    const marker = parseInstanceMarker(text);
    expect(marker).toMatchObject({
      formatVersion: 2,
      role: 'plain',
      files: { 'resourcepacks/p.zip': { sha512: sha } },
      worlds: ['a', 'b'],
    });
    expect(parseInstanceMarker(instanceMarkerText(marker ?? (null as never)))).toEqual(marker);
  });

  it('reads nothing else as a marker', () => {
    for (const text of [
      '',
      '{',
      '[]',
      '{"formatVersion":1,"generator":"Other","loader":"1","minecraft":"9.1"}',
      '{"formatVersion":3,"generator":"MCSuperMods","minecraft":"9.1"}',
      '{"formatVersion":2,"generator":"MCSuperMods","minecraft":"9.1","purpose":"x","loaderKind":"none"}',
      '{"formatVersion":2,"generator":"MCSuperMods","minecraft":"9.1","purpose":"plain","loaderKind":"paper"}',
    ]) {
      expect(parseInstanceMarker(text)).toBeNull();
    }
  });
});

describe('the component table', () => {
  it('writes only net.minecraft without a loader, and Fabric Loader with one', () => {
    expect(JSON.parse(recipeMmcPack('9.1', { kind: 'none', version: null }))).toEqual({
      components: [{ important: true, uid: 'net.minecraft', version: '9.1' }],
      formatVersion: 1,
    });
    expect(
      JSON.parse(recipeMmcPack('9.2-snapshot-7', { kind: 'fabric', version: '0.20.1' })),
    ).toEqual({
      components: [
        { important: true, uid: 'net.minecraft', version: '9.2-snapshot-7' },
        { uid: 'net.fabricmc.fabric-loader', version: '0.20.1' },
      ],
      formatVersion: 1,
    });
  });

  it('knows Quilt, NeoForge and Forge and refuses them until their plans', () => {
    expect(LOADER_COMPONENTS.quilt.uid).toBe('org.quiltmc.quilt-loader');
    expect(LOADER_COMPONENTS.neoforge.uid).toBe('net.neoforged');
    expect(LOADER_COMPONENTS.forge.uid).toBe('net.minecraftforge');
    for (const kind of ['quilt', 'neoforge', 'forge'] as const) {
      expect(() => recipeMmcPack('9.1', { kind, version: '1.0' })).toThrow(/cannot make instances/);
    }
    expect(() => recipeMmcPack('9.1', { kind: 'fabric', version: null })).toThrow();
    expect(() => recipeMmcPack('9.1', { kind: 'none', version: '1' })).toThrow();
  });
});
