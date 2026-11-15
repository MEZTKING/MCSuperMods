/**
 * Script API 1.5 (ADR 0089 D8, ADR 0088 D6, ADR 0090 D11; plan B421): the player's HUD elements,
 * riding (`Entity.vehicle`, `passengers`, `isVehicle`, `asVehicle`), the `Vehicle` type, and the
 * key and vehicle events. The description changes only by additions to the one of the previous
 * Script API version (`test/fixtures/previous/script-api-v1-1.8.0.json`): exactly the members,
 * types and events below, with the parameter counts the runtime's `ScriptApi` installs, each
 * documented with the Since line; scripts that use them type-check. The 1.5 description as its Script API
 * version had it is `test/fixtures/previous/script-api-v1-1.9.0.json`; later additions (1.6, ADR 0096 D4) are
 * pinned in `script-api-1-6.test.ts`.
 *
 * ADR 0089 D8 names the vehicle's damage `damage` and `setDamage`; they are `damageTaken` and
 * `setDamageTaken` because `Entity.damage(amount)` is already a method that `Vehicle` inherits.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateTypings,
  MSM_RUNTIME_TYPINGS,
  parseScriptApi,
  type ScriptApi,
  type ScriptApiMember,
} from '../src/index';
import { typeCheck } from './support';

const PREVIOUS: ScriptApi = parseScriptApi(
  JSON.parse(
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.8.0.json', import.meta.url), 'utf8'),
  ),
);

/** The 1.5 description as its Script API version had it, before the 1.6 additions. */
const API_1_5: ScriptApi = parseScriptApi(
  JSON.parse(
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.9.0.json', import.meta.url), 'utf8'),
  ),
);

const SINCE = 'Since runtime 1.5.1.';

const ADDED_MEMBERS = [
  'Entity.vehicle',
  'Entity.passengers',
  'Entity.isVehicle',
  'Entity.asVehicle',
  'Player.showHud',
  'Player.hideHud',
  'Player.setHud',
];

const ADDED_TYPES = [
  'Vehicle',
  'KeyPressedEvent',
  'KeyReleasedEvent',
  'VehicleMountedEvent',
  'VehicleDismountedEvent',
  'VehicleFiredEvent',
  'VehicleDestroyedEvent',
];

const ADDED_EVENTS: Record<string, { type: string; source: string }> = {
  'key.pressed': { type: 'KeyPressedEvent', source: 'KeyBinds.KeyListener.pressed' },
  'key.released': { type: 'KeyReleasedEvent', source: 'KeyBinds.KeyListener.released' },
  'vehicle.mounted': { type: 'VehicleMountedEvent', source: 'VehicleEvents.Listener.mounted' },
  'vehicle.dismounted': {
    type: 'VehicleDismountedEvent',
    source: 'VehicleEvents.Listener.dismounted',
  },
  'vehicle.fired': { type: 'VehicleFiredEvent', source: 'VehicleEvents.Listener.fired' },
  'vehicle.destroyed': {
    type: 'VehicleDestroyedEvent',
    source: 'VehicleEvents.Listener.destroyed',
  },
};

function signatureCounts(member: ScriptApiMember | undefined): string[] {
  if (member?.kind !== 'method') return [];
  const signatures = member.overloads ?? [{ params: member.params ?? [] }];
  return signatures.map(({ params }) => {
    const required = params.filter((param) => param.optional !== true).length;
    return `${required}..${params.length}`;
  });
}

function member(path: string): ScriptApiMember | undefined {
  const [type, name] = path.split('.');
  return API_1_5.types[type ?? '']?.members[name ?? ''];
}

