import type { Project } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { retexture, textureIdOf } from '../../src/renderer/src/textures/retexture';

const project = (elements: { id: string; kind: string; data: unknown }[]): Project =>
  ({
    name: 'demo',
    namespaces: [{ name: 'demo', elements, assets: [] }],
  }) as unknown as Project;

describe('retexture (ADR 0054)', () => {
  it('turns asset paths into texture ids', () => {
    expect(textureIdOf('demo', 'textures/item/ruby.png')).toBe('demo:item/ruby');
    expect(textureIdOf('demo', 'sounds/x.ogg')).toBeNull();
  });

  it('follows an item to its model and replaces layer0, or all for a block', () => {
    const p = project([
      { id: 'demo:ruby', kind: 'msm:item', data: { model: 'demo:item/ruby' } },
      {
        id: 'demo:item/ruby',
        kind: 'minecraft:model',
        data: { parent: 'minecraft:item/generated', textures: { layer0: 'demo:item/ruby' } },
      },
      { id: 'demo:ore', kind: 'msm:block', data: { model: 'demo:block/ore' } },
      {
        id: 'demo:block/ore',
        kind: 'minecraft:model',
        data: { parent: 'minecraft:block/cube_all', textures: { all: 'demo:block/ore' } },
      },
      { id: 'demo:plain', kind: 'msm:item', data: { model: 'minecraft:item/stick' } },
    ]);
    const [ruby, , ore, , plain] = p.namespaces[0]?.elements ?? [];
    expect(retexture(p, ruby as never, 'demo:item/ruby_alt')).toEqual({
      ok: true,
      modelId: 'demo:item/ruby',
      slot: 'layer0',
      previous: 'demo:item/ruby',
      data: { parent: 'minecraft:item/generated', textures: { layer0: 'demo:item/ruby_alt' } },
    });
    expect(retexture(p, ore as never, 'demo:block/new')).toMatchObject({ ok: true, slot: 'all' });
    expect(retexture(p, plain as never, 'demo:item/x')).toMatchObject({ ok: false });
  });

  it('carries the open and working fronts that showed the old front (ADR 0076 D1)', () => {
    const p = project([
      {
        id: 'demo:grinder',
        kind: 'msm:block',
        data: {
          type: 'horizontal',
          textures: {
            front: 'demo:block/grinder_front',
            front_lit: 'demo:block/grinder_front',
            side: 'demo:block/grinder',
          },
          components: { 'msm:machine': {} },
        },
      },
      {
        id: 'demo:crate',
        kind: 'msm:block',
        data: {
          type: 'directional',
          textures: { all: 'demo:block/crate', front_open: 'demo:block/crate_open' },
          components: { 'msm:container': {} },
        },
      },
      {
        id: 'demo:lid',
        kind: 'msm:block',
        data: {
          type: 'horizontal',
          textures: { front_open: 'demo:block/lid_open' },
          components: { 'msm:container': {} },
        },
      },
    ]);
    const [grinder, crate, lid] = p.namespaces[0]?.elements ?? [];
    expect(retexture(p, grinder as never, 'demo:block/new')).toMatchObject({
      ok: true,
      slot: 'front',
      data: {
        textures: {
          front: 'demo:block/new',
          front_lit: 'demo:block/new',
          side: 'demo:block/grinder',
        },
      },
    });
    // A front of its own stays.
    expect(retexture(p, crate as never, 'demo:block/new')).toMatchObject({
      ok: true,
      slot: 'all',
      data: { textures: { all: 'demo:block/new', front_open: 'demo:block/crate_open' } },
    });
    // Only the open front is set: the drop replaces it.
    expect(retexture(p, lid as never, 'demo:block/new')).toMatchObject({
      ok: true,
      slot: 'front_open',
      previous: 'demo:block/lid_open',
    });
  });
});
