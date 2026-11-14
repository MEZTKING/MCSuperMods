/// <reference types="node" />
/**
 * Pure helpers of the Particle Studio and the particle pickers (B353, ADR 0081 D1, D2): frames,
 * lifetime ranges, see-through defaults, the "Kind" of a particle to spawn, project particles
 * first, frame pictures, the one undo step of "Split a strip into frames", the Ambient
 * particles model, and the session's `blocks-items.particle-texture-missing` warning.
 */
import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  PARTICLE_TEXTURE_MISSING_CODE,
  particleTextureProblems,
} from '../../../../src/renderer/src/session/project-session';
import {
  ambientWhere,
  newAmbientParticles,
  stateRows,
  statesOf,
  takesAmbientParticles,
  tripleWith,
  withAmbientWhere,
} from '../../../../src/renderer/src/studios/blocks-items/ambient-particles-model';
import {
  blockPiecesId,
  defaultTranslucent,
  hasSpritePicture,
  isLifetimeRange,
  itemPiecesId,
  lifetimeWithRange,
  motionWith,
  nextFrameSprite,
  particleFrames,
  particleSpecFor,
  particleSpecKind,
  particlesFirst,
  projectParticles,
  projectSprites,
  splitChangeset,
  spriteAsset,
  withItemPieces,
  withOption,
} from '../../../../src/renderer/src/studios/blocks-items/particle-model';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const el = (id: string, kind: string, data: Json): Element => ({
  id: id as ResourceLocation,
  kind,
  data,
  formatVersion: 1,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

function project(elements: Element[], assets: string[] = []): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        elements,
        assets: assets.map((path) => ({ path, mediaType: 'image/png' })),
      },
    ],
  };
}

const spark = el('demo:spark', 'msm:particle', {
  format: 1,
  textures: ['demo:spark_0', 'demo:spark_1', 'minecraft:glow'],
});

