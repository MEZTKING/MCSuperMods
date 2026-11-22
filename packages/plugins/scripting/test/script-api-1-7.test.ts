/**
 * Script API 1.7 (ADR 0111 D3 to D6 and their amendment after B525; plan B533): `World.gameRule`
 * and `setGameRule`, `Player.stat`, `addStat` and `openDialog`, and the events `item.crafted`,
 * `item.picked_up`, `player.ate`, `player.slept`, `player.woke` and `player.advancement`. The
 * description changes only by additions to the one of the previous Script API version
 * (`test/fixtures/previous/script-api-v1-1.10.0.json`): exactly the members, types and events
 * below, with the parameter counts the runtime's `ScriptApi` installs, each documented with the
 * Since line; scripts that use them type-check. The release that ships them is decided at the
 * close of the plan (B544), so the Since line says so.
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
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.10.0.json', import.meta.url), 'utf8'),
  ),
);

const SINCE = 'Since runtime 1.5.3.';

const ADDED_MEMBERS = [
  'World.gameRule',
  'World.setGameRule',
  'Player.stat',
  'Player.addStat',
  'Player.openDialog',
  'ActionEvent.args',
];

const ADDED_TYPES = [
  'ItemCraftedEvent',
  'ItemPickedUpEvent',
  'PlayerAteEvent',
  'PlayerSleptEvent',
  'PlayerWokeEvent',
  'PlayerAdvancementEvent',
];

const ADDED_EVENTS: Record<string, { type: string; cancellable: boolean; source: string }> = {
  'item.crafted': { type: 'ItemCraftedEvent', cancellable: false, source: 'CraftedMixin' },
  'item.picked_up': { type: 'ItemPickedUpEvent', cancellable: false, source: 'ItemPickupMixin' },
  'player.ate': { type: 'PlayerAteEvent', cancellable: false, source: 'ConsumeMixin' },
  'player.slept': {
    type: 'PlayerSleptEvent',
    cancellable: false,
    source: 'EntitySleepEvents.START_SLEEPING',
  },
  'player.woke': {
    type: 'PlayerWokeEvent',
    cancellable: false,
    source: 'EntitySleepEvents.STOP_SLEEPING',
  },
  'player.advancement': {
    type: 'PlayerAdvancementEvent',
    cancellable: false,
    source: 'AdvancementRewardsMixin',
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
  return SCRIPT_API.types[type ?? '']?.members[name ?? ''];
}

describe('script API 1.7 is additive', () => {
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
    expect(on(SCRIPT_API).length).toBe(on(PREVIOUS).length + Object.keys(ADDED_EVENTS).length);
  });

  it('keeps every previous line of the typings', () => {
    const lines = new Set(MSM_RUNTIME_TYPINGS.split('\n'));
    const previous = generateTypings(PREVIOUS).split('\n');
    expect(previous.filter((line) => !lines.has(line))).toEqual([]);
  });
});

describe('script API 1.7 members (the list B533 installs)', () => {
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
  });

  it('gives the runtime the kinds and parameter counts it must match', () => {
    expect(signatureCounts(member('World.gameRule'))).toEqual(['1..1']);
    expect(signatureCounts(member('World.setGameRule'))).toEqual(['2..2']);
    expect(signatureCounts(member('Player.stat'))).toEqual(['1..1']);
    expect(signatureCounts(member('Player.addStat'))).toEqual(['2..2']);
    expect(signatureCounts(member('Player.openDialog'))).toEqual(['1..1']);
    expect(member('World.gameRule')).toMatchObject({ returns: 'boolean | number | undefined' });
    expect(member('ActionEvent.args')).toMatchObject({
      kind: 'property',
      type: 'Record<string, unknown> | undefined',
    });
    expect(member('Player.addStat')).toMatchObject({ returns: 'number' });
    expect(member('Player.openDialog')).toMatchObject({ returns: 'boolean' });
    for (const [name, { type, cancellable, source }] of Object.entries(ADDED_EVENTS)) {
      expect(SCRIPT_API.events[name], name).toMatchObject({ type, cancellable, source });
      expect(SCRIPT_API.types[type]?.extends, type).toBe('GameEvent');
      expect(SCRIPT_API.types[type]?.members.cancel, type).toBeUndefined();
      expect(SCRIPT_API.types[type]?.members.player, type).toMatchObject({
        kind: 'property',
        type: 'Player',
      });
    }
    expect(Object.keys(SCRIPT_API.types.ItemCraftedEvent?.members ?? {})).toEqual([
      'player',
      'item',
      'count',
    ]);
    expect(Object.keys(SCRIPT_API.types.ItemPickedUpEvent?.members ?? {})).toEqual([
      'player',
      'item',
      'count',
    ]);
    expect(Object.keys(SCRIPT_API.types.PlayerAteEvent?.members ?? {})).toEqual(['player', 'item']);
    expect(SCRIPT_API.types.PlayerSleptEvent?.members.pos).toMatchObject({ type: 'Pos' });
    expect(SCRIPT_API.types.PlayerWokeEvent?.members.pos).toMatchObject({ type: 'Pos' });
    expect(SCRIPT_API.types.PlayerAdvancementEvent?.members.advancement).toMatchObject({
      type: 'string',
    });
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
      '  gameRule(id: string): boolean | number | undefined;',
      '  setGameRule(id: string, value: boolean | number): void;',
      '  stat(id: string): number;',
      '  addStat(id: string, amount: number): number;',
      '  openDialog(id: string): boolean;',
      'interface ItemCraftedEvent extends GameEvent {',
      'interface PlayerAdvancementEvent extends GameEvent {',
      '  readonly advancement: string;',
      '  on(name: "item.crafted", handler: (e: ItemCraftedEvent) => void): void;',
      '  on(name: "item.picked_up", handler: (e: ItemPickedUpEvent) => void): void;',
      '  on(name: "player.ate", handler: (e: PlayerAteEvent) => void): void;',
      '  on(name: "player.slept", handler: (e: PlayerSleptEvent) => void): void;',
      '  on(name: "player.woke", handler: (e: PlayerWokeEvent) => void): void;',
      '  on(name: "player.advancement", handler: (e: PlayerAdvancementEvent) => void): void;',
    ]) {
      expect(lines, line).toContain(line);
    }
  });
});

describe('scripts using script API 1.7 type-check', () => {
  it('game rules, statistics, dialogs and the new events', () => {
    const src = [
      'import { msm } from "msm:runtime";',
      'msm.events.on("item.crafted", (e) => {',
      '  if (e.item.id === "minecraft:oak_planks") e.player.addStat("demo:planks_made", e.count);',
      '});',
      'msm.events.on("item.picked_up", (e) => {',
      '  const total: number = e.player.addStat("demo:coins", e.item.count);',
      '  if (total >= 100) e.player.openDialog("demo:rich");',
      '});',
      'msm.events.on("player.ate", (e) => msm.log.info(e.player.name + " ate " + e.item.id));',
      'msm.events.on("player.slept", (e) => {',
      '  if (e.world.gameRule("demo:no_sleep") === true) e.player.sendMessage("Too loud at " + e.pos);',
      '});',
      'msm.events.on("player.woke", (e) => e.world.setGameRule("demo:nights", 1 + Number(e.world.gameRule("demo:nights"))));',
      'msm.actions.define("demo:spell", (e) => {',
      '  const power = e.args?.power;',
      '  if (typeof power === "number") e.player?.addStat("demo:spells_cast", power);',
      '});',
      'msm.events.on("player.advancement", (e) => {',
      '  if (e.advancement === "minecraft:story/mine_stone") e.world.setGameRule("minecraft:keep_inventory", true);',
      '  const jumps: number = e.player.stat("minecraft:jump");',
      '  if (jumps > 10 && !e.player.openDialog("demo:jumper")) msm.log.warn("no dialog");',
      '});',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('rejects misuse', () => {
    const bad = [
      'msm.events.on("item.crafted", (e) => e.cancel());',
      'msm.events.on("player.ate", (e) => { const n: number = e.item; });',
      'msm.events.on("player.slept", (e) => { e.pos = e.pos; });',
      'msm.events.on("player.advancement", (e) => e.player.addStat("a:b"));',
      'msm.events.on("player.woke", (e) => e.world.setGameRule("a:b", "on"));',
      'msm.events.on("player.woke", (e) => e.player.openDialog());',
      'msm.events.on("item.picked_up", (e) => { const s: string = e.count; });',
    ];
    for (const line of bad) expect(typeCheck(line), line).not.toEqual([]);
  });
});
