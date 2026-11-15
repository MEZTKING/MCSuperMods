/**
 * The vehicle validators (ADR 0090): one test per `vehicles.*` code, a clean vehicle with no
 * problems, the skips on targets without facts, and the schema reporting the ids the validators
 * leave to it.
 */
import type { Element, Json, Problem, TargetFacts } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  ENTITIES_PROBLEM_CODES,
  entitiesVehicleValidators,
  VEHICLE_PROBLEM_CODES,
  vehicleGeometry,
  vehicleKind,
} from '../src/index';
import { blockingProblems, element } from './support';
import { vehicleIndexesFor } from './vehicle-support';

const firstBundle = builtInTargets[0] as TargetBundle;
const target: TargetFacts = firstBundle.target;

const geo = element('msm:geo_model', 'example:entity/tank', vehicleGeometry('tank', 'tank'));

/** A tank that passes every check, given {@link geo}. */
const TANK = {
  format: 1,
  model: {
    geometry: 'example:entity/tank',
    texture: 'example:entity/tank',
    paints: [{ id: 'desert', texture: 'example:entity/tank_desert', dye: 'minecraft:sand' }],
  },
  movement: { mode: 'ground', max_speed: 0.25, turns_in_place: true },
  seats: [{ offset: [0, 1.6, 0], weapons: ['cannon'] }],
  engine: { fuel: { items: [{ item: 'minecraft:coal', ticks: 1200 }] } },
  health: { repair: [{ item: 'minecraft:iron_ingot', amount: 20 }] },
  weapons: [
    {
      id: 'cannon',
      projectile: 'minecraft:fire_charge',
      ammo: { item: 'minecraft:fire_charge' },
      muzzle: { bone: 'barrel', offset: [0, 1.3, 2.5] },
      on_fire: 'shot',
    },
  ],
  turret: { bone: 'turret', pitch_bone: 'barrel', seat: 0 },
  parts: { wheels: ['track_left'] },
  item: { texture: 'example:item/tank' },
  events: { shot: { actions: [{ type: 'trigger_event', event: 'smoke' }] }, smoke: {} },
  on_place: 'shot',
  on_tick: { event: 'smoke' },
} as const;

type Patch = Record<string, unknown>;

/** {@link TANK} with top-level fields replaced (a value of `undefined` removes the field). */
function tank(patch: Patch = {}): Element {
  const data: Record<string, unknown> = structuredClone(TANK) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete data[key];
    else data[key] = value;
  }
  return element(vehicleKind.id, 'example:tank', data as Json);
}

async function run(elements: Element[], facts: TargetFacts = target): Promise<Problem[]> {
  const indexes = await vehicleIndexesFor(firstBundle);
  return (
    await Promise.all(
      entitiesVehicleValidators.map((validator) =>
        validator.validate({ elements, target: facts, registry: indexes.registries }),
      ),
    )
  ).flat();
}

const codes = (problems: Problem[]): string[] => problems.map((problem) => problem.code);