describe('particle model', () => {
  it('reads frames and names new ones after the particle', () => {
    expect(particleFrames(spark.data)).toEqual(['demo:spark_0', 'demo:spark_1', 'minecraft:glow']);
    expect(particleFrames({})).toEqual([]);
    expect(nextFrameSprite('demo:spark', ['demo:spark_0', 'demo:spark_1'])).toBe('demo:spark_2');
    expect(nextFrameSprite('demo:spark', ['demo:spark_1'])).toBe('demo:spark_2');
  });

  it('turns the lifetime into a range and back', () => {
    expect(isLifetimeRange({ lifetime: 20 })).toBe(false);
    expect(isLifetimeRange({ lifetime: { min: 5, max: 9 } })).toBe(true);
    expect(lifetimeWithRange(30, true)).toEqual({ min: 30, max: 30 });
    expect(lifetimeWithRange(undefined, true)).toEqual({ min: 20, max: 20 });
    expect(lifetimeWithRange({ min: 5, max: 9 }, false)).toBe(5);
    expect(lifetimeWithRange(12, false)).toBe(12);
  });

  it('draws see-through by default with an opacity below 1 or a fade', () => {
    expect(defaultTranslucent({})).toBe(false);
    expect(defaultTranslucent({ alpha: 0.5 })).toBe(true);
    expect(defaultTranslucent({ fade: 'in_out' })).toBe(true);
  });

  it('knows the kind of a particle to spawn and starts each kind', () => {
    expect(particleSpecKind('minecraft:flame')).toBe('particle');
    expect(particleSpecKind(undefined)).toBe('particle');
    expect(particleSpecKind({ type: 'minecraft:dust', color: 1, scale: 1 })).toBe('dust');
    expect(particleSpecKind({ type: 'minecraft:block', block_state: 'minecraft:stone' })).toBe(
      'block',
    );
    expect(particleSpecKind({ type: 'minecraft:item', item: { id: 'minecraft:apple' } })).toBe(
      'item',
    );
    expect(particleSpecKind({ type: 'minecraft:trail' })).toBe('other');
    expect(particleSpecFor('particle')).toBe('');
    expect(particleSpecFor('dust')).toEqual({ type: 'minecraft:dust', color: 0xff0000, scale: 1 });
    expect(particleSpecFor('block')).toEqual({
      type: 'minecraft:block',
      block_state: 'minecraft:stone',
    });
    expect(particleSpecFor('item')).toEqual({
      type: 'minecraft:item',
      item: { id: 'minecraft:diamond' },
    });
  });

  it('reads and writes block and item pieces and options', () => {
    expect(blockPiecesId({ block_state: 'minecraft:dirt' })).toBe('minecraft:dirt');
    expect(blockPiecesId({ block_state: { Name: 'minecraft:dirt' } })).toBe('minecraft:dirt');
    expect(itemPiecesId({ item: 'minecraft:apple' })).toBe('minecraft:apple');
    expect(itemPiecesId({ item: { id: 'minecraft:apple', count: 2 } })).toBe('minecraft:apple');
    expect(
      withItemPieces({ type: 'minecraft:item', item: { id: 'a:b', count: 2 } }, 'c:d'),
    ).toEqual({ type: 'minecraft:item', item: { id: 'c:d', count: 2 } });
    expect(withOption({ type: 'minecraft:dust', scale: 1 }, 'scale', 2)).toEqual({
      type: 'minecraft:dust',
      scale: 2,
    });
    expect(withOption({ type: 'minecraft:dust', scale: 1 }, 'scale', undefined)).toEqual({
      type: 'minecraft:dust',
    });
  });

  it('writes motion as three numbers and drops it when cleared', () => {
    expect(motionWith(undefined, 1, 0.2)).toEqual([0, 0.2, 0]);
    expect(motionWith([0.1, 0.2, 0.3], 0, 1)).toEqual([1, 0.2, 0.3]);
    expect(motionWith([0, 0.2, 0], 1, undefined)).toBeUndefined();
    expect(motionWith([0.1, 0.2, 0], 1, undefined)).toEqual([0.1, 0, 0]);
    expect(motionWith([0.1, 0.2, 0], 0, 0)).toEqual([0, 0.2, 0]);
    expect(motionWith([0.5], 0, undefined)).toBeUndefined();
  });

  it('offers the project particles first', () => {
    const suggest = particlesFirst((registry) =>
      registry === 'particle_type'
        ? ['minecraft:ash', 'demo:spark', 'minecraft:flame', 'demo:petal']
        : ['minecraft:stone', 'demo:ruby'],
    );
    expect(suggest('particle_type', '')).toEqual([
      'demo:spark',
      'demo:petal',
      'minecraft:ash',
      'minecraft:flame',
    ]);
    expect(suggest('block', '')).toEqual(['minecraft:stone', 'demo:ruby']);
    expect(
      projectParticles(
        project([el('demo:b', 'msm:particle', {}), el('demo:a', 'msm:particle', {})]),
      ),
    ).toEqual(['demo:a', 'demo:b']);
  });

  it('finds frame pictures in the project', () => {
    expect(spriteAsset(target, 'demo:spark_0')).toEqual({
      namespace: 'demo',
      path: 'textures/particle/spark_0.png',
      assetPath: 'assets/demo/textures/particle/spark_0.png',
    });
    const withOne = project([spark], ['textures/particle/spark_0.png', 'textures/block/x.png']);
    expect(hasSpritePicture(withOne, target, 'demo:spark_0')).toBe(true);
    expect(hasSpritePicture(withOne, target, 'demo:spark_1')).toBe(false);
    expect(hasSpritePicture(withOne, target, 'minecraft:glow')).toBe(true);
    expect(projectSprites(withOne, target)).toEqual(['demo:spark_0']);
  });

  it('splits a strip in one change: new pictures, rewritten pictures and the frames', () => {
    const before = project([spark], ['textures/particle/spark_0.png']);
    const bytes = [new Uint8Array([1]), new Uint8Array([2])];
    const change = splitChangeset(before, target, spark, bytes);
    expect(change.sprites).toEqual(['demo:spark_0', 'demo:spark_1']);
    expect(change.writes).toEqual([
      { namespace: 'demo', path: 'textures/particle/spark_0.png', bytes: bytes[0] },
    ]);
    expect(change.items.map((item) => [item.op, item.itemId])).toEqual([
      ['update', 'frames'],
      ['asset', 'frame-1'],
    ]);
    expect(change.items[0]?.after).toEqual({
      format: 1,
      textures: ['demo:spark_0', 'demo:spark_1'],
    });
    expect(change.items[0]?.before).toBe(spark.data);
    expect(change.items[1]?.asset).toEqual({
      namespace: 'demo',
      path: 'textures/particle/spark_1.png',
      bytes: bytes[1],
    });
  });
});

