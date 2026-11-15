/**
 * The Vehicle Studio's pure helpers (B419, `studios/entities/vehicle/vehicle-model.ts`): the bone
 * pickers over the geometry's bones (choices, unknown values kept, list toggles in file order,
 * missing bones), "Find parts by name", seats (default, "How many seats", the seat plan's
 * coordinates), weapons, speeds, the starter model plan and the Very easy colour.
 */
import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import { vehicleGeometry } from '@msm/plugin-entities';
import { describe, expect, it } from 'vitest';
import {
  boneChoices,
  boneListChoices,
  cannonIndex,
  cannonWeapon,
  effectiveSeatOffsets,
  freeWeaponId,
  geometryTextureSize,
  guessParts,
  maxSpeedOf,
  missingBones,
  namedBones,
  newWeapon,
  planScale,
  planToSeat,
  rgbOf,
  seatsForCount,
  seatToPlan,
  speedWords,
  starterModelPlan,
  starterTexturePixels,
  suggestedShape,
  tintPixels,
  toggledBone,
  vehicleBones,
  withGuessedParts,
} from '../../../../src/renderer/src/studios/entities/vehicle/vehicle-model';
import { element } from '../../fixtures';

const TANK_BONES = ['hull', 'track_left', 'track_right', 'turret', 'barrel'];

function project(...elements: Element[]): Project {
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
        assets: [{ path: 'textures/entity/tank.png', mediaType: 'image/png' }],
      },
    ],
  };
}

const tankGeo = element('demo:entity/tank', 'msm:geo_model', vehicleGeometry('tank', 'tank'));

describe('bone pickers', () => {
  it('reads the bones of the vehicle geometry, or null when it is not a project element', () => {
    const data = { model: { geometry: 'demo:entity/tank', texture: '' } };
    expect(vehicleBones(project(tankGeo), data)).toEqual(TANK_BONES);
    expect(vehicleBones(project(), data)).toBeNull();
    expect(vehicleBones(project(tankGeo), { model: { geometry: '' } })).toBeNull();
  });

  it('offers every bone and keeps an unknown current value first', () => {
    expect(boneChoices(TANK_BONES, 'turret').map((choice) => choice.bone)).toEqual(TANK_BONES);
    expect(boneChoices(TANK_BONES, 'cannon')[0]).toEqual({ bone: 'cannon', known: false });
    expect(boneChoices(TANK_BONES, undefined)).toHaveLength(5);
  });

  it('lists unknown listed bones before the model bones, once each', () => {
    const choices = boneListChoices(TANK_BONES, ['wheel', 'hull', 'wheel']);
    expect(choices.slice(0, 2)).toEqual([
      { bone: 'wheel', known: false },
      { bone: 'hull', known: true },
    ]);
    expect(choices).toHaveLength(6);
  });

  it('toggles bones in the model’s order and keeps unknown ones', () => {
    expect(toggledBone(TANK_BONES, ['turret'], 'hull', true)).toEqual(['hull', 'turret']);
    expect(toggledBone(TANK_BONES, ['hull', 'turret'], 'hull', false)).toEqual(['turret']);
    expect(toggledBone(TANK_BONES, ['ghost'], 'barrel', true)).toEqual(['ghost', 'barrel']);
  });

  it('finds every named bone and those the model lacks', () => {
    const data = {
      turret: { bone: 'turret', pitch_bone: 'gun' },
      parts: { wheels: ['track_left', 'wheel_x'] },
      weapons: [
        { id: 'a', projectile: 'minecraft:arrow', muzzle: { bone: 'barrel', offset: [0, 0, 0] } },
      ],
    };
    expect(namedBones(data).map((entry) => entry.bone)).toEqual([
      'turret',
      'gun',
      'track_left',
      'wheel_x',
      'barrel',
    ]);
    expect(missingBones(TANK_BONES, data)).toEqual([
      { bone: 'gun', path: ['turret', 'pitch_bone'] },
      { bone: 'wheel_x', path: ['parts', 'wheels', 1] },
    ]);
    expect(missingBones(null, data)).toEqual([]);
  });

  it('guesses parts from bone names', () => {
    const car = guessParts([
      'body',
      'wheel_front_left',
      'wheel_front_right',
      'wheel_back_left',
      'steering_wheel',
    ]);
    expect(car.wheels).toEqual(['wheel_front_left', 'wheel_front_right', 'wheel_back_left']);
    expect(car.steering).toEqual(['wheel_front_left', 'wheel_front_right', 'steering_wheel']);
    const heli = guessParts(['cabin', 'rotor', 'tail_rotor', 'fan']);
    expect(heli.rotors).toEqual(['rotor']);
    expect(heli.propellers).toEqual(['tail_rotor', 'fan']);
    const tank = guessParts(TANK_BONES);
    expect(tank.turret).toBe('turret');
    expect(tank.barrel).toBe('barrel');
  });

  it('fills empty part lists and the turret, keeping what is set', () => {
    const next = withGuessedParts({ parts: { rotors: ['x'] } }, ['rotor', 'turret', 'barrel']);
    expect(next.parts).toEqual({ rotors: ['x'] });
    expect(next.turret).toEqual({ bone: 'turret', pitch_bone: 'barrel' });
    const kept = withGuessedParts({ turret: { bone: 'hull' } }, TANK_BONES);
    expect(kept.turret).toEqual({ bone: 'hull' });
  });
});

