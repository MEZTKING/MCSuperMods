/**
 * Script API 1.1 (ADR 0065): the description changes only by additions to the one of runtime
 * 1.4.0 (`test/fixtures/previous/script-api-v1-1.4.0.json`), pins the new members and events the
 * runtime's `ScriptApi` must install (B248), and type-checks scripts that use them. The exact list
 * of 1.1 additions compares the 1.1 description as runtime 1.5.0 has it
 * (`test/fixtures/previous/script-api-v1-1.5.0.json`), so later additions (1.2, ADR 0076 D5) are
 * pinned in their own test file.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkScriptApi,
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
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.4.0.json', import.meta.url), 'utf8'),
  ),
);

/** The 1.1 description as runtime 1.5.0 has it, before the 1.2 additions. */
const API_1_1: ScriptApi = parseScriptApi(
  JSON.parse(
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.5.0.json', import.meta.url), 'utf8'),
  ),
);

const SINCE = 'Since runtime 1.5.0.';

/** `required..total` of every signature of a method member. */
function signatureCounts(member: ScriptApiMember): string[] {
  if (member.kind !== 'method') return [];
  const signatures = member.overloads ?? [{ params: member.params ?? [] }];
  return signatures.map(({ params }) => {
    const required = params.filter((param) => param.optional !== true).length;
    return `${required}..${params.length}`;
  });
}

/** Asserts every member of `before` is in `after` with the same kind, type and signatures. */
function expectSuperset(
  where: string,
  before: Record<string, ScriptApiMember>,
  after: Record<string, ScriptApiMember> | undefined,
): void {
  expect(after, where).toBeDefined();
  for (const [name, old] of Object.entries(before)) {
    const now = after?.[name];
    const at = `${where}.${name}`;
    expect(now?.kind, at).toBe(old.kind);
    if (old.kind === 'property' && now?.kind === 'property') {
      expect(now.type, at).toBe(old.type);
      expect(now.optional ?? false, at).toBe(old.optional ?? false);
    } else if (old.kind === 'method' && now?.kind === 'method') {
      const counts = signatureCounts(now);
      for (const count of signatureCounts(old)) expect(counts, at).toContain(count);
    } else if (old.kind === 'namespace' && now?.kind === 'namespace') {
      expectSuperset(at, old.members, now.members);
    }
  }
}

/** Member names of `after` that `before` does not have, as `Owner.member`. */
function addedMembers(
  owner: string,
  before: Record<string, ScriptApiMember> | undefined,
  after: Record<string, ScriptApiMember>,
): string[] {
  const added: string[] = [];
  for (const [name, member] of Object.entries(after)) {
    const old = before?.[name];
    if (old === undefined) added.push(`${owner}.${name}`);
    else if (old.kind === 'namespace' && member.kind === 'namespace') {
      added.push(...addedMembers(`${owner}.${name}`, old.members, member.members));
    }
  }
  return added;
}

