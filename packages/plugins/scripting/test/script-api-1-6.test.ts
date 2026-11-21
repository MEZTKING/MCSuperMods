/**
 * Script API 1.6 (ADR 0096 D3, D4, ADR 0095 D5; plan B455): `Entity.ride` and `dismount`,
 * `World.itemsNear` with the `DroppedItem` type, `ItemRef.contents`, and the events `block.place`,
 * `world.explosion` and `command`. The description changes only by additions to the one of the
 * previous Script API version (`test/fixtures/previous/script-api-v1-1.9.0.json`): exactly the
 * members, types and events below, with the parameter counts the runtime's `ScriptApi` installs,
 * each documented with the Since line; scripts that use them type-check.
 *
 * ADR 0096 D4 also names `Entity.vehicle` and `passengers`; Script API 1.5 (B421) already has them.
 * `CommandEvent.id` is added beside the ADR's `name`, so a handler can tell two projects' commands
 * apart.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateTypings,
  MSM_RUNTIME_TYPINGS,
  parseScriptApi,
  SCRIPT_API,
  type ScriptApi,
  type ScriptApiMember,
} from '../src/index';
import { typeCheck } from './support';

const PREVIOUS: ScriptApi = parseScriptApi(
  JSON.parse(
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.9.0.json', import.meta.url), 'utf8'),
  ),
);

const SINCE = 'Since runtime 1.5.2.';

const ADDED_MEMBERS = ['Entity.ride', 'Entity.dismount', 'World.itemsNear', 'ItemRef.contents'];

const ADDED_TYPES = ['DroppedItem', 'BlockPlaceEvent', 'ExplosionEvent', 'CommandEvent'];

const ADDED_EVENTS: Record<string, { type: string; cancellable: boolean; source: string }> = {
  'block.place': { type: 'BlockPlaceEvent', cancellable: true, source: 'BlockItemPlaceMixin' },
  'world.explosion': { type: 'ExplosionEvent', cancellable: true, source: 'ServerExplosionMixin' },
  command: { type: 'CommandEvent', cancellable: false, source: 'MsmCommands.run' },
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
  return SCRIPT_API.types[type ?? '']?.members[name ?? ''];
}

describe('script API 1.6 is additive', () => {
  it('keeps every type, member, global, event, function and alias of the previous Script API version', () => {
    expect(SCRIPT_API.version).toBe(1);
    for (const [name, type] of Object.entries(PREVIOUS.types)) {
      const now = SCRIPT_API.types[name];
      expect(now?.extends, name).toBe(type.extends);
      expect(now?.doc, name).toBe(type.doc);
      for (const [key, old] of Object.entries(type.members)) {
        expect(now?.members[key], `${name}.${key}`).toEqual(old);
      }
    }
    for (const [name, event] of Object.entries(PREVIOUS.events)) {
      expect(SCRIPT_API.events[name], name).toEqual(event);
    }
    expect(SCRIPT_API.functions).toEqual(PREVIOUS.functions);
    expect(SCRIPT_API.aliases).toEqual(PREVIOUS.aliases);
    const on = (api: ScriptApi) => {
      const events = api.globals.msm?.members.events;
      const member = events?.kind === 'namespace' ? events.members.on : undefined;
      return member?.kind === 'method' ? (member.overloads ?? []) : [];
    };
    expect(on(SCRIPT_API).slice(0, on(PREVIOUS).length)).toEqual(on(PREVIOUS));
  });

  it('keeps every previous line of the typings', () => {
    const lines = new Set(MSM_RUNTIME_TYPINGS.split('\n'));
    const previous = generateTypings(PREVIOUS).split('\n');
    expect(previous.filter((line) => !lines.has(line))).toEqual([]);
  });
});

describe('script API 1.6 members (the list B455 installs)', () => {
  it('adds exactly these types, members and events', () => {
    expect(Object.keys(SCRIPT_API.types).filter((name) => !PREVIOUS.types[name])).toEqual(
      ADDED_TYPES,
    );
    const added = Object.entries(SCRIPT_API.types).flatMap(([name, type]) =>
      PREVIOUS.types[name]
        ? Object.keys(type.members)
            .filter((key) => PREVIOUS.types[name]?.members[key] === undefined)
            .map((key) => `${name}.${key}`)
        : [],
    );
    expect([...added].sort()).toEqual([...ADDED_MEMBERS].sort());
    expect(Object.keys(SCRIPT_API.events).filter((name) => !PREVIOUS.events[name])).toEqual(
      Object.keys(ADDED_EVENTS),
    );
    expect(Object.keys(SCRIPT_API.types.DroppedItem?.members ?? {}).sort()).toEqual([
      'age',
      'item',
      'owner',
      'pos',
      'remove',
      'setItem',
    ]);
  });

  it('gives the runtime the kinds and parameter counts it must match', () => {
    expect(signatureCounts(member('Entity.ride'))).toEqual(['1..1']);
    expect(signatureCounts(member('Entity.dismount'))).toEqual(['0..0']);
    expect(signatureCounts(member('World.itemsNear'))).toEqual(['2..2']);
    expect(member('ItemRef.contents')).toMatchObject({ kind: 'property', type: 'ItemRef[]' });
    expect(SCRIPT_API.types.DroppedItem?.extends).toBeUndefined();
    expect(member('DroppedItem.item')).toMatchObject({ kind: 'property', type: 'ItemRef' });
    expect(member('DroppedItem.pos')).toMatchObject({ kind: 'property', type: 'Pos' });
    expect(member('DroppedItem.age')).toMatchObject({ kind: 'property', type: 'number' });
    expect(member('DroppedItem.owner')).toMatchObject({
      kind: 'property',
      type: 'string | undefined',
    });
    expect(signatureCounts(member('DroppedItem.remove'))).toEqual(['0..0']);
    expect(signatureCounts(member('DroppedItem.setItem'))).toEqual(['1..1']);
    expect(signatureCounts(member('ExplosionEvent.keepBlocks'))).toEqual(['0..0']);
    expect(signatureCounts(member('ExplosionEvent.cancel'))).toEqual(['0..0']);
    expect(signatureCounts(member('BlockPlaceEvent.cancel'))).toEqual(['0..0']);
    expect(member('CommandEvent.cancel')).toBeUndefined();
    for (const [name, { type, cancellable, source }] of Object.entries(ADDED_EVENTS)) {
      expect(SCRIPT_API.events[name], name).toMatchObject({ type, cancellable, source });
      expect(SCRIPT_API.types[type]?.extends, type).toBe('GameEvent');
    }
  });

  it('documents every new type, member and event with the Since line', () => {
    const docs: [string, string | undefined][] = [
      ...ADDED_MEMBERS.map((path): [string, string | undefined] => [path, member(path)?.doc]),
      ...ADDED_TYPES.flatMap((name): [string, string | undefined][] => [
        [name, SCRIPT_API.types[name]?.doc],
        ...Object.entries(SCRIPT_API.types[name]?.members ?? {}).map(
          ([key, m]): [string, string] => [`${name}.${key}`, m.doc],
        ),
      ]),
      ...Object.keys(ADDED_EVENTS).map((name): [string, string | undefined] => [
        name,
        SCRIPT_API.events[name]?.doc,
      ]),
    ];
    for (const [what, doc] of docs) {
      expect(doc?.endsWith(`\n\n${SINCE}`), what).toBe(true);
    }
  });

  it('types the new members in the typings', () => {
    const lines = MSM_RUNTIME_TYPINGS.split('\n');
    for (const line of [
      '  ride(vehicle: Entity): boolean;',
      '  dismount(): boolean;',
      '  itemsNear(pos: Pos, radius: number): DroppedItem[];',
      '  readonly contents: ItemRef[];',
      'interface DroppedItem {',
      '  readonly owner: string | undefined;',
      '  setItem(item: ItemSpec): void;',
      'interface ExplosionEvent extends GameEvent {',
      '  keepBlocks(): void;',
      '  readonly args: Record<string, unknown>;',
      '  on(name: "block.place", handler: (e: BlockPlaceEvent) => void): void;',
      '  on(name: "world.explosion", handler: (e: ExplosionEvent) => void): void;',
      '  on(name: "command", handler: (e: CommandEvent) => void): void;',
    ]) {
      expect(lines, line).toContain(line);
    }
  });
});

describe('scripts using script API 1.6 type-check', () => {
  it('placing, explosions, commands, riding, dropped items and contents', () => {
    const src = [
      'import { msm } from "msm:runtime";',
      'msm.events.on("block.place", (e) => {',
      '  if (e.block === "minecraft:tnt" && e.pos.y > 100) e.cancel();',
      '  if (e.item.count === 1) e.player.sendMessage("Last one: " + e.item.name);',
      '});',
      'msm.events.on("world.explosion", (e) => {',
      '  if (e.cause === "minecraft:creeper") e.keepBlocks();',
      '  if (e.source?.type === "minecraft:tnt" && e.radius > 3) e.cancel();',
      '  e.world.playSound("minecraft:block.bell.use", e.pos);',
      '});',
      'msm.events.on("command", (e) => {',
      '  if (e.id !== "demo:greet" || e.name !== "greet") return;',
      '  const count = e.args.count;',
      '  if (typeof count === "number") e.source?.asPlayer()?.addXp(count);',
      '});',
      'msm.actions.define("demo:tidy", (e) => {',
      '  for (const d of e.world.itemsNear(e.pos, 8)) {',
      '    if (d.age > 1200 && d.owner === undefined) d.remove();',
      '    else if (d.item.id === "minecraft:rotten_flesh") d.setItem({ id: "minecraft:leather", count: d.item.count });',
      '  }',
      '  const p = e.player;',
      '  if (!p) return;',
      '  const held = p.inventory.get("mainhand");',
      '  const inside: number = held ? held.contents.length : 0;',
      '  if (inside === 0 && e.entity && !p.vehicle) p.ride(e.entity);',
      '  else if (p.dismount()) msm.log.info("got off");',
      '});',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('rejects misuse', () => {
    const bad = [
      'msm.events.on("command", (e) => e.cancel());',
      'msm.events.on("world.explosion", (e) => { e.radius = 2; });',
      'msm.events.on("block.place", (e) => { const n: number = e.block; });',
      'msm.events.on("block.place", (e) => e.player.ride());',
      'msm.actions.define("a:b", (e) => e.world.itemsNear(e.pos));',
      'msm.actions.define("a:b", (e) => e.world.itemsNear(e.pos, 2)[0]?.setItem(3));',
      'msm.actions.define("a:b", (e) => e.world.itemsNear(e.pos, 2)[0]?.addVelocity(0, 1, 0));',
      'msm.actions.define("a:b", (e) => { const n: number = e.world.itemsNear(e.pos, 2)[0]?.owner; });',
      'msm.events.on("item.use", (e) => { e.item.contents = []; });',
    ];
    for (const line of bad) expect(typeCheck(line), line).not.toEqual([]);
  });
});
