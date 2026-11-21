/**
 * Cross-element checks of traders, villager professions, mount storage and shoulder pets
 * (ADR 0098 D1 to D4, as amended after the B469 spike). Every validator is pure and reads only
 * the project's elements, the target's facts and the registry ids. Codes:
 *
 * - `entities.trade-set-unknown` (error): a trader level's `trade_set` or a profession's
 *   `trade_sets` entry is neither a trade set of the target or the registry index, a project
 *   `minecraft:trade_set` element, nor a default trade set a project profession creates
 *   (`<ns>:<path>/level_<n>`); the runtime finds no offers there.
 * - `entities.trade-set-villager-only` (warning): a trader names a vanilla trade set whose
 *   trades are partly or wholly for villagers of a biome type
 *   (`target.entities.vanillaTradeSets[id].villagerOnly`), so the mob gets fewer offers or none.
 *   Skipped on a target without the facts.
 * - `entities.trader-monster` (info): `msm:trader` on a `monster` base, which does not trade at
 *   night.
 * - `entities.job-site-taken` (error): a profession's `job_site` already has a point of
 *   interest type (a vanilla workstation, bed, bell and the like, from
 *   `target.entities.vanillaJobSites`), or another project profession uses the same block; the
 *   runtime refuses it.
 * - `entities.job-site-unknown` (error): a profession's `job_site` is not a project `msm:block`.
 * - `entities.shoulder-too-wide` (error): `msm:shoulder_riding` on a mob wider than 0.7 blocks.
 * - `entities.shoulder-needs-tameable` (error): `msm:shoulder_riding` without `msm:tameable`
 *   or on a base other than `animal`; the pet never has an owner whose shoulder it sits on.
 * - `entities.storage-rows` (info): `msm:storage` with `needs_chest` and more than three rows,
 *   so one chest gives the mob more room than the chest itself holds.
 *
 * The trader's `on_trade` event is checked here with the shared code `entities.unknown-event`
 * (`validators.ts` reports the other trigger fields).
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  TargetFacts,
} from '@msm/plugin-api';
import { ENTITY_KIND, PROFESSION_KIND } from './kinds';
import { isRecord } from './lowering/paths';
import { defaultTradeSets, hasOwnTradeSets } from './lowering/profession';
import { SHOULDER_COMPONENT, SHOULDER_MAX_WIDTH } from './lowering/shoulder';
import { DEFAULT_STORAGE_ROWS, STORAGE_COMPONENT } from './lowering/storage';
import { TRADER_COMPONENT } from './lowering/trader';

/** Every code the villager validators report (`entities.unknown-event` is shared, not listed). */
export const ENTITIES_VILLAGER_PROBLEM_CODES = Object.freeze([
  'entities.trade-set-unknown',
  'entities.trade-set-villager-only',
  'entities.trader-monster',
  'entities.job-site-taken',
  'entities.job-site-unknown',
  'entities.shoulder-too-wide',
  'entities.shoulder-needs-tameable',
  'entities.storage-rows',
] as const);

/** Kinds read by kind string only (other plugins). */
const BLOCK_KIND = 'msm:block';
const TRADE_SET_KIND = 'minecraft:trade_set';

/** Rows a single vanilla chest holds. */
const CHEST_ROWS = 3;

/** RFC 6901 escaping of one reference token. */
const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;

const ofKind = (elements: readonly Element[], kind: string): Element[] =>
  elements.filter((element) => element.kind === kind);

const component = (element: Element, name: string): JsonObject | undefined =>
  record(record(dataOf(element).components)?.[name]);

/** The entity's `base`; absent means `mob` (ADR 0070 D1). */
const baseOf = (element: Element): string => {
  const base = dataOf(element).base;
  return typeof base === 'string' ? base : 'mob';
};

/** The trade set ids a trader names, with their index in `trade_sets`. */
function traderLevels(element: Element): { id: string; index: number }[] {
  const levels = component(element, TRADER_COMPONENT)?.trade_sets;
  if (!Array.isArray(levels)) return [];
  const found: { id: string; index: number }[] = [];
  levels.forEach((level, index) => {
    const id = record(level)?.trade_set;
    if (typeof id === 'string') found.push({ id, index });
  });
  return found;
}