describe('script API 1.1 is additive', () => {
  it('keeps the version at 1', () => {
    expect(SCRIPT_API.version).toBe(1);
    expect(PREVIOUS.version).toBe(1);
  });

  it('keeps every type, member, global, function and event of runtime 1.4.0', () => {
    for (const [name, type] of Object.entries(PREVIOUS.types)) {
      expect(SCRIPT_API.types[name]?.extends, name).toBe(type.extends);
      expectSuperset(name, type.members, SCRIPT_API.types[name]?.members);
    }
    for (const [name, global] of Object.entries(PREVIOUS.globals)) {
      expectSuperset(name, global.members, SCRIPT_API.globals[name]?.members);
    }
    expectSuperset('functions', PREVIOUS.functions ?? {}, SCRIPT_API.functions);
    for (const [name, event] of Object.entries(PREVIOUS.events)) {
      expect(SCRIPT_API.events[name], name).toEqual(event);
    }
  });

  it('keeps every previous signature line of the typings', () => {
    // Widened parameter types (`give` takes an ItemSpec) are the only lines that change.
    const widened = new Set(['  give(item: string, count?: number): void;']);
    const lines = new Set(MSM_RUNTIME_TYPINGS.split('\n'));
    const previous = generateTypings(PREVIOUS)
      .split('\n')
      .filter((line) => /^ {2}(readonly |[a-zA-Z]+\()/.test(line) && !widened.has(line));
    expect(previous.length).toBeGreaterThan(100);
    expect(previous.filter((line) => !lines.has(line))).toEqual([]);
    expect(MSM_RUNTIME_TYPINGS).toContain('  give(item: ItemSpec, count?: number): void;');
  });
});

describe('script API 1.1 members (the list B248 installs)', () => {
  it('adds exactly these types, members and events', () => {
    const newTypes = Object.keys(API_1_1.types).filter((name) => !PREVIOUS.types[name]);
    expect(newTypes.sort()).toEqual([
      'BossBar',
      'EntityDamagedEvent',
      'Inventory',
      'PlayerChangeDimensionEvent',
      'PlayerChatEvent',
      'PlayerLeaveEvent',
      'PlayerRespawnEvent',
      'PlayerTickEvent',
      'RayHit',
    ]);
    const added = [
      ...Object.entries(API_1_1.types).flatMap(([name, type]) =>
        PREVIOUS.types[name] ? addedMembers(name, PREVIOUS.types[name]?.members, type.members) : [],
      ),
      ...addedMembers('msm', PREVIOUS.globals.msm?.members, API_1_1.globals.msm?.members ?? {}),
    ];
    expect(added.sort()).toEqual([
      'Entity.equipment',
      'Entity.raycast',
      'Entity.setEquipment',
      'EntityHurtEvent.direct',
      'EntityHurtEvent.source',
      'ItemRef.damage',
      'ItemRef.getComponent',
      'ItemRef.hasComponent',
      'ItemRef.maxCount',
      'ItemRef.maxDamage',
      'ItemRef.name',
      'Player.addXp',
      'Player.addXpLevels',
      'Player.clearTitle',
      'Player.food',
      'Player.gameMode',
      'Player.inventory',
      'Player.saturation',
      'Player.setFood',
      'Player.setGameMode',
      'Player.setXpLevels',
      'Player.showActionBar',
      'Player.showTitle',
      'Player.xpLevel',
      'Player.xpPoints',
      'World.raycast',
      'msm.bossBars',
      'msm.getWorld',
      'msm.players',
    ]);
    expect(Object.keys(API_1_1.events).filter((name) => !PREVIOUS.events[name])).toEqual([
      'player.tick',
      'player.respawn',
      'player.leave',
      'player.changeDimension',
      'player.chat',
      'entity.damaged',
    ]);
    expect(Object.keys(API_1_1.aliases ?? {}).sort()).toEqual([
      'BossBarColor',
      'BossBarStyle',
      'EquipmentSlot',
      'GameMode',
      'InventorySlot',
      'ItemSpec',
      'RaycastOptions',
    ]);
  });

  it('gives the runtime the parameter counts it must match', () => {
    const counts = (owner: Record<string, ScriptApiMember> | undefined, name: string) => {
      const member = owner?.[name];
      return member === undefined ? [] : signatureCounts(member);
    };
    const entity = SCRIPT_API.types.Entity?.members;
    expect(counts(entity, 'damage')).toEqual(['1..1', '2..2']);
    expect(counts(entity, 'teleport')).toEqual(['1..1', '2..2']);
    expect(counts(entity, 'raycast')).toEqual(['1..2']);
    expect(counts(entity, 'setEquipment')).toEqual(['1..2']);
    expect(counts(SCRIPT_API.types.World?.members, 'raycast')).toEqual(['3..4']);
    expect(counts(SCRIPT_API.types.Inventory?.members, 'setComponent')).toEqual(['2..3']);
    expect(counts(SCRIPT_API.types.Player?.members, 'showTitle')).toEqual(['1..2']);
    const events = SCRIPT_API.globals.msm?.members.events;
    const on = events?.kind === 'namespace' ? events.members : undefined;
    const tick = counts(on, 'on');
    expect(tick.filter((count) => count === '2..3')).toHaveLength(1);
    expect(tick.filter((count) => count === '2..2')).toHaveLength(14);
  });

  it('describes the new events', () => {
    const pick = (name: string) => {
      const { type, cancellable, source } = SCRIPT_API.events[name] ?? {};
      return { type, cancellable, source };
    };
    expect(pick('player.tick')).toEqual({
      type: 'PlayerTickEvent',
      cancellable: false,
      source: 'ServerTickEvents.END_SERVER_TICK',
    });
    expect(pick('player.respawn')).toEqual({
      type: 'PlayerRespawnEvent',
      cancellable: false,
      source: 'ServerPlayerEvents.AFTER_RESPAWN',
    });
    expect(pick('player.leave')).toEqual({
      type: 'PlayerLeaveEvent',
      cancellable: false,
      source: 'ServerPlayerEvents.LEAVE',
    });
    expect(pick('player.changeDimension')).toEqual({
      type: 'PlayerChangeDimensionEvent',
      cancellable: false,
      source: 'ServerEntityLevelChangeEvents.AFTER_PLAYER_CHANGE_LEVEL',
    });
    expect(pick('player.chat')).toEqual({
      type: 'PlayerChatEvent',
      cancellable: true,
      source: 'ServerMessageEvents.ALLOW_CHAT_MESSAGE',
    });
    expect(pick('entity.damaged')).toEqual({
      type: 'EntityDamagedEvent',
      cancellable: false,
      source: 'ServerLivingEntityEvents.AFTER_DAMAGE',
    });
  });

  it('documents every new type, member, event and alias with the Since line', () => {
    const docs: [string, string][] = [];
    for (const [name, type] of Object.entries(API_1_1.types)) {
      const old = PREVIOUS.types[name];
      if (old === undefined) docs.push([name, type.doc]);
      for (const added of addedMembers(name, old?.members, type.members)) {
        const member = type.members[added.slice(name.length + 1)];
        if (old !== undefined && member !== undefined) docs.push([added, member.doc]);
      }
    }
    for (const [name, member] of Object.entries(API_1_1.globals.msm?.members ?? {})) {
      if (PREVIOUS.globals.msm?.members[name] === undefined) docs.push([`msm.${name}`, member.doc]);
    }
    for (const [name, event] of Object.entries(API_1_1.events)) {
      if (PREVIOUS.events[name] === undefined) docs.push([name, event.doc]);
    }
    for (const [name, alias] of Object.entries(API_1_1.aliases ?? {})) {
      docs.push([name, alias.doc]);
    }
    expect(docs.length).toBeGreaterThan(50);
    for (const [name, doc] of docs) expect(doc.endsWith(`\n\n${SINCE}`), name).toBe(true);
    // Methods with an example say "for example" with code.
    expect(API_1_1.types.Inventory?.members.count?.doc).toContain('for example `player.');
  });
});

describe('the generator for 1.1', () => {
  it('emits aliases as global types exported from msm:runtime', () => {
    expect(MSM_RUNTIME_TYPINGS).toContain(
      'type ItemSpec = string | { id: string; count?: number; components?: Record<string, unknown> };',
    );
    expect(MSM_RUNTIME_TYPINGS).toContain('type InventorySlot = number | EquipmentSlot;');
    expect(MSM_RUNTIME_TYPINGS).toContain('  export type ItemSpec = globalThis.ItemSpec;');
  });

  it('emits multi-line docs with the Since line', () => {
    expect(MSM_RUNTIME_TYPINGS).toContain(
      [
        '  /**',
        "   * Removes the title and subtitle from the player's screen.",
        '   *',
        `   * ${SINCE}`,
        '   */',
        '  clearTitle(): void;',
      ].join('\n'),
    );
  });

  it('reports aliases named like types and required parameters after a handler', () => {
    const broken = structuredClone(SCRIPT_API);
    broken.aliases = { ...broken.aliases, Pos: { type: 'string', doc: 'x' } };
    const events = broken.globals.msm?.members.events;
    const on = events?.kind === 'namespace' ? events.members.on : undefined;
    const tick =
      on?.kind === 'method' ? on.overloads?.find((o) => o.params.length === 3) : undefined;
    if (tick?.params[2] !== undefined) tick.params[2].optional = false;
    expect(checkScriptApi(broken)).toEqual([
      'Type alias Pos is also a type.',
      'The on overload of player.tick has a required parameter after the handler.',
    ]);
    expect(() => generateTypings(broken)).toThrow(/Type alias Pos/);
  });
});

describe('scripts using script API 1.1 type-check', () => {
  it('items, inventory, equipment and player state', () => {
    const src = [
      'msm.events.on("item.use", (e) => {',
      '  const item = e.item;',
      '  const worn: number = item.maxDamage - item.damage;',
      '  if (item.hasComponent("minecraft:custom_name")) msm.log.info(item.name + String(item.maxCount));',
      '  const ench = item.getComponent("minecraft:enchantments");',
      '  if (typeof ench === "object" && ench !== null) msm.log.info(String(worn));',
      '  const inv = e.player.inventory;',
      '  const slot: number = inv.find("minecraft:emerald");',
      '  if (slot >= 0 && inv.count("minecraft:emerald") >= 3) {',
      '    const removed: number = inv.remove("minecraft:emerald", 3);',
      '    e.player.give({ id: "minecraft:diamond_sword", components: { "minecraft:custom_name": "Edge" } });',
      '    e.player.give("minecraft:bread", removed);',
      '  }',
      '  inv.set(inv.selectedSlot, { id: "minecraft:torch", count: 16 });',
      '  inv.set("offhand");',
      '  inv.setComponent(0, "minecraft:custom_name", "Lucky");',
      '  inv.setComponent("head", "minecraft:custom_name");',
      '  const head = inv.get("head") ?? e.player.equipment("head");',
      '  if (head) msm.log.info(head.id + String(inv.size));',
      '  e.player.setEquipment("feet", "minecraft:leather_boots");',
      '  if (e.player.food < 6) e.player.setFood(20, 5);',
      '  e.player.addXp(10); e.player.addXpLevels(1); e.player.setXpLevels(e.player.xpLevel + 1);',
      '  const changed: boolean = e.player.gameMode === "survival" && e.player.setGameMode("adventure");',
      '  msm.log.info(String(changed) + String(e.player.xpPoints) + String(e.player.saturation));',
      '});',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('screen text, boss bars, damage, raycast, teleport and worlds', () => {
    const src = [
      'import { msm, type BossBar, type ItemSpec, type RayHit } from "msm:runtime";',
      'const bar: BossBar = msm.bossBars.create("countdown", { title: "Time left", color: "red", style: "notched_10", progress: 1 });',
      'const reward: ItemSpec = "minecraft:emerald";',
      'msm.events.on("player.join", (e) => {',
      '  bar.addPlayer(e.player);',
      '  e.player.showTitle("Welcome", { subtitle: "to the arena", fadeIn: 10, stay: 40, fadeOut: 10 });',
      '  e.player.showActionBar("Good luck");',
      '  e.player.clearTitle();',
      '  e.player.give(reward);',
      '});',
      'msm.events.on("item.use", (e) => {',
      '  const hit: RayHit | undefined = e.player.raycast(32, { fluids: true });',
      '  if (hit?.kind === "entity" && hit.entity) hit.entity.damage(4, { type: "minecraft:magic", attacker: e.player });',
      '  if (hit?.kind === "block" && hit.block && hit.face === "up") e.player.teleport(hit.pos.offset(0, 1, 0));',
      '  const down = e.world.raycast(e.player.pos, e.player.look, 10, { entities: false, ignore: e.player });',
      '  if (down) msm.log.info(String(down.distance));',
      '  const end = msm.getWorld("minecraft:the_end");',
      '  if (end) e.player.teleport(end.raycast(e.player.pos, e.player.look, 1)?.pos ?? e.player.pos, { dimension: end.dimension, yaw: 90, pitch: 0 });',
      '  e.player.damage(1);',
      '  for (const p of msm.players()) p.sendMessage(String(bar.players().length));',
      '  bar.setTitle("Hurry"); bar.setProgress(0.5); bar.setColor("yellow"); bar.setStyle("progress");',
      '  bar.removePlayer(e.player);',
      '  msm.bossBars.get("countdown")?.remove();',
      '});',
      'export {};',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('the new events', () => {
    const src = [
      'msm.events.on("player.tick", (e) => { if (e.player.food < 3) e.player.showActionBar("Hungry"); }, { interval: 40 });',
      'msm.events.on("player.tick", (e) => msm.log.info(e.player.name));',
      'msm.events.on("player.respawn", (e) => e.player.give("minecraft:bread", 4));',
      'msm.events.on("player.leave", (e) => msm.log.info(e.player.name + " left " + e.world.dimension));',
      'msm.events.on("player.changeDimension", (e) => e.player.sendMessage(e.from + " -> " + e.to));',
      'msm.events.on("player.chat", (e) => { if (e.message.indexOf("spoiler") >= 0) e.cancel(); });',
      'msm.events.on("entity.damaged", (e) => {',
      '  const by = e.direct ?? e.attacker;',
      '  if (by && e.source === "minecraft:arrow") msm.log.info(String(e.amount) + by.type);',
      '  msm.log.info(e.entity.type);',
      '});',
      'msm.events.on("entity.hurt", (e) => { if (e.source === "minecraft:fall" && !e.direct) e.cancel(); });',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('rejects misuse', () => {
    const bad = [
      'msm.events.on("player.tick", () => {}, { interval: "fast" });',
      'msm.events.on("server.tick", () => {}, { interval: 5 });',
      'msm.events.on("entity.damaged", (e) => e.cancel());',
      'msm.events.on("player.join", (e) => e.player.setGameMode("hardcore"));',
      'msm.events.on("player.join", (e) => e.player.inventory.set("hand", "minecraft:stone"));',
      'msm.events.on("player.join", (e) => e.player.equipment(3));',
      'msm.bossBars.create("x", { color: "red" });',
      'msm.bossBars.create("x", { title: "x", color: "orange" });',
      'msm.events.on("player.join", (e) => e.player.give({ count: 1 }));',
      'msm.events.on("player.join", (e) => { e.player.xpLevel = 3; });',
      'msm.events.on("item.use", (e) => e.player.damage(1, { type: 3 }));',
    ];
    for (const line of bad) expect(typeCheck(line), line).not.toEqual([]);
  });
});
