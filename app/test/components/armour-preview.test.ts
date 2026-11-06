import { describe, expect, it } from 'vitest';
import { armourPreviewOf } from '../../src/renderer/src/preview/armour-preview';
import { element, sampleProject } from './fixtures';

const equipment = element('demo:ruby_armor', 'minecraft:equipment', {
  layers: {
    humanoid: [{ texture: 'demo:ruby' }],
    humanoid_leggings: [{ texture: 'demo:ruby' }],
    horse_body: [{ texture: 'demo:ruby' }],
  },
});

describe('armour preview model', () => {
  it('previews an equipment element: four pieces shown, body layers listed but off', () => {
    const preview = armourPreviewOf(equipment, null);
    expect(preview?.equipmentId).toBe('demo:ruby_armor');
    expect(
      preview?.parts.map((part) => [part.id, part.layer, part.texture, part.shown, part.pointer]),
    ).toEqual([
      ['helmet', 'humanoid', 'demo:ruby', true, '/layers/humanoid/0/texture'],
      ['chestplate', 'humanoid', 'demo:ruby', true, '/layers/humanoid/0/texture'],
      ['leggings', 'humanoid_leggings', 'demo:ruby', true, '/layers/humanoid_leggings/0/texture'],
      ['boots', 'humanoid', 'demo:ruby', true, '/layers/humanoid/0/texture'],
      ['horse', 'horse_body', 'demo:ruby', false, '/layers/horse_body/0/texture'],
    ]);
  });

  it('previews an armour item through its equipment asset, with only its own piece shown', () => {
    const project = sampleProject();
    project.namespaces[0]?.elements.push(equipment);
    const helmet = element('demo:ruby_helmet', 'msm:item', {
      components: {
        'msm:armor': { slot: 'helmet', material: { equipment_asset: 'demo:ruby_armor' } },
      },
    });
    const preview = armourPreviewOf(helmet, project);
    expect(preview?.parts.filter((part) => part.shown).map((part) => part.id)).toEqual(['helmet']);
    expect(preview?.parts[0]?.pointer).toBe('/components/msm:armor/material/equipment_asset');
  });

  it('uses the vanilla equipment of a material given by name, and ignores other items', () => {
    const iron = element('demo:iron_cap', 'msm:item', {
      components: { 'msm:armor': { slot: 'helmet', material: 'iron' } },
    });
    const preview = armourPreviewOf(iron, null);
    expect(preview).toMatchObject({ equipmentId: 'minecraft:iron', vanilla: true });
    expect(preview?.parts[0]?.texture).toBe('minecraft:iron');
    expect(armourPreviewOf(element('demo:stick', 'msm:item', {}), null)).toBeNull();
    expect(armourPreviewOf(element('demo:recipe', 'minecraft:recipe', {}), null)).toBeNull();
  });
});
