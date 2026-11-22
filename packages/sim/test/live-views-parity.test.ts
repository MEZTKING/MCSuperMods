/**
 * Live views parity (B613; ADR 0120 D9, limit 2L1): `fixtures/live-views/expectations.json`, what
 * the real server did with the fixture's own files on each target (B607), played through MSM's
 * own evaluators: tags and predicates (B604), loot tables, item modifiers and enchanting (B605),
 * functions (B606).
 *
 * - **Rates** (each item and count, each enchantment and level, each predicate's yes, each
 *   enchanting pick) are worked out from {@link ROLLS} seeded rolls and must be within 2
 *   percentage points of the game's (3 for the explosion cases, 2,000 blasts).
 * - **Everything else** is equal: deterministic predicate answers (MSM may answer "only the game
 *   knows", never the opposite of the game), modifier results, resolved tags, what a function
 *   left in the area, the load function's score.
 * - **Vanilla files**: cases that range over every enchantment, merge into a vanilla tag or smelt
 *   need the game's own files; they read them from a Minecraft client jar in the Loom cache at
 *   test time (never kept) and skip where there is none. The `_own` variants need nothing.
 *
 * `LIVE_VIEWS_ROLLS` sets the rolls (default 100,000); `LIVE_VIEWS_REPORT` (a file path) writes
 * the worst difference of each case in points.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json, JsonObject, Target } from '@msm/plugin-api';
import { afterAll, describe, expect, it } from 'vitest';
import {
  applyItemModifier,
  createTagResolver,
  type DataLookup,
  filesLookup,
  holderOf,
  LocalWorldSource,
  type LootContext,
  type LootStack,
  layeredLookup,
  normaliseId,
  PLAYER,
  SimRandom,
  type Situation,
  testPredicate,
} from '../src/index.js';
import { enchantAtCost } from '../src/loot/enchant.js';
import { newState, type WorkStack } from '../src/loot/state.js';
import { rollTable } from '../src/loot/table.js';
import type { FakeFiles } from './loot/helpers.js';
import { loomJars, readJarData } from './loot/vanilla-jar.js';
import { builtInTargets, REPO_ROOT } from './lower-fixture.js';

const FIXTURE = join(REPO_ROOT, 'fixtures/live-views');
const ROLLS = Number(process.env.LIVE_VIEWS_ROLLS ?? 100_000);
const TOLERANCE = 2;
const EXPLOSION_TOLERANCE = 3;
const SWORD = 'minecraft:diamond_sword';

// --- the fixture -----------------------------------------------------------------------------

interface RollCase {
  readonly table: string;
  readonly situation: Situation;
  readonly rolls: number;
  readonly items: Record<string, Record<string, number>>;
  readonly enchantments?: Record<string, number>;
}
interface PredicateCase {
  readonly predicate: string;
  readonly situation: Situation;
  readonly tests: number;
  readonly yes: number;
}
interface ModifierCase {
  readonly modifier: string;
  readonly situation: Situation;
  readonly before: { id: string; count: number; components?: JsonObject };
  readonly after: { id: string; count: number; components?: JsonObject };
}
interface FunctionCase {
  readonly as: string;
  readonly run: string;
  readonly observed: {
    readonly blocks: Record<string, string>;
    readonly effects: Record<string, { amplifier: number; particles?: boolean }>;
    readonly inventory: Record<string, number>;
    readonly scores: Record<string, number>;
    readonly tags: readonly string[];
  };
}
interface EnchantingCase {
  readonly draws: number;
  readonly item: string;
  readonly picksAtCost: Record<string, Record<string, number>>;
}
interface TargetExpectations {
  readonly loot: Record<string, RollCase>;
  readonly mined: Record<string, RollCase>;
  readonly killed: Record<string, RollCase>;
  readonly exploded: Record<string, RollCase>;
  readonly predicates: Record<string, PredicateCase>;
  readonly modifiers: Record<string, ModifierCase>;
  readonly tags: Record<string, readonly string[] | Record<string, boolean> | null>;
  readonly functions: Record<string, FunctionCase>;
  readonly enchantments: { readonly enchanting: EnchantingCase };
  readonly registries: { readonly loadFunctionScore: number; readonly function: readonly string[] };
}

const EXPECTATIONS = JSON.parse(readFileSync(join(FIXTURE, 'expectations.json'), 'utf8')) as {
  readonly targets: Record<string, TargetExpectations>;
};

/** The fixture's lowered data pack as the simulation reads it (`data/...` paths, JSON text). */
function loweredFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const relPath = rel === '' ? name : `${rel}/${name}`;
      if (statSync(path).isDirectory()) walk(path, relPath);
      else out.set(relPath, readFileSync(path, 'utf8'));
    }
  };
  walk(join(FIXTURE, 'lowered'), '');
  return out;
}