describe('ambient particles model', () => {
  it('is for every block type but portals and starts with a project particle', () => {
    expect(takesAmbientParticles(undefined)).toBe(true);
    expect(takesAmbientParticles('slab')).toBe(true);
    expect(takesAmbientParticles('portal')).toBe(false);
    expect(newAmbientParticles(['demo:spark'])).toEqual({ particle: 'demo:spark' });
    expect(newAmbientParticles([])).toEqual({ particle: '' });
  });

  it('reads and writes "Where"', () => {
    expect(ambientWhere({ particle: 'x' })).toBe('whole');
    expect(ambientWhere({ spread: [0, 0, 0] })).toBe('centre');
    expect(ambientWhere({ offset: [0.5, 1, 0.5], spread: [0.5, 0, 0.5] })).toBe('top');
    expect(ambientWhere({ offset: [0.2, 0.5, 0.5] })).toBe('custom');
    expect(withAmbientWhere({ particle: 'x', offset: [0.2, 0.5, 0.5] }, 'centre')).toEqual({
      particle: 'x',
      spread: [0, 0, 0],
    });
    expect(withAmbientWhere({ particle: 'x' }, 'top')).toEqual({
      particle: 'x',
      offset: [0.5, 1, 0.5],
      spread: [0.5, 0, 0.5],
    });
    expect(withAmbientWhere({ particle: 'x', spread: [0, 0, 0] }, 'whole')).toEqual({
      particle: 'x',
    });
    expect(withAmbientWhere({ particle: 'x' }, 'custom')).toEqual({
      particle: 'x',
      offset: [0.5, 0.5, 0.5],
      spread: [0.5, 0.5, 0.5],
    });
  });

  it('writes triples and drops them at their default', () => {
    expect(tripleWith(undefined, 1, 0.1, [0, 0, 0])).toEqual([0, 0.1, 0]);
    expect(tripleWith([0, 0.1, 0], 1, 0, [0, 0, 0])).toBeUndefined();
  });

  it('reads and writes "Only when"', () => {
    expect(stateRows({ states: { lit: 'true', facing: 'north' } })).toEqual([
      { property: 'lit', value: 'true' },
      { property: 'facing', value: 'north' },
    ]);
    expect(
      statesOf([
        { property: ' lit ', value: 'true' },
        { property: '', value: 'x' },
      ]),
    ).toEqual({
      lit: 'true',
    });
    expect(statesOf([])).toBeUndefined();
  });
});

describe('blocks-items.particle-texture-missing', () => {
  it('warns once per project frame without a picture, never for vanilla sprites', () => {
    const problems = particleTextureProblems(
      project([spark], ['textures/particle/spark_0.png']),
      target,
    );
    expect(problems).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: PARTICLE_TEXTURE_MISSING_CODE,
        elementId: 'demo:spark',
        path: '/textures/1',
      }),
    ]);
    expect(PARTICLE_TEXTURE_MISSING_CODE).toBe('blocks-items.particle-texture-missing');
    expect(problems[0]?.message).toContain('assets/demo/textures/particle/spark_1.png');
    expect(particleTextureProblems(project([spark]), undefined)).toEqual([]);
  });
});