describe('script API 1.5 is additive', () => {
  it('keeps every type, member, global, event, function and alias of the previous Script API version', () => {
    expect(API_1_5.version).toBe(1);
    for (const [name, type] of Object.entries(PREVIOUS.types)) {
      const now = API_1_5.types[name];
      expect(now?.extends, name).toBe(type.extends);
      expect(now?.doc, name).toBe(type.doc);
      for (const [key, old] of Object.entries(type.members)) {
        expect(now?.members[key], `${name}.${key}`).toEqual(old);
      }
    }
    for (const [name, event] of Object.entries(PREVIOUS.events)) {
      expect(API_1_5.events[name], name).toEqual(event);
    }
    expect(API_1_5.functions).toEqual(PREVIOUS.functions);
    expect(API_1_5.aliases).toEqual(PREVIOUS.aliases);
    const on = (api: ScriptApi) => {
      const events = api.globals.msm?.members.events;
      const member = events?.kind === 'namespace' ? events.members.on : undefined;
      return member?.kind === 'method' ? (member.overloads ?? []) : [];
    };
    expect(on(API_1_5).slice(0, on(PREVIOUS).length)).toEqual(on(PREVIOUS));
  });

  it('keeps every previous line of the typings', () => {
    const lines = new Set(MSM_RUNTIME_TYPINGS.split('\n'));
    const previous = generateTypings(PREVIOUS).split('\n');
    expect(previous.filter((line) => !lines.has(line))).toEqual([]);
  });
});

describe('script API 1.5 members (the list B421 installs)', () => {
  it('adds exactly these types, members and events', () => {
    expect(Object.keys(API_1_5.types).filter((name) => !PREVIOUS.types[name])).toEqual(ADDED_TYPES);
    const added = Object.entries(API_1_5.types).flatMap(([name, type]) =>
      PREVIOUS.types[name]
        ? Object.keys(type.members)
            .filter((key) => PREVIOUS.types[name]?.members[key] === undefined)
            .map((key) => `${name}.${key}`)
        : [],
    );
    expect([...added].sort()).toEqual([...ADDED_MEMBERS].sort());
    expect(Object.keys(API_1_5.events).filter((name) => !PREVIOUS.events[name])).toEqual(
      Object.keys(ADDED_EVENTS),
    );
    expect(Object.keys(API_1_5.types.Vehicle?.members ?? {}).sort()).toEqual([
      'ammo',
      'damageTaken',
      'driver',
      'fuel',
      'setAmmo',
      'setDamageTaken',
      'setFuel',
    ]);
  });

  it('gives the runtime the kinds and parameter counts it must match', () => {
    expect(member('Entity.vehicle')).toMatchObject({
      kind: 'property',
      type: 'Entity | undefined',
    });
    expect(member('Entity.passengers')).toMatchObject({ kind: 'property', type: 'Entity[]' });
    expect(member('Entity.isVehicle')).toMatchObject({ kind: 'property', type: 'boolean' });
    expect(signatureCounts(member('Entity.asVehicle'))).toEqual(['0..0']);
    expect(signatureCounts(member('Player.showHud'))).toEqual(['1..1']);
    expect(signatureCounts(member('Player.hideHud'))).toEqual(['1..1']);
    expect(signatureCounts(member('Player.setHud'))).toEqual(['2..2']);
    expect(API_1_5.types.Vehicle?.extends).toBe('Entity');
    expect(member('Vehicle.fuel')).toMatchObject({ kind: 'property', type: 'number' });
    expect(member('Vehicle.damageTaken')).toMatchObject({ kind: 'property', type: 'number' });
    expect(member('Vehicle.driver')).toMatchObject({
      kind: 'property',
      type: 'Player | undefined',
    });
    expect(signatureCounts(member('Vehicle.setFuel'))).toEqual(['1..1']);
    expect(signatureCounts(member('Vehicle.setDamageTaken'))).toEqual(['1..1']);
    expect(signatureCounts(member('Vehicle.ammo'))).toEqual(['1..1']);
    expect(signatureCounts(member('Vehicle.setAmmo'))).toEqual(['2..2']);
    for (const [name, { type, source }] of Object.entries(ADDED_EVENTS)) {
      expect(API_1_5.events[name], name).toMatchObject({ type, cancellable: false, source });
      expect(API_1_5.types[type]?.extends, type).toBe('GameEvent');
    }
  });

  it('documents every new type, member and event with the Since line', () => {
    const docs: [string, string | undefined][] = [
      ...ADDED_MEMBERS.map((path): [string, string | undefined] => [path, member(path)?.doc]),
      ...ADDED_TYPES.flatMap((name): [string, string | undefined][] => [
        [name, API_1_5.types[name]?.doc],
        ...Object.entries(API_1_5.types[name]?.members ?? {}).map(([key, m]): [string, string] => [
          `${name}.${key}`,
          m.doc,
        ]),
      ]),
      ...Object.keys(ADDED_EVENTS).map((name): [string, string | undefined] => [
        name,
        API_1_5.events[name]?.doc,
      ]),
    ];
    for (const [what, doc] of docs) {
      expect(doc?.endsWith(`\n\n${SINCE}`), what).toBe(true);
    }
  });

  it('types the new members in the typings', () => {
    const lines = MSM_RUNTIME_TYPINGS.split('\n');
    for (const line of [
      '  readonly vehicle: Entity | undefined;',
      '  readonly passengers: Entity[];',
      '  readonly isVehicle: boolean;',
      '  asVehicle(): Vehicle | undefined;',
      '  showHud(id: string): boolean;',
      '  hideHud(id: string): boolean;',
      '  setHud(id: string, value: number | string): boolean;',
      'interface Vehicle extends Entity {',
      '  readonly fuel: number;',
      '  setFuel(ticks: number): void;',
      '  readonly damageTaken: number;',
      '  setDamageTaken(amount: number): void;',
      '  ammo(weapon: string | number): number;',
      '  setAmmo(weapon: string | number, rounds: number): void;',
      '  readonly driver: Player | undefined;',
      '  on(name: "key.pressed", handler: (e: KeyPressedEvent) => void): void;',
      '  on(name: "vehicle.destroyed", handler: (e: VehicleDestroyedEvent) => void): void;',
    ]) {
      expect(lines, line).toContain(line);
    }
  });
});