const FILES = loweredFiles();
const PROJECT = filesLookup(FILES);

/** The fixture's ids of a data folder (`loot_table`, `enchantment`, `tags/item`, ...). */
function projectIds(folder: string): string[] {
  const pattern = new RegExp(`^data/([^/]+)/${folder}/(.+)\\.json$`);
  return [...FILES.keys()].flatMap((path) => {
    const match = pattern.exec(path);
    return match === null ? [] : [`${match[1]}:${match[2]}`];
  });
}

/** The vanilla folders the cases that need the game's own files read from the jar. */
const VANILLA_FOLDERS = ['enchantment', 'tags/enchantment', 'tags/item', 'tags/block', 'recipe'];

/** Cases that range over every enchantment, merge into vanilla's tags or smelt. */
const NEEDS_JAR = new Set([
  'loot:enchant_levels_book',
  'loot:enchant_levels_sword',
  'loot:enchant_randomly_book',
  'loot:tag_all',
  'loot:tag_expand',
  'modifiers:mod_smelt',
  'tags:block:live_views:soft',
  'tags:item:live_views:tags_inside',
  'tags:item:minecraft:logs',
  'tags:enchantment:minecraft:curse',
]);

// --- the evaluators' context ----------------------------------------------------------------

interface World {
  readonly target: Target;
  readonly jar: boolean;
  readonly lookup: DataLookup;
  readonly vanilla: FakeFiles;
  /** A loot context at a seed. */
  ctx(seed: number): LootContext;
}