/** Every trade set the project and the target know. */
function knownTradeSets(elements: readonly Element[], target: TargetFacts): Set<string> {
  const known = new Set<string>(Object.keys(target.entities?.vanillaTradeSets ?? {}));
  for (const element of ofKind(elements, TRADE_SET_KIND)) known.add(element.id);
  for (const profession of ofKind(elements, PROFESSION_KIND)) {
    if (hasOwnTradeSets(dataOf(profession))) continue;
    try {
      for (const id of defaultTradeSets(profession.id)) known.add(id);
    } catch {
      // An unsafe id is reported by the host's id checks.
    }
  }
  return known;
}

function tradeSetChecks(
  elements: readonly Element[],
  target: TargetFacts,
  inRegistry: (id: string) => boolean,
): Problem[] {
  const known = knownTradeSets(elements, target);
  const isKnown = (id: string): boolean => known.has(id) || inRegistry(id);
  const unknown = (elementId: Element['id'], path: string, id: string): Problem => ({
    severity: 'error',
    code: 'entities.trade-set-unknown',
    elementId,
    path,
    message: `Trade set "${id}" is not in the project or in ${target.mcVersion}, so there are no offers at this level. Pick a vanilla trade set (such as minecraft:mason/level_1), make the trade set, or use a profession's own levels.`,
  });
  const facts = target.entities?.vanillaTradeSets;
  const problems: Problem[] = [];
  for (const element of ofKind(elements, ENTITY_KIND)) {
    for (const { id, index } of traderLevels(element)) {
      const path = pointer('components', TRADER_COMPONENT, 'trade_sets', index, 'trade_set');
      if (!isKnown(id)) {
        problems.push(unknown(element.id, path, id));
        continue;
      }
      const fact = facts?.[id];
      // A project trade set with a vanilla name replaces the vanilla one.
      if (
        fact?.villagerOnly !== true ||
        ofKind(elements, TRADE_SET_KIND).some((e) => e.id === id)
      ) {
        continue;
      }
      const none = fact.villagerOnlyTrades >= fact.trades;
      problems.push({
        severity: 'warning',
        code: 'entities.trade-set-villager-only',
        elementId: element.id,
        path,
        message: `Trade set "${id}" holds ${fact.villagerOnlyTrades} of ${fact.trades} trades that only villagers from a certain biome offer, so this mob gets ${none ? 'no offers' : 'fewer offers'} at this level. Pick another trade set, or make your own.`,
      });
    }
  }
  for (const profession of ofKind(elements, PROFESSION_KIND)) {
    const sets = dataOf(profession).trade_sets;
    if (!Array.isArray(sets)) continue;
    sets.forEach((id, index) => {
      if (typeof id === 'string' && !isKnown(id)) {
        problems.push(unknown(profession.id, pointer('trade_sets', index), id));
      }
    });
  }
  return problems;
}

function traderBases(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of ofKind(elements, ENTITY_KIND)) {
    if (component(element, TRADER_COMPONENT) === undefined) continue;
    if (baseOf(element) !== 'monster') continue;
    problems.push({
      severity: 'info',
      code: 'entities.trader-monster',
      elementId: element.id,
      path: '/base',
      message:
        'This trader is a monster, and monsters do not trade at night. That is allowed; use the "mob" or "animal" base for a trader that trades at any time.',
    });
  }
  return problems;
}

function onTradeEvents(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of ofKind(elements, ENTITY_KIND)) {
    const event = component(element, TRADER_COMPONENT)?.on_trade;
    if (typeof event !== 'string') continue;
    if (record(dataOf(element).events)?.[event] !== undefined) continue;
    problems.push({
      severity: 'error',
      code: 'entities.unknown-event',
      elementId: element.id,
      path: pointer('components', TRADER_COMPONENT, 'on_trade'),
      message: `Event "${event}" is not declared in this entity's events. Add it under "events", or pick an existing event.`,
    });
  }
  return problems;
}