describe('vehicle validators', () => {
  it('lists fifteen vehicles.* codes, apart from the entity codes', () => {
    expect(VEHICLE_PROBLEM_CODES).toHaveLength(15);
    expect(new Set(VEHICLE_PROBLEM_CODES).size).toBe(15);
    for (const code of VEHICLE_PROBLEM_CODES) {
      expect(code).toMatch(/^vehicles\.[a-z-]+$/);
      expect(ENTITIES_PROBLEM_CODES as readonly string[]).not.toContain(code);
    }
    expect(plugin.contributes.validators?.slice(-5).map((validator) => validator.id)).toEqual([
      'msm.entities.vehicle-movement',
      'msm.entities.vehicle-model',
      'msm.entities.vehicle-weapons',
      'msm.entities.vehicle-items',
      'msm.entities.vehicle-events',
    ]);
  });

  it('reports nothing for a complete tank with its geometry', async () => {
    expect(await run([tank(), geo])).toEqual([]);
  });

  it('vehicles.unknown-mode: a mode the target does not have', async () => {
    const problems = await run([tank({ movement: { mode: 'rail' } }), geo]);
    expect(codes(problems)).toEqual(['vehicles.unknown-mode']);
    expect(problems[0]).toMatchObject({ severity: 'error', path: '/movement/mode' });
  });

  it('vehicles.too-fast: max_speed above the target cap', async () => {
    const cap = target.vehicles?.maxSpeed as number;
    const facts = { ...target, vehicles: { modes: ['ground'], maxSpeed: 0.2 } };
    const problems = await run([tank(), geo], facts);
    expect(codes(problems)).toEqual(['vehicles.too-fast']);
    expect(problems[0]).toMatchObject({ severity: 'error', path: '/movement/max_speed' });
    expect(cap).toBe(3);
    expect(await run([tank({ movement: { mode: 'ground', max_speed: cap } }), geo])).toEqual([]);
  });

  it('skips mode and speed checks on a target without vehicle facts', async () => {
    const { vehicles: _vehicles, ...facts } = target;
    expect(
      await run([tank({ movement: { mode: 'rail', max_speed: 99 } }), geo], facts as TargetFacts),
    ).toEqual([]);
  });

  it('vehicles.takeoff-too-fast: a plane that never reaches its takeoff speed', async () => {
    const problems = await run([
      tank({ movement: { mode: 'air', max_speed: 0.8, takeoff_speed: 1 } }),
      geo,
    ]);
    expect(codes(problems)).toEqual(['vehicles.takeoff-too-fast']);
    expect(problems[0]?.severity).toBe('warning');
    // Without max_speed the default top speed of a plane (1.2) counts.
    expect(codes(await run([tank({ movement: { mode: 'air', takeoff_speed: 1 } }), geo]))).toEqual(
      [],
    );
    expect(
      codes(await run([tank({ movement: { mode: 'air', takeoff_speed: 1.5 } }), geo])),
    ).toEqual(['vehicles.takeoff-too-fast']);
  });

  it('vehicles.unknown-geometry: the geo model is not in the project', async () => {
    const problems = await run([tank()]);
    expect(codes(problems)).toEqual(['vehicles.unknown-geometry']);
    expect(problems[0]).toMatchObject({ severity: 'warning', path: '/model/geometry' });
    const empty = await run([tank({ model: { geometry: '', texture: 'example:entity/tank' } })]);
    expect(empty[0]?.message).toContain('has no model');
  });

  it('vehicles.unknown-bone: turret, parts and muzzle bones missing from the geometry', async () => {
    const problems = await run([
      tank({
        turret: { bone: 'dome', pitch_bone: 'barrel' },
        parts: { wheels: ['track_left', 'wheel_x'], rotors: ['rotor'] },
        weapons: [
          {
            id: 'cannon',
            projectile: 'minecraft:fire_charge',
            muzzle: { bone: 'tip', offset: [0, 0, 0] },
            on_fire: 'shot',
          },
        ],
      }),
      geo,
    ]);
    expect(codes(problems)).toEqual([
      'vehicles.unknown-bone',
      'vehicles.unknown-bone',
      'vehicles.unknown-bone',
      'vehicles.unknown-bone',
    ]);
    expect(problems.map((problem) => problem.path)).toEqual([
      '/turret/bone',
      '/parts/wheels/1',
      '/parts/rotors/0',
      '/weapons/0/muzzle/bone',
    ]);
  });

  it('vehicles.unknown-animations: the animation set is not in the project', async () => {
    const problems = await run([
      tank({ model: { ...TANK.model, animations: 'example:entity/tank_animations' } }),
      geo,
    ]);
    expect(codes(problems)).toEqual(['vehicles.unknown-animations']);
    expect(problems[0]).toMatchObject({ severity: 'warning', path: '/model/animations' });
  });

  it('vehicles.vanilla-renderer-subset: an animation set using what the renderer skips', async () => {
    const set = (bones: Json): Element =>
      element('msm:animation', 'example:entity/tank_animations', {
        format_version: '1.8.0',
        animations: { moving: { loop: true, bones } },
      });
    const withSet = tank({
      model: { ...TANK.model, animations: 'example:entity/tank_animations' },
    });
    const plain = set({ turret: { rotation: { '0.0': [0, 0, 0], '1.0': [0, 90, 0] } } });
    expect(await run([withSet, geo, plain])).toEqual([]);
    const molang = set({ turret: { rotation: [0, 'q.anim_time * 90', 0] } });
    const problems = await run([withSet, geo, molang]);
    expect(codes(problems)).toEqual(['vehicles.vanilla-renderer-subset']);
    expect(problems[0]?.message).toContain('Molang expressions play as 0 ("moving")');
  });

  it('vehicles.unknown-projectile: neither a vanilla projectile nor a throwable project item', async () => {
    const weapon = (projectile: string) => ({
      weapons: [{ id: 'cannon', projectile, on_fire: 'shot' }],
    });
    const plain = element('msm:item', 'example:shell', { format: 1, components: {} });
    const throwable = element('msm:item', 'example:shell', {
      format: 1,
      components: { 'msm:throwable': {} },
    });
    const vanillaMiss = await run([tank(weapon('minecraft:stone')), geo]);
    expect(codes(vanillaMiss)).toEqual(['vehicles.unknown-projectile']);
    expect(vanillaMiss[0]).toMatchObject({ severity: 'error', path: '/weapons/0/projectile' });
    const notThrowable = await run([tank(weapon('example:shell')), geo, plain]);
    expect(notThrowable[0]?.message).toContain('has no "msm:throwable"');
    expect(await run([tank(weapon('example:shell')), geo, throwable])).toEqual([]);
    const { entities: _entities, ...facts } = target;
    expect(await run([tank(weapon('minecraft:stone')), geo], facts as TargetFacts)).toEqual([]);
  });

  it('vehicles.duplicate-weapon-id: two weapons with one id', async () => {
    const shot = { id: 'cannon', projectile: 'minecraft:arrow' };
    const problems = await run([tank({ weapons: [shot, shot] }), geo]);
    expect(codes(problems)).toEqual(['vehicles.duplicate-weapon-id']);
    expect(problems[0]).toMatchObject({ severity: 'error', path: '/weapons/1/id' });
  });

  it('vehicles.unknown-seat-weapon: a seat firing a weapon the vehicle lacks', async () => {
    const problems = await run([
      tank({ seats: [{ offset: [0, 1, 0], weapons: ['cannon', 'laser'] }] }),
      geo,
    ]);
    expect(codes(problems)).toEqual(['vehicles.unknown-seat-weapon']);
    expect(problems[0]).toMatchObject({ severity: 'error', path: '/seats/0/weapons/1' });
  });

  it('vehicles.turret-seat-missing: the turret aimed from a seat past the last', async () => {
    const problems = await run([tank({ turret: { bone: 'turret', seat: 1 } }), geo]);
    expect(codes(problems)).toEqual(['vehicles.turret-seat-missing']);
    expect(problems[0]).toMatchObject({ severity: 'error', path: '/turret/seat' });
    // Without seats the vehicle has one seat on top.
    expect(
      codes(await run([tank({ seats: undefined, turret: { bone: 'turret', seat: 1 } }), geo])),
    ).toEqual(['vehicles.turret-seat-missing']);
    expect(codes(await run([tank({ seats: undefined }), geo]))).toEqual([]);
  });

  it('vehicles.duplicate-paint-id: two paints with one id', async () => {
    const paint = { id: 'desert', texture: 'example:entity/tank_desert' };
    const problems = await run([tank({ model: { ...TANK.model, paints: [paint, paint] } }), geo]);
    expect(codes(problems)).toEqual(['vehicles.duplicate-paint-id']);
    expect(problems[0]).toMatchObject({ severity: 'error', path: '/model/paints/1/id' });
  });

  it('vehicles.item-used-twice: one item for two jobs, or listed twice for one', async () => {
    const problems = await run([
      tank({
        health: {
          repair: [
            { item: 'minecraft:coal', amount: 1 },
            { item: 'minecraft:iron_ingot', amount: 1 },
            { item: 'minecraft:iron_ingot', amount: 2 },
          ],
        },
      }),
      geo,
    ]);
    expect(codes(problems)).toEqual(['vehicles.item-used-twice', 'vehicles.item-used-twice']);
    expect(problems.map((problem) => problem.path)).toEqual([
      '/health/repair/0/item',
      '/health/repair/2/item',
    ]);
    expect(problems[0]?.message).toContain('both for fuel and for repair');
    // Weapons may share an ammunition item.
    const shared = {
      projectile: 'minecraft:arrow',
      ammo: { item: 'minecraft:arrow' },
    };
    expect(
      await run([
        tank({
          weapons: [
            { id: 'a', ...shared },
            { id: 'b', ...shared },
          ],
          seats: undefined,
          on_place: undefined,
        }),
        geo,
      ]),
    ).toEqual([]);
  });

  it('vehicles.item-picture-missing: an item without model or texture', async () => {
    const problems = await run([tank({ item: undefined }), geo]);
    expect(codes(problems)).toEqual(['vehicles.item-picture-missing']);
    expect(problems[0]).toMatchObject({ severity: 'warning', path: '/item' });
    expect(codes(await run([tank({ item: { model: 'example:item/tank_model' } }), geo]))).toEqual(
      [],
    );
  });

  it('vehicles.unknown-event: triggers, on_fire and trigger_event naming undeclared events', async () => {
    const problems = await run([
      tank({
        on_place: 'placed',
        on_tick: { event: 'tick' },
        events: { shot: { actions: [{ type: 'trigger_event', event: 'boom' }] } },
      }),
      geo,
    ]);
    expect(codes(problems)).toEqual([
      'vehicles.unknown-event',
      'vehicles.unknown-event',
      'vehicles.unknown-event',
    ]);
    expect(problems.map((problem) => problem.path)).toEqual([
      '/on_place',
      '/on_tick/event',
      '/events/shot/actions/0/event',
    ]);
    const noEvents = await run([
      tank({ events: undefined, on_place: undefined, on_tick: undefined }),
      geo,
    ]);
    expect(codes(noEvents)).toEqual(['vehicles.unknown-event']);
    expect(noEvents[0]?.path).toBe('/weapons/0/on_fire');
  });

  it('leaves unknown fuel, ammunition, repair and immune_to ids to the schema', async () => {
    const indexes = await vehicleIndexesFor(firstBundle);
    const data = structuredClone(TANK) as unknown as Record<string, Json>;
    data.engine = { fuel: { items: [{ item: 'minecraft:rocket_fuel', ticks: 10 }] } };
    data.health = {
      repair: [{ item: 'example:wrench', amount: 1 }],
      immune_to: ['minecraft:laser'],
    };
    data.weapons = [
      {
        id: 'cannon',
        projectile: 'minecraft:fire_charge',
        ammo: { item: 'minecraft:shells' },
        on_fire: 'shot',
      },
    ];
    const problems = blockingProblems(indexes, vehicleKind.schema, data as Json);
    expect(problems.map((problem) => [problem.code, problem.path])).toEqual(
      expect.arrayContaining([
        ['schema.unknown-id', '/engine/fuel/items/0/item'],
        ['schema.unknown-id', '/health/repair/0/item'],
        ['schema.unknown-id', '/health/immune_to/0'],
        ['schema.unknown-id', '/weapons/0/ammo/item'],
      ]),
    );
    expect(await run([element(vehicleKind.id, 'example:tank', data as Json), geo])).toEqual([]);
  });
});