/** The target's vendored registry ids, to tell whether a tag's required entry exists. */
function vendoredRegistries(target: Target): Record<string, readonly string[]> {
  const path = join(REPO_ROOT, 'packages/targets', target.id, 'vendor/mcmeta/registries.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, readonly string[]>;
}

/** The item a furnace makes of an item, read from the jar's smelting recipes. */
function smeltFrom(vanilla: FakeFiles): (id: string) => string | undefined {
  const made = new Map<string, string>();
  for (const recipe of Object.values(vanilla.recipe ?? {})) {
    const r = recipe as JsonObject;
    if (r.type !== 'minecraft:smelting') continue;
    const input = typeof r.ingredient === 'string' ? r.ingredient : undefined;
    const result = (r.result as JsonObject | undefined)?.id;
    if (input !== undefined && !input.startsWith('#') && typeof result === 'string') {
      if (!made.has(normaliseId(input))) made.set(normaliseId(input), result);
    }
  }
  return (id) => made.get(normaliseId(id));
}

function worldFor(target: Target): World {
  const jarFile = loomJars().find((one) => one.version === target.mcVersion);
  const vanilla: FakeFiles =
    jarFile === undefined ? {} : readJarData(jarFile.path, VANILLA_FOLDERS);
  const vanillaLookup: DataLookup = (folder, id) => vanilla[folder]?.[normaliseId(id)];
  const lookup = layeredLookup(PROJECT, vanillaLookup);
  const registries = vendoredRegistries(target);
  const known = new Map<string, Set<string>>();
  const exists = (registry: string, id: string): boolean | undefined => {
    let ids = known.get(registry);
    if (ids === undefined) {
      const list = registries[registry];
      ids = new Set([
        ...(list ?? []).map((one) => normaliseId(one)),
        ...projectIds(registry),
        ...Object.keys(vanilla[registry] ?? {}),
      ]);
      known.set(registry, ids);
      if (list === undefined && ids.size === 0) return undefined;
    }
    return ids.has(normaliseId(id));
  };
  const resolveTag = createTagResolver(lookup, { tagsFolder: target.folders.data.tags, exists });
  const smelt = smeltFrom(vanilla);
  return {
    target,
    jar: jarFile !== undefined,
    lookup,
    vanilla,
    ctx: (seed) => ({
      random: new SimRandom(seed),
      lookup,
      resolveTag,
      types: target,
      ids: (folder) => [...new Set([...projectIds(folder), ...Object.keys(vanilla[folder] ?? {})])],
      smelt,
    }),
  };
}

// --- rolls ----------------------------------------------------------------------------------

/** The game's key of a stack: the item, and ` worn=<n>` (damage in twentieths) when damaged. */
function itemKey(stack: WorkStack | LootStack, target: Target): string {
  if (stack.damage === undefined) return stack.id;
  const max = maxDamageOf(target, stack.id);
  if (max === undefined) return stack.id;
  const lost = Math.round((1 - stack.damage) * max);
  return lost > 0 ? `${stack.id} worn=${Math.floor((lost * 20) / max)}` : stack.id;
}

function maxDamageOf(target: Target, id: string): number | undefined {
  if (id === SWORD) return target.items?.vanillaTools?.diamond?.sword?.durability;
  return undefined;
}

interface Simulated {
  readonly items: Record<string, Record<string, number>>;
  readonly enchantments: Record<string, number>;
}

/** Rolls a table `n` times, counting each key's total per roll and each enchantment's rolls. */
function simulate(world: World, table: string, situation: Situation, n: number, seed: number) {
  const state = newState(world.ctx(seed), situation);
  const items: Record<string, Record<string, number>> = {};
  const enchantments: Record<string, number> = {};
  for (let i = 0; i < n; i += 1) {
    const out: WorkStack[] = [];
    rollTable(state, table, '', out);
    const totals: Record<string, number> = {};
    const seen = new Set<string>();
    for (const stack of out) {
      const key = itemKey(stack, world.target);
      totals[key] = (totals[key] ?? 0) + stack.count;
      for (const [id, level] of Object.entries(stack.enchantments ?? {}))
        seen.add(`${id}=${level}`);
    }
    for (const [key, total] of Object.entries(totals)) {
      const counts = items[key] ?? {};
      items[key] = counts;
      counts[total] = (counts[total] ?? 0) + 1;
    }
    for (const one of seen) enchantments[one] = (enchantments[one] ?? 0) + 1;
  }
  for (const counts of Object.values(items)) {
    const some = Object.values(counts).reduce((a, b) => a + b, 0);
    if (some < n) counts[0] = (counts[0] ?? 0) + n - some;
  }
  return { items, enchantments } satisfies Simulated;
}

/** The largest difference in points over every item and count, and every enchantment. */
function worst(game: RollCase, ours: Simulated, n: number): { points: number; at: string } {
  let out = { points: 0, at: '' };
  for (const key of new Set([...Object.keys(game.items), ...Object.keys(ours.items)])) {
    const g = game.items[key] ?? { 0: game.rolls };
    const o = ours.items[key] ?? { 0: n };
    for (const count of new Set([...Object.keys(g), ...Object.keys(o)])) {
      const points = Math.abs((g[count] ?? 0) / game.rolls - (o[count] ?? 0) / n) * 100;
      if (points > out.points) out = { points, at: `${key} x${count}` };
    }
  }
  const ge = game.enchantments ?? {};
  for (const key of new Set([...Object.keys(ge), ...Object.keys(ours.enchantments)])) {
    const points = Math.abs((ge[key] ?? 0) / game.rolls - (ours.enchantments[key] ?? 0) / n) * 100;
    if (points > out.points) out = { points, at: key };
  }
  return out;
}

// --- the report -----------------------------------------------------------------------------

const report: Record<string, Record<string, Record<string, number | string>>> = {};
function note(target: string, section: string, name: string, value: number | string): void {
  const bySection = report[target] ?? {};
  report[target] = bySection;
  const byCase = bySection[section] ?? {};
  bySection[section] = byCase;
  byCase[name] = typeof value === 'number' ? Math.round(value * 100) / 100 : value;
}
afterAll(() => {
  const out = process.env.LIVE_VIEWS_REPORT;
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
});

// --- the cases ------------------------------------------------------------------------------

const TARGETS = await builtInTargets();

it('has expectations for every built-in target', () => {
  for (const target of TARGETS) expect(Object.keys(EXPECTATIONS.targets)).toContain(target.id);
});

for (const target of TARGETS) {
  const expected = EXPECTATIONS.targets[target.id];
  if (expected === undefined) continue;
  const world = worldFor(target);
  const skip = (key: string): boolean => NEEDS_JAR.has(key) && !world.jar;

  describe(`live views parity on ${target.id}`, () => {
    for (const section of ['loot', 'mined', 'killed', 'exploded'] as const) {
      const tolerance = section === 'exploded' ? EXPLOSION_TOLERANCE : TOLERANCE;
      describe(section, () => {
        Object.entries(expected[section]).forEach(([name, game], index) => {
          it.skipIf(skip(`${section}:${name}`))(
            `${name} is within ${tolerance} points`,
            { timeout: 120_000 },
            () => {
              const ours = simulate(world, game.table, game.situation, ROLLS, 1000 + index);
              const found = worst(game, ours, ROLLS);
              note(target.id, section, name, found.points);
              expect(found.points, found.at).toBeLessThanOrEqual(tolerance);
            },
          );
        });
      });
    }

    describe('predicates', () => {
      for (const [name, game] of Object.entries(expected.predicates)) {
        it(name, { timeout: 60_000 }, () => {
          if (game.tests > 1) {
            const ctx = world.ctx(7);
            let yes = 0;
            for (let i = 0; i < ROLLS; i += 1) {
              if (testPredicate(game.predicate, game.situation, ctx).answer === 'yes') yes += 1;
            }
            const points = Math.abs(yes / ROLLS - game.yes / game.tests) * 100;
            note(target.id, 'predicates', name, points);
            expect(points).toBeLessThanOrEqual(TOLERANCE);
            return;
          }
          const answer = testPredicate(game.predicate, game.situation, world.ctx(1)).answer;
          const want = game.yes === 1 ? 'yes' : 'no';
          note(target.id, 'predicates', name, answer === want ? 'same' : answer);
          // Never the opposite of the game; "only the game knows" is honest.
          expect([want, 'unknown']).toContain(answer);
        });
      }
    });

    describe('modifiers', () => {
      for (const [name, game] of Object.entries(expected.modifiers)) {
        it.skipIf(skip(`modifiers:${name}`))(name, () => {
          const result = applyItemModifier(
            game.modifier,
            { id: game.before.id, count: game.before.count },
            game.situation,
            world.ctx(1),
          );
          expect(result.unsupported).toEqual([]);
          expect(gameStack(result.item, target)).toEqual(game.after);
          note(target.id, 'modifiers', name, 'same');
        });
      }
    });

    describe('tags', () => {
      for (const [key, game] of Object.entries(expected.tags)) {
        it.skipIf(skip(`tags:${key}`))(key, () => {
          const [registry = '', ...rest] = key.split(':');
          const resolved = world.ctx(1).resolveTag(registry, rest.join(':'));
          const members = resolved.dropped ? null : resolved.members.map((one) => one.id).sort();
          if (game === null || Array.isArray(game)) {
            expect(members).toEqual(game);
          } else {
            // A vanilla tag merged into: what the fixture checked of it.
            const has = (id: string): boolean => members?.includes(id) === true;
            const checks: Record<string, boolean> = {
              hasOakLog: has('minecraft:oak_log'),
              hasStone: has('minecraft:stone'),
              hasOwnCurse: has('live_views:spike_curse'),
            };
            for (const [check, want] of Object.entries(game))
              expect(checks[check], check).toBe(want);
          }
          note(target.id, 'tags', key, 'same');
        });
      }
    });

    describe('functions', () => {
      for (const [name, game] of Object.entries(expected.functions)) {
        it(name, () => {
          const source = new LocalWorldSource({ files: FILES, target, seed: 1 });
          source.tick();
          const spot = {
            x: Math.floor(source.player.position.x),
            y: Math.floor(source.player.position.y),
            z: Math.floor(source.player.position.z),
          };
          const ran = source.functions.runChatLine(game.run);
          expect(ran.result, ran.answer.join(' ')).toBe('ran');
          expect(observedIn(source, spot)).toEqual(withoutParticles(game.observed));
          note(target.id, 'functions', name, 'same');
        });
      }
    });

    describe('registries', () => {
      it('runs the load function at the first tick (its score)', () => {
        const source = new LocalWorldSource({ files: FILES, target, seed: 1 });
        source.tick();
        const score = source.functions.state.score('#loaded', 'lv_load');
        expect(score).toBe(expected.registries.loadFunctionScore);
        note(target.id, 'registries', 'loadFunctionScore', score ?? 'none');
      });

      it('reads the functions the server loaded', () => {
        const source = new LocalWorldSource({ files: FILES, target, seed: 1 });
        expect([...source.functions.all.keys()].sort()).toEqual([...expected.registries.function]);
      });
    });

    describe('enchanting', () => {
      const game = expected.enchantments.enchanting;
      it(`picks among the fixture's own enchantments within ${TOLERANCE} points at each cost`, {
        timeout: 120_000,
      }, () => {
        const draws = Math.max(10_000, Math.floor(ROLLS / 4));
        let found = { points: 0, at: '' };
        for (const [cost, picks] of Object.entries(game.picksAtCost)) {
          const state = newState(world.ctx(31 + Number(cost)), {
            context: 'minecraft:enchanted_item',
          });
          const ours: Record<string, number> = {};
          for (let i = 0; i < draws; i += 1) {
            const stack: WorkStack = { id: game.item, count: 1 } as WorkStack;
            enchantAtCost(state, stack, Number(cost), '#live_views:own', '', 'enchanting_table');
            const key = Object.entries(stack.enchantments ?? {})
              .map(([id, level]) => `${id}=${level}`)
              .join('+');
            ours[key] = (ours[key] ?? 0) + 1;
          }
          for (const key of new Set([...Object.keys(picks), ...Object.keys(ours)])) {
            const points =
              Math.abs((picks[key] ?? 0) / game.draws - (ours[key] ?? 0) / draws) * 100;
            if (points > found.points) found = { points, at: `cost ${cost}: ${key || 'none'}` };
          }
        }
        note(target.id, 'enchanting', 'picksAtCost', found.points);
        expect(found.points, found.at).toBeLessThanOrEqual(TOLERANCE);
      });
    });
  });
}

// --- comparing -------------------------------------------------------------------------------

/** A stack as the game's `ItemStack` JSON of the fixture (components by their ids). */
function gameStack(
  stack: LootStack,
  target: Target,
): { id: string; count: number; components?: JsonObject } {
  const components: Record<string, Json> = {};
  for (const [key, value] of Object.entries(stack.components ?? {})) {
    components[key] = Array.isArray(value) ? value.map(plainText) : value;
  }
  if (stack.enchantments !== undefined && Object.keys(stack.enchantments).length > 0) {
    components['minecraft:enchantments'] = { ...stack.enchantments };
  }
  if (stack.damage !== undefined) {
    const max = maxDamageOf(target, stack.id);
    if (max !== undefined) components['minecraft:damage'] = Math.floor((1 - stack.damage) * max);
  }
  return Object.keys(components).length === 0
    ? { count: stack.count, id: stack.id }
    : { components, count: stack.count, id: stack.id };
}

/** The game keeps a plain text component of a lore line as its text. */
function plainText(value: Json): Json {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).join() === 'text'
    ? (value.text as Json)
    : value;
}