function jobSites(elements: readonly Element[], target: TargetFacts): Problem[] {
  const blocks = new Set<string>(ofKind(elements, BLOCK_KIND).map((element) => element.id));
  const vanillaSites = new Map<string, string>();
  for (const [poi, list] of Object.entries(target.entities?.vanillaJobSites ?? {})) {
    for (const block of list) vanillaSites.set(block, poi);
  }
  const firstUser = new Map<string, string>();
  const problems: Problem[] = [];
  for (const profession of ofKind(elements, PROFESSION_KIND)) {
    const site = dataOf(profession).job_site;
    if (typeof site !== 'string') continue;
    const poi = vanillaSites.get(site);
    if (poi !== undefined) {
      problems.push({
        severity: 'error',
        code: 'entities.job-site-taken',
        elementId: profession.id,
        path: '/job_site',
        message: `"${site}" already belongs to the "${poi}" point of interest in ${target.mcVersion}, so it cannot be this job's site and the game refuses the job. Make a block of your own for the job site.`,
      });
      continue;
    }
    if (!blocks.has(site)) {
      problems.push({
        severity: 'error',
        code: 'entities.job-site-unknown',
        elementId: profession.id,
        path: '/job_site',
        message:
          site.length === 0
            ? 'This job has no job site. Pick a block of your own (make one first) where villagers take the job.'
            : `"${site}" is not a block of this project. A job site must be a block of your own; make the block, or pick an existing one.`,
      });
      continue;
    }
    const other = firstUser.get(site);
    if (other !== undefined) {
      problems.push({
        severity: 'error',
        code: 'entities.job-site-taken',
        elementId: profession.id,
        path: '/job_site',
        message: `"${site}" is already the job site of "${other}", and a block can be the site of one job only, so the game refuses this one. Pick another block.`,
      });
      continue;
    }
    firstUser.set(site, profession.id);
  }
  return problems;
}

function shoulderChecks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of ofKind(elements, ENTITY_KIND)) {
    if (component(element, SHOULDER_COMPONENT) === undefined) continue;
    const path = pointer('components', SHOULDER_COMPONENT);
    const width = record(dataOf(element).size)?.width;
    if (typeof width === 'number' && width > SHOULDER_MAX_WIDTH) {
      problems.push({
        severity: 'error',
        code: 'entities.shoulder-too-wide',
        elementId: element.id,
        path: '/size/width',
        message: `This pet is ${width} blocks wide; only pets up to ${SHOULDER_MAX_WIDTH} blocks wide sit on a shoulder. Make it narrower, or remove "${SHOULDER_COMPONENT}".`,
      });
    }
    const base = baseOf(element);
    const tameable = component(element, 'msm:tameable') !== undefined;
    if (base !== 'animal' || !tameable) {
      problems.push({
        severity: 'error',
        code: 'entities.shoulder-needs-tameable',
        elementId: element.id,
        path,
        message:
          base !== 'animal'
            ? `Only tamed animals sit on a shoulder, and this mob's base is "${base}". Set "base" to "animal" and add "msm:tameable", or remove "${SHOULDER_COMPONENT}".`
            : `Only tamed pets sit on their owner's shoulder, and this mob has no "msm:tameable" component, so it never has an owner. Add "msm:tameable", or remove "${SHOULDER_COMPONENT}".`,
      });
    }
  }
  return problems;
}

function storageChecks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of ofKind(elements, ENTITY_KIND)) {
    const storage = component(element, STORAGE_COMPONENT);
    if (storage?.needs_chest !== true) continue;
    const rows = typeof storage.rows === 'number' ? storage.rows : DEFAULT_STORAGE_ROWS;
    if (rows <= CHEST_ROWS) continue;
    problems.push({
      severity: 'info',
      code: 'entities.storage-rows',
      elementId: element.id,
      path: pointer('components', STORAGE_COMPONENT, 'rows'),
      message: `One chest gives this mob ${rows} rows of storage, more than the ${CHEST_ROWS} rows the chest itself holds. That is allowed; use ${CHEST_ROWS} rows or fewer to match a vanilla chest.`,
    });
  }
  return problems;
}

/** The villager validators, registered after the vehicle validators. */
export const entitiesVillagerValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.entities.trader',
    kinds: [ENTITY_KIND, PROFESSION_KIND, TRADE_SET_KIND],
    validate: ({ elements, target, registry }) => [
      ...tradeSetChecks(elements, target, (id) => registry.has('trade_set', id)),
      ...traderBases(elements),
      ...onTradeEvents(elements),
    ],
  },
  {
    id: 'msm.entities.profession',
    kinds: [PROFESSION_KIND, BLOCK_KIND],
    validate: ({ elements, target }) => jobSites(elements, target),
  },
  {
    id: 'msm.entities.shoulder',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => shoulderChecks(elements),
  },
  {
    id: 'msm.entities.storage',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => storageChecks(elements),
  },
] satisfies ProjectValidator[]);