describe('scripts using script API 1.5 type-check', () => {
  it('HUD elements, keys and vehicles', () => {
    const src = [
      'import { msm } from "msm:runtime";',
      'msm.events.on("key.pressed", (e) => {',
      '  if (e.key === "demo:dash") e.player.setHud("demo:charge", 0);',
      '  const shown: boolean = e.player.showHud("demo:mana");',
      '  if (!shown) e.player.hideHud("demo:mana");',
      '  e.player.setHud("demo:status", "Dashing");',
      '});',
      'msm.events.on("key.released", (e) => e.player.sendMessage(e.key));',
      'msm.events.on("vehicle.mounted", (e) => {',
      '  if (e.vehicle.driver === undefined) return;',
      '  e.vehicle.setFuel(e.vehicle.fuel + 200);',
      '  e.vehicle.setAmmo("cannon", e.vehicle.ammo(0) + 4);',
      '  e.vehicle.setDamageTaken(Math.max(0, e.vehicle.damageTaken - 5));',
      '  e.vehicle.damage(1);',
      '});',
      'msm.events.on("vehicle.dismounted", (e) => e.player.hideHud("demo:speed"));',
      'msm.events.on("vehicle.fired", (e) => msm.log.info(e.weapon + " " + e.player.name));',
      'msm.events.on("vehicle.destroyed", (e) => {',
      '  for (const rider of e.vehicle.passengers) rider.addVelocity(0, 0.5, 0);',
      '  if (e.player) e.player.addXp(5);',
      '});',
      'msm.events.on("player.tick", (e) => {',
      '  const car = e.player.vehicle?.asVehicle();',
      '  if (car && car.isVehicle && car.fuel < 100) e.player.showActionBar("Low fuel");',
      '});',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('rejects misuse', () => {
    const bad = [
      'msm.events.on("key.pressed", (e) => e.player.setHud("a:b"));',
      'msm.events.on("key.pressed", (e) => e.player.setHud("a:b", true));',
      'msm.events.on("key.pressed", (e) => e.player.showHud());',
      'msm.events.on("vehicle.mounted", (e) => { e.vehicle.fuel = 3; });',
      'msm.events.on("vehicle.mounted", (e) => e.vehicle.setAmmo("cannon"));',
      'msm.events.on("vehicle.mounted", (e) => e.vehicle.ammo(true));',
      'msm.events.on("vehicle.destroyed", (e) => e.player.addXp(5));',
      'msm.events.on("vehicle.fired", (e) => { const n: number = e.weapon; });',
      'msm.events.on("player.tick", (e) => e.player.vehicle?.setFuel(5));',
      'msm.events.on("player.tick", (e) => { e.player.passengers = []; });',
    ];
    for (const line of bad) expect(typeCheck(line), line).not.toEqual([]);
  });
});