/**
 * The simulation's effects keep the amplifier, not whether particles show: the expectations'
 * `particles` is left out of the comparison (the test says so by name).
 */
function withoutParticles(observed: FunctionCase['observed']): FunctionCase['observed'] {
  const effects: Record<string, { amplifier: number }> = {};
  for (const [id, effect] of Object.entries(observed.effects)) {
    effects[id] = { amplifier: effect.amplifier };
  }
  return { ...observed, effects, tags: [...observed.tags].sort() };
}

/** What the area holds after a run, in the shape of the fixture's `observed`. */
function observedIn(
  source: LocalWorldSource,
  spot: { x: number; y: number; z: number },
): FunctionCase['observed'] {
  const holder = holderOf(PLAYER);
  const state = source.functions.state;
  const scores = Object.fromEntries(
    Object.entries(state.scoresOf(holder)).filter(([name]) => name.startsWith('lv_')),
  );
  const tags = [...(state.tags.get(holder) ?? [])].filter((tag) => tag.startsWith('lv_')).sort();
  const effects: Record<string, { amplifier: number }> = {};
  for (const [id, effect] of state.effects.get(holder) ?? []) {
    if (effect.until > source.ticksRun) effects[id] = { amplifier: effect.amplifier };
  }
  const inventory: Record<string, number> = {};
  for (const stack of source.inventory.slots) {
    if (stack !== null) inventory[stack.id] = (inventory[stack.id] ?? 0) + stack.count;
  }
  const blocks: Record<string, string> = {};
  for (let dx = 0; dx <= 5; dx += 1) {
    for (let dy = 0; dy <= 2; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const block = source.world.get({ x: spot.x + dx, y: spot.y + dy, z: spot.z + dz });
        if (block !== null && block !== undefined) blocks[`${dx},${dy},${dz}`] = block.name;
      }
    }
  }
  return { blocks, effects, inventory, scores, tags };
}
