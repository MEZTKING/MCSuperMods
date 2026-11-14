/**
 * The Extra drop flow (ADR 0060 D3, D6): one `msm:loot_addition` that adds a pool to a vanilla
 * mob, block or chest loot table. The table keeps its vanilla pools; the runtime adds the pool
 * when the data packs load, so it survives `/reload`. A world data pack that replaces the whole
 * table wins over the addition. Loot additions exist only in the Fabric mod jar export (with
 * `msm_runtime`); the vanilla packs leave them out (ADR 0060 D7). The pool is a vanilla loot
 * pool as the targets read it: one `condition` on the pool (`minecraft:all_of` for several)
 * and `modifier` on the entry.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import { element, KINDS, modIdFromNamespace, packElement, rl } from '../content/bundle';
import { booleanValue, numberValue, readValues, stringValue } from '../content/parameters';

/** The tables the flow offers: what they belong to, their id path and English name. */
const TABLES: readonly { value: string; label: string; source: 'mob' | 'block' | 'chest' }[] = [
  { value: 'entities/zombie', label: 'Mob: Zombie', source: 'mob' },
  { value: 'entities/skeleton', label: 'Mob: Skeleton', source: 'mob' },
  { value: 'entities/creeper', label: 'Mob: Creeper', source: 'mob' },
  { value: 'entities/spider', label: 'Mob: Spider', source: 'mob' },
  { value: 'entities/enderman', label: 'Mob: Enderman', source: 'mob' },
  { value: 'entities/cow', label: 'Mob: Cow', source: 'mob' },
  { value: 'entities/pig', label: 'Mob: Pig', source: 'mob' },
  { value: 'entities/chicken', label: 'Mob: Chicken', source: 'mob' },
  { value: 'blocks/stone', label: 'Block: Stone', source: 'block' },
  { value: 'blocks/gravel', label: 'Block: Gravel', source: 'block' },
  { value: 'blocks/short_grass', label: 'Block: Short grass', source: 'block' },
  { value: 'blocks/oak_leaves', label: 'Block: Oak leaves', source: 'block' },
  { value: 'chests/simple_dungeon', label: 'Chest: Dungeon', source: 'chest' },
  { value: 'chests/abandoned_mineshaft', label: 'Chest: Mineshaft', source: 'chest' },
  { value: 'chests/desert_pyramid', label: 'Chest: Desert pyramid', source: 'chest' },
  { value: 'chests/buried_treasure', label: 'Chest: Buried treasure', source: 'chest' },
  {
    value: 'chests/village/village_weaponsmith',
    label: "Chest: Village weaponsmith's",
    source: 'chest',
  },
];

/** The vanilla loot table ids the flow can name, for tests. */
export const EXTRA_DROP_TABLES: readonly string[] = TABLES.map(
  (entry) => `minecraft:${entry.value}`,
);

/** An item id, with or without its namespace (`emerald`, `minecraft:emerald`). */
const ITEM_PATTERN = '^([a-z0-9_.-]+:)?[a-z0-9_.-]+(/[a-z0-9_.-]+)*$';

/** The Extra drop flow's questions, groups "Where" and "Drop". */
export const EXTRA_DROP_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'table',
    label: 'Drops from',
    description: 'The vanilla mob, block or chest whose loot gets the extra drop.',
    group: 'Where',
    type: 'choice',
    default: 'entities/zombie',
    choices: TABLES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'player_kill',
    label: 'Only when a player kills the mob',
    description: 'Like rare mob drops in vanilla. Ignored for blocks and chests.',
    group: 'Where',
    type: 'boolean',
    default: true,
  },
  {
    id: 'item',
    label: 'Item',
    description: 'The item id, such as minecraft:emerald or a project item.',
    group: 'Drop',
    type: 'string',
    default: 'minecraft:emerald',
    pattern: ITEM_PATTERN,
    maxLength: 96,
  },
  {
    id: 'count_min',
    label: 'Fewest items',
    group: 'Drop',
    type: 'number',
    default: 1,
    min: 1,
    max: 64,
    step: 1,
  },
  {
    id: 'count_max',
    label: 'Most items',
    description: 'A value below the fewest is treated as equal to it.',
    group: 'Drop',
    type: 'number',
    default: 1,
    min: 1,
    max: 64,
    step: 1,
  },
  {
    id: 'chance',
    label: 'Chance in per cent',
    description: '100 drops it every time.',
    group: 'Drop',
    type: 'number',
    default: 10,
    min: 1,
    max: 100,
    step: 1,
  },
]);