describe('seats', () => {
  it('shows the runtime’s default seat when none is written', () => {
    expect(effectiveSeatOffsets({})).toEqual([[0, 0.5625, 0]]);
    expect(effectiveSeatOffsets({ size: [2, 1.5] })).toEqual([[0, 1.5, 0]]);
  });

  it('lays out seats in rows of two and keeps existing ones', () => {
    const two = seatsForCount({ size: [2, 1] }, 2);
    expect(two).toEqual([{ offset: [-0.35, 1, 0] }, { offset: [0.35, 1, 0] }]);
    const three = seatsForCount({ seats: [{ offset: [0, 0.5, 1], weapons: ['a'] }] }, 3);
    expect(three[0]).toEqual({ offset: [0, 0.5, 1], weapons: ['a'] });
    expect(three[2]).toEqual({ offset: [0, 0.5, -0.35] });
    expect(seatsForCount({}, 20)).toHaveLength(8);
    expect(seatsForCount({ seats: [{ offset: [1, 1, 1] }, { offset: [2, 2, 2] }] }, 1)).toEqual([
      { offset: [1, 1, 1] },
    ]);
  });

  it('maps seats to the plan and back, front at the top', () => {
    const data = { size: [2, 1] };
    const scale = planScale(data, 200);
    const [x, y] = seatToPlan([0.5, 1, 0.5], scale, 200);
    expect(x).toBeGreaterThan(100);
    expect(y).toBeLessThan(100);
    expect(planToSeat({ x, y }, scale, 200)).toEqual([0.5, 0.5]);
  });
});

describe('weapons and speeds', () => {
  it('names new weapons uniquely and aims them from the barrel', () => {
    const data: Json = {
      size: [3, 1.6],
      turret: { bone: 'turret', pitch_bone: 'barrel' },
      weapons: [{ id: 'weapon', projectile: 'minecraft:arrow' }],
    };
    expect(freeWeaponId(data)).toBe('weapon_2');
    expect(newWeapon(data)).toEqual({
      id: 'weapon_2',
      projectile: 'minecraft:arrow',
      muzzle: { bone: 'barrel', offset: [0, 0.8, 1.5] },
    });
    const cannon = cannonWeapon(data);
    expect(cannon.id).toBe('cannon');
    expect(cannon.projectile).toBe('minecraft:fire_charge');
    expect(cannonIndex({ weapons: [{ id: 'x' }, cannon] })).toBe(1);
    expect(cannonIndex({})).toBe(-1);
  });

  it('uses the mode’s default speed and says it in blocks a second', () => {
    expect(maxSpeedOf({ movement: { mode: 'air' } })).toBe(1.2);
    expect(maxSpeedOf({ movement: { mode: 'ground', max_speed: 0.25 } })).toBe(0.25);
    expect(speedWords(0.4)).toBe('8 blocks a second');
    expect(speedWords(0.05)).toBe('1 block a second');
  });

  it('suggests a starter shape from the mode and weapons', () => {
    expect(suggestedShape({ movement: { mode: 'hover' } })).toBe('helicopter');
    expect(suggestedShape({ movement: { mode: 'ground' }, turret: { bone: 't' } })).toBe('tank');
    expect(suggestedShape({})).toBe('car');
  });
});

describe('starter model', () => {
  const vehicle = (data: Json): Element =>
    element('demo:tank' as ResourceLocation, 'msm:vehicle', data);
  const encode = (width: number, height: number, pixels: Uint8ClampedArray) =>
    new Uint8Array([width, height, pixels.length % 251]);

  it('creates the geometry and texture under the vehicle’s own id, in one change', () => {
    const subject = vehicle({
      format: 1,
      model: { geometry: '', texture: '' },
      movement: { mode: 'ground' },
    });
    const plan = starterModelPlan(project(subject), subject, 'tank', '#5f6e3a', encode);
    expect(plan.geometryId).toBe('demo:entity/tank');
    expect(plan.textureId).toBe('demo:entity/tank');
    expect(plan.items.map((item) => [item.op, item.elementId ?? item.asset?.path])).toEqual([
      ['create', 'demo:entity/tank'],
      ['update', 'demo:tank'],
    ]);
    // The texture is recorded already, so it is a write, not a new asset.
    expect(plan.writes.map((write) => [write.namespace, write.path])).toEqual([
      ['demo', 'textures/entity/tank.png'],
    ]);
    const after = plan.items[1]?.after as { model: Json; turret: Json; parts?: Json };
    expect(after.model).toEqual({ geometry: 'demo:entity/tank', texture: 'demo:entity/tank' });
    expect(after.turret).toEqual({ bone: 'turret', pitch_bone: 'barrel' });
    expect(plan.label).toBe('Make a starter model (Tank)');
  });

  it('adds a new texture as an asset item', () => {
    const subject = element('demo:jeep' as ResourceLocation, 'msm:vehicle', {
      model: { geometry: '', texture: '' },
      movement: { mode: 'ground' },
    });
    const plan = starterModelPlan(project(subject), subject, 'car', '#3c6edc', encode);
    expect(plan.items.at(-1)?.op).toBe('asset');
    expect(plan.items.at(-1)?.asset?.path).toBe('textures/entity/jeep.png');
    expect(plan.writes).toEqual([]);
  });

  it('replaces an existing geometry and writes over a recorded texture', () => {
    const subject = vehicle({
      model: { geometry: 'demo:entity/tank', texture: 'demo:entity/tank' },
      movement: { mode: 'ground' },
      parts: { wheels: ['hull'] },
    });
    const plan = starterModelPlan(project(subject, tankGeo), subject, 'car', '#3c6edc', encode);
    expect(plan.items[0]?.op).toBe('update');
    expect(plan.items[0]?.before).toEqual(tankGeo.data);
    expect(plan.writes.map((write) => write.path)).toEqual(['textures/entity/tank.png']);
    const after = plan.items[1]?.after as { parts: Json };
    expect(after.parts).toEqual({
      wheels: ['hull'],
      steering: ['wheel_front_left', 'wheel_front_right'],
    });
  });

  it('paints a texture of the geometry’s size', () => {
    expect(geometryTextureSize(vehicleGeometry('tank', 'tank'))).toEqual({
      width: 256,
      height: 256,
    });
    expect(geometryTextureSize({})).toEqual({ width: 64, height: 64 });
    const pixels = starterTexturePixels(4, 2, '#ff0000');
    expect(pixels).toHaveLength(32);
    expect(pixels[3]).toBe(255);
    expect(pixels[0]).toBeGreaterThan(200);
    expect(pixels[1]).toBe(0);
  });

  it('tints keeping light and transparency', () => {
    expect(rgbOf('#102030')).toEqual([16, 32, 48]);
    expect(rgbOf('nope')).toEqual([128, 128, 128]);
    const tinted = tintPixels(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]), '#00ff00');
    expect([...tinted.slice(0, 4)]).toEqual([0, 255, 0, 255]);
    expect(tinted[7]).toBe(0);
    expect(tinted[5]).toBeLessThan(100);
  });
});