/** `minecraft:` added to an item id without a namespace. */
function itemId(value: string): string {
  return value.includes(':') ? value : `minecraft:${value}`;
}

/** The last path segment of an id, for the element id. */
function lastWord(id: string): string {
  return id.slice(Math.max(id.indexOf(':'), id.lastIndexOf('/')) + 1);
}

/** A whole number in `[min, max]` from a number answer. */
function wholeNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

export function extraDropBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(EXTRA_DROP_PARAMETERS, context);
  const table =
    TABLES.find((entry) => entry.value === stringValue(values, 'table')) ??
    (TABLES[0] as (typeof TABLES)[number]);
  const item = itemId(stringValue(values, 'item'));
  const first = wholeNumber(numberValue(values, 'count_min'), 1, 64);
  const second = wholeNumber(numberValue(values, 'count_max'), 1, 64);
  const countMin = Math.min(first, second);
  const countMax = Math.max(first, second);
  const chance = wholeNumber(numberValue(values, 'chance'), 1, 100);
  const playerKill = table.source === 'mob' && booleanValue(values, 'player_kill');

  const tableId = `minecraft:${table.value}`;
  const name = table.label.replace(/^[^:]*: /, '');
  const id = rl(namespace, `${lastWord(tableId)}_drops_${lastWord(item)}`);

  const entry: JsonObject = { type: 'minecraft:item', name: item };
  if (countMin !== 1 || countMax !== 1) {
    entry.modifier = [
      {
        type: 'minecraft:set_count',
        count:
          countMin === countMax
            ? countMin
            : { type: 'minecraft:uniform', min: countMin, max: countMax },
      },
    ];
  }
  const terms: JsonObject[] = [];
  if (playerKill) terms.push({ type: 'minecraft:killed_by_player' });
  if (chance < 100) terms.push({ type: 'minecraft:random_chance', chance: chance / 100 });
  const pool: JsonObject = { rolls: 1, entries: [entry] };
  if (terms.length === 1) pool.condition = terms[0] as JsonObject;
  if (terms.length > 1) pool.condition = { type: 'minecraft:all_of', terms };

  const count = countMin === countMax ? `${countMin}` : `${countMin} to ${countMax}`;
  const when = [
    chance < 100 ? `${chance} times in 100` : 'every time',
    ...(playerKill ? ['only when a player kills it'] : []),
  ].join(', ');
  const source =
    table.source === 'mob'
      ? `the ${name.toLowerCase()} drops`
      : table.source === 'block'
        ? `breaking ${name.toLowerCase()} drops`
        : `the ${name.toLowerCase()} chest holds`;
  const conditionNote =
    terms.length === 0
      ? 'The pool has no condition, so it rolls every time.'
      : terms.length === 1
        ? 'condition holds the one check the pool needs before it rolls.'
        : 'condition holds the checks the pool needs before it rolls; minecraft:all_of needs every one of its terms.';

  return {
    elements: [
      packElement(
        namespace,
        `${projectName}: an extra drop`,
        'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out.',
      ),
      element(
        rl(namespace, 'mod'),
        KINDS.mod,
        {
          mod_id: modIdFromNamespace(namespace),
          version: '1.0.0',
          name: projectName,
          description: `Adds ${item} to the loot of ${tableId}.`,
          authors: [],
          licence: 'All-Rights-Reserved',
        },
        'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. Extra drops exist only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime). The mod id must stay unique among the mods you install.',
      ),
      element(
        id,
        KINDS.lootAddition,
        { format: 1, tables: [tableId], pools: [pool] },
        `An extra drop: ${source} ${count} ${item}, ${when}. tables names the vanilla loot tables to add to and pools the pools added to each; the vanilla pools stay. ${conditionNote} The drop comes back after /reload, but a world data pack that replaces the whole table wins. Extra drops need the Fabric mod jar export.`,
      ),
    ],
    assets: [],
  };
}
