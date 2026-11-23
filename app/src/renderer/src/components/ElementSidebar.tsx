import type { Element, Namespace, Project, ResourceLocation } from '@msm/core';
import { ChevronDown, ChevronRight, Search, Trash2 } from 'lucide-react';
import { ScrollArea } from 'radix-ui';
import { useState } from 'react';
import type { RecentProjectView } from '../../../shared/platform';
import { exactFirst, matchesLocally, useLocalWords } from '../search/local-match';
import { displayNameOf } from '../session/plain-problems';
import { useTextureDrop } from '../textures/texture-drop';
import { type AssetActions, AssetList } from './AssetList';
import { buttonClass, iconButtonClass } from './ui/Button';

/** Props of {@link ElementSidebar}. */
export interface ElementSidebarProps {
  project: Project | null;
  selectedId: ResourceLocation | null;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
  /** Asset import, thumbnails, reveal and remove; read-only list without it. */
  assetActions?: AssetActions;
  /** Recent projects, listed when no project is open (newest first). */
  recentProjects?: readonly RecentProjectView[];
  /** Opens a recent project by its root. */
  onOpenRecent?(root: string): void;
  /** Removes a recent project from the list by its root. */
  onRemoveRecent?(root: string): void;
  /** Collapsed group keys (`<namespace>/<group>`). */
  collapsed?: ReadonlySet<string>;
  /** Collapses or expands a group. */
  onToggleGroup?(key: string): void;
  /** Creator flow titles by flow id, for naming sets. */
  flowTitles?: Readonly<Record<string, string>>;
}

/** Friendly sidebar headings per kind (ADR 0047 D2); other kinds show words of their id. */
export const GROUP_LABELS: Readonly<Record<string, string>> = {
  'msm:item': 'Items',
  'msm:block': 'Blocks',
  'msm:effect': 'Status effects',
  'msm:potion': 'Potions',
  'msm:particle': 'Particles',
  'msm:mod': 'Mod settings',
  'msm:biome_addition': 'World additions',
  'msm:loot_addition': 'Extra drops',
  'msm:command': 'Commands',
  'msm:creative_tab': 'Creative tabs',
  'msm:game_rule': 'Game rules',
  'msm:stat': 'Statistics',
  // The Studio's title (ADR 0105 D4, B516).
  'msm:vanilla_block_rules': 'Vanilla block rules',
  'minecraft:model': 'Models',
  'minecraft:item_definition': 'Item looks',
  'minecraft:block_definition': 'Block states',
  'minecraft:equipment': 'Armour looks',
  'minecraft:particle': 'Particle pictures',
  'minecraft:lang': 'Names and text',
  'minecraft:pack_mcmeta': 'Pack settings',
  'minecraft:recipe': 'Recipes',
  'minecraft:loot_table': 'Loot tables',
  'minecraft:advancement': 'Advancements',
  'minecraft:function': 'Functions',
  'minecraft:predicate': 'Predicates',
  'minecraft:item_modifier': 'Item modifiers',
  'minecraft:sounds': 'Sounds',
  'minecraft:font': 'Fonts',
  'minecraft:atlas': 'Texture atlases',
  'minecraft:enchantment': 'Enchantments',
  'minecraft:painting_variant': 'Paintings',
  'minecraft:jukebox_song': 'Music',
  'minecraft:trim_material': 'Trim materials',
  'minecraft:wolf_variant': 'Wolf skins',
  'minecraft:cat_variant': 'Cat skins',
  'minecraft:pig_variant': 'Pig skins',
  'minecraft:cow_variant': 'Cow skins',
  'minecraft:chicken_variant': 'Chicken skins',
  'minecraft:frog_variant': 'Frog skins',
  'minecraft:zombie_nautilus_variant': 'Zombie nautilus skins',
  'minecraft:cat_sound_variant': 'Cat sounds',
  'minecraft:pig_sound_variant': 'Pig sounds',
  'minecraft:cow_sound_variant': 'Cow sounds',
  'minecraft:chicken_sound_variant': 'Chicken sounds',
  'minecraft:instrument': 'Horn sounds',
  'minecraft:enchantment_provider': 'Enchantment providers',
  'minecraft:timeline': 'Timelines',
  'minecraft:world_clock': 'World clocks',
  // Data kinds sweep 2 (ADR 0106 D1, D2; B508).
  'minecraft:decorated_pot_pattern': 'Pot patterns',
  'minecraft:block_transformer': 'Block transformers',
  'minecraft:test_environment': 'Test environments',
  'minecraft:test_instance': 'Test instances',
  'minecraft:sulfur_cube_archetype': 'Sulfur cube kinds',
  'minecraft:context_int_provider': 'Whole-number providers',
  'minecraft:context_float_provider': 'Decimal-number providers',
  'minecraft:post_effect': 'Screen effects',
  'minecraft:waypoint_style': 'Waypoint styles',
  'minecraft:shader': 'Shader programs',
  // Kinds that form a group of their own and had no heading (2026-11-22).
  'minecraft:damage_type': 'Damage types',
  'minecraft:dimension_type': 'Dimension types',
  'minecraft:dimension': 'Dimensions',
  'minecraft:chat_type': 'Chat types',
  'minecraft:banner_pattern': 'Banner patterns',
  'minecraft:trim_pattern': 'Trim patterns',
  'minecraft:dialog': 'Dialogs',
  'minecraft:villager_trade': 'Villager trades',
  'minecraft:trade_set': 'Trade sets',
  'minecraft:trial_spawner': 'Trial spawners',
  'msm:fluid': 'Liquids',
  'msm:vehicle': 'Vehicles',
  'msm:villager_profession': 'Village jobs',
  'msm:villager_type': 'Villager looks',
  'msm:rules': 'Rule books',
  'msm:key_bind': 'Key binds',
  'msm:hud': 'On-screen displays',
  // The games kinds (ADR 0113, B549).
  'msm:world_setup': 'How my world starts',
  'msm:one_block': 'One blocks',
  'msm:team': 'Teams',
  'msm:objective': 'Scores',
  'msm:timer': 'Timers',
  'msm:area': 'Areas',
  // The Game and map Studio's kinds (ADR 0132, listed by B724).
  'msm:game': 'Games',
  'msm:kit': 'Kits',
};

/** Groups the sidebar folds under "More": the files behind content (ADR 0047 D1). */
export const TECHNICAL_GROUPS: ReadonlySet<string> = new Set([
  'msm:mod',
  'minecraft:model',
  'minecraft:item_definition',
  'minecraft:block_definition',
  'minecraft:lang',
  'minecraft:pack_mcmeta',
  'minecraft:atlas',
  'minecraft:font',
]);

/**
 * The headings of the shared groups (plan B703, D5): the group keys ({@link WORLDGEN_GROUP},
 * {@link ENTITIES_GROUP}, …) keep their values, so test ids and collapsed keys do not change;
 * only the words shown come from here.
 */
export const SHARED_GROUP_LABELS: Readonly<Record<string, string>> = {
  Tags: 'Tags',
  Worldgen: 'World generation',
  Structures: 'Structures',
  Entities: 'Mobs',
  'Models and animations': 'Models and animations',
  Scripts: 'Scripts',
};

/**
 * The heading of a group: its friendly label, or words of its kind id ("Loot tables"; ADR 0130
 * D4: the list shows names and groups, never ids).
 */
export function groupLabel(group: string): string {
  const own = GROUP_LABELS[group] ?? SHARED_GROUP_LABELS[group];
  if (own !== undefined) return own;
  if (!group.includes(':')) return group;
  const last =
    group
      .slice(group.lastIndexOf(':') + 1)
      .split('/')
      .pop() ?? group;
  const words = last.replace(/_/g, ' ').trim();
  const plural = words.endsWith('s') ? words : `${words}s`;
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/**
 * What the sidebar's search reads of an element: its id, kind, friendly group and the group's
 * key ("Worldgen", "Entities": the words the group had before B703 still find it).
 */
function searchTexts(element: Element): string[] {
  const group = groupOf(element.kind);
  const label = groupLabel(group);
  return label === group || group.includes(':')
    ? [element.id, element.kind, label]
    : [element.id, element.kind, label, group];
}

/** The old exact match: the id, kind or friendly group contains the text (case-insensitive). */
function matchesExactly(element: Element, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (text === '') return true;
  return searchTexts(element).some((value) => value.toLowerCase().includes(text));
}

/**
 * Whether `element` matches a sidebar search: the id, kind or friendly group contains the text
 * (case-insensitive), or the search's text matching finds every word in them (spellings, stems,
 * word groups, one or two wrong letters; B668).
 */
export function matchesSearch(element: Element, query: string): boolean {
  return matchesExactly(element, query) || matchesLocally(query, searchTexts(element));
}

/**
 * The elements a sidebar search shows: the exact matches first, in their order, then the ones
 * only the search's text matching finds (B668).
 */
export function searchElements(elements: readonly Element[], query: string): Element[] {
  return exactFirst(elements, query, (element) => matchesExactly(element, query), searchTexts);
}

/** One Creator set: its key, label and elements. */
export interface CreatorSetGroup {
  setId: string;
  label: string;
  elements: Element[];
}

/**
 * The Creator sets of a namespace (elements sharing `meta.creator.setId`), labelled "<name>
 * (<flow title>)" from the set's `*_name` value, in label order.
 */
export function creatorSets(
  elements: readonly Element[],
  flowTitles: Readonly<Record<string, string>> = {},
): CreatorSetGroup[] {
  const sets = new Map<string, CreatorSetGroup>();
  for (const element of elements) {
    const creator = element.meta?.creator;
    if (creator === undefined) continue;
    let set = sets.get(creator.setId);
    if (set === undefined) {
      const nameKey = Object.keys(creator.values)
        .sort()
        .find((key) => key === 'name' || key.endsWith('_name'));
      const name = nameKey === undefined ? undefined : creator.values[nameKey];
      const flow = flowTitles[creator.flowId] ?? creator.flowId.replace(/^.*[.:]/, '');
      set = {
        setId: creator.setId,
        label: typeof name === 'string' && name !== '' ? `${name} (${flow})` : flow,
        elements: [],
      };
      sets.set(creator.setId, set);
    }
    set.elements.push(element);
  }
  return [...sets.values()]
    .map((set) => ({
      ...set,
      elements: [...set.elements].sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const NO_ASSET_ACTIONS: AssetActions = {};
const NO_COLLAPSED: ReadonlySet<string> = new Set();

/** The prefix of tag kinds (`minecraft:tag/<registry>`), which share one "Tags" group. */
const TAG_KIND_PREFIX = 'minecraft:tag/';

/** The heading tag kinds are grouped under. */
export const TAGS_GROUP = 'Tags';

/**
 * The key of the group worldgen kinds (`minecraft:worldgen/<registry>`, dimensions) are grouped
 * under; its heading reads "World generation" ({@link SHARED_GROUP_LABELS}).
 */
export const WORLDGEN_GROUP = 'Worldgen';

/** The heading structure templates are grouped under. */
export const STRUCTURES_GROUP = 'Structures';

/** The key of the group custom entities (`msm:entity`) are grouped under; its heading reads "Mobs". */
export const ENTITIES_GROUP = 'Entities';

/** The heading geo models and animation sets (`msm:geo_model`, `msm:animation`) are grouped under. */
export const MODELS_ANIM_GROUP = 'Models and animations';

/** The heading runtime scripts (`msm:script`) are grouped under (after "Models and animations"). */
export const SCRIPTS_GROUP = 'Scripts';

const WORLDGEN_KIND_PREFIX = 'minecraft:worldgen/';
const DIMENSION_KIND = 'minecraft:dimension';
const STRUCTURE_TEMPLATE_KIND = 'minecraft:structure_template';
const ENTITY_KIND = 'msm:entity';
const SCRIPT_KIND = 'msm:script';

/** The kinds of the {@link MODELS_ANIM_GROUP} group. */
const MODELS_ANIM_KINDS: ReadonlySet<string> = new Set(['msm:geo_model', 'msm:animation']);

/**
 * The small sub-headings inside the Tags, World generation and Models and animations groups, by
 * kind (plan B703, D5: kind words head rows, never stand before a name). Kinds not listed read
 * through {@link subHeadingOf}'s fallbacks.
 */
export const SUB_HEADINGS: Readonly<Record<string, string>> = {
  'minecraft:tag/item': 'Item tags',
  'minecraft:tag/block': 'Block tags',
  'minecraft:tag/entity_type': 'Mob tags',
  'minecraft:tag/fluid': 'Fluid tags',
  'minecraft:tag/function': 'Function tags',
  'minecraft:tag/worldgen/biome': 'Biome tags',
  'minecraft:tag/worldgen/world_preset': 'World type tags',
  'minecraft:worldgen/biome': 'Biomes',
  'minecraft:worldgen/feature': 'Features',
  'minecraft:worldgen/configured_feature': 'Features',
  'minecraft:worldgen/placed_feature': 'Where features go',
  'minecraft:worldgen/carver': 'Carvers',
  'minecraft:worldgen/configured_carver': 'Carvers',
  'minecraft:worldgen/structure': 'Structures',
  'minecraft:worldgen/structure_set': 'Structure sets',
  'minecraft:worldgen/template_pool': 'Building pools',
  'minecraft:worldgen/processor_list': 'Block changers',
  'minecraft:worldgen/noise_settings': 'Noise settings',
  'minecraft:worldgen/noise': 'Noise',
  'minecraft:worldgen/density_function': 'Density functions',
  'minecraft:worldgen/world_preset': 'World types',
  'minecraft:dimension': 'Dimensions',
  'msm:geo_model': 'Models',
  'msm:animation': 'Animations',
};

/** Words of a registry's last path part, capitalised ("damage_type" reads "Damage type"). */
function registryWords(registry: string): string {
  const last = registry.split('/').pop() ?? registry;
  const words = last.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The sub-heading a row sits under in its group, or `undefined` for groups without them: the
 * {@link SUB_HEADINGS} entry, else a tag's registry words and "tags" ("Damage type tags"), else
 * {@link groupLabel}'s words of the kind ("Multi noise biome source parameter lists").
 */
export function subHeadingOf(group: string, kind: string): string | undefined {
  if (group !== TAGS_GROUP && group !== WORLDGEN_GROUP && group !== MODELS_ANIM_GROUP) {
    return undefined;
  }
  const own = SUB_HEADINGS[kind];
  if (own !== undefined) return own;
  const tag = tagRegistryOf(kind);
  if (tag !== undefined) return `${registryWords(tag)} tags`;
  return groupLabel(kind);
}

/** The registry of a tag kind (`item` for `minecraft:tag/item`), or `undefined`. */
export function tagRegistryOf(kind: string): string | undefined {
  return kind.startsWith(TAG_KIND_PREFIX) ? kind.slice(TAG_KIND_PREFIX.length) : undefined;
}

/**
 * The registry of a kind in the {@link WORLDGEN_GROUP} group (`biome` for
 * `minecraft:worldgen/biome`, `dimension` for `minecraft:dimension`), or `undefined` for other
 * kinds.
 */
export function worldgenRegistryOf(kind: string): string | undefined {
  if (kind.startsWith(WORLDGEN_KIND_PREFIX)) return kind.slice(WORLDGEN_KIND_PREFIX.length);
  return kind === DIMENSION_KIND ? 'dimension' : undefined;
}

/** The sidebar group of a kind: a shared heading, or the kind id itself. */
export function groupOf(kind: string): string {
  if (tagRegistryOf(kind) !== undefined) return TAGS_GROUP;
  if (worldgenRegistryOf(kind) !== undefined) return WORLDGEN_GROUP;
  if (kind === STRUCTURE_TEMPLATE_KIND) return STRUCTURES_GROUP;
  if (kind === ENTITY_KIND) return ENTITIES_GROUP;
  if (MODELS_ANIM_KINDS.has(kind)) return MODELS_ANIM_GROUP;
  if (kind === SCRIPT_KIND) return SCRIPTS_GROUP;
  return kind;
}

/**
 * Groups a namespace's elements by kind, kinds and elements in id order. Every tag kind
 * (`minecraft:tag/<registry>`) goes into one {@link TAGS_GROUP} group, every worldgen kind
 * (`minecraft:worldgen/<registry>` and `minecraft:dimension`) into one
 * {@link WORLDGEN_GROUP} group, structure templates into {@link STRUCTURES_GROUP}, custom
 * entities into {@link ENTITIES_GROUP}, geo models and animation sets into
 * {@link MODELS_ANIM_GROUP} and scripts into {@link SCRIPTS_GROUP}; shared groups are ordered
 * by kind and then id. Groups sort by heading, so "Scripts" follows "Models and animations".
 */
export function groupByKind(namespace: Namespace): [kind: string, elements: Element[]][] {
  const groups = new Map<string, Element[]>();
  for (const element of namespace.elements) {
    const key = groupOf(element.kind);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [element]);
    else group.push(element);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, elements]) => [
      kind,
      [...elements].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
    ]);
}

const headingClass = 'mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted';
const subHeadingClass = 'mt-1 px-1 text-[0.7rem] text-muted';
const emptyClass = 'px-1 py-0.5 text-muted';

function ElementRow(props: {
  element: Element;
  selected: boolean;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
}) {
  const { element } = props;
  const { over, dropProps } = useTextureDrop(element.id);
  return (
    <li
      className={`group flex min-w-0 items-center gap-1 rounded ${over ? 'outline-2 outline-accent' : ''}`}
      data-texture-over={over ? 'true' : undefined}
      {...dropProps}
    >
      <button
        type="button"
        aria-label={displayNameOf(element)}
        aria-current={props.selected ? 'true' : undefined}
        title={displayNameOf(element)}
        data-testid={`element-row-${element.id}`}
        className={
          'w-0 min-w-0 flex-1 truncate rounded border px-2 py-0.5 text-left cursor-pointer ' +
          (props.selected
            ? 'border-accent bg-panel'
            : 'border-transparent hover:bg-panel hover:border-border')
        }
        onClick={() => props.onSelect(element.id)}
      >
        {displayNameOf(element)}
      </button>
      <button
        type="button"
        className={iconButtonClass}
        aria-label={`Remove ${displayNameOf(element)}`}
        title={`Remove ${displayNameOf(element)}`}
        onClick={() => props.onRemove(element.id)}
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </li>
  );
}

/** Rows by sub-heading, in the order each sub-heading first comes (one run without them). */
function subGroups(
  group: string,
  elements: readonly Element[],
): { heading: string | undefined; elements: Element[] }[] {
  const runs = new Map<string | undefined, Element[]>();
  for (const element of elements) {
    const heading = subHeadingOf(group, element.kind);
    const run = runs.get(heading);
    if (run === undefined) runs.set(heading, [element]);
    else run.push(element);
  }
  return [...runs.entries()].map(([heading, rows]) => ({ heading, elements: rows }));
}

/** A collapsible group heading with its rows. */
function GroupSection(props: {
  namespace: string;
  /** The mod part's name before the section's name, when the mod has more than one. */
  part?: string | undefined;
  group: string;
  label: string;
  subtitle?: string | undefined;
  elements: readonly Element[];
  selectedId: ResourceLocation | null;
  collapsed: boolean;
  onToggle(): void;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
}) {
  const Chevron = props.collapsed ? ChevronRight : ChevronDown;
  const row = (element: Element) => (
    <ElementRow
      key={element.id}
      element={element}
      selected={element.id === props.selectedId}
      onSelect={props.onSelect}
      onRemove={props.onRemove}
    />
  );
  const runs = subGroups(props.group, props.elements);
  return (
    <section
      aria-label={props.part === undefined ? props.label : `${props.part} ${props.label}`}
      className="ml-1"
    >
      <h3 className={headingClass}>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-1 text-left"
          aria-expanded={!props.collapsed}
          data-testid={`group-toggle-${props.namespace}-${props.group}`}
          onClick={props.onToggle}
          title={props.subtitle}
        >
          <Chevron size={12} aria-hidden />
          <span>{props.label}</span>
          {props.subtitle !== undefined && (
            <span className="ml-1 font-normal normal-case tracking-normal opacity-70">
              {props.subtitle}
            </span>
          )}
          <span className="ml-auto font-normal tracking-normal" aria-hidden>
            {props.elements.length}
          </span>
        </button>
      </h3>
      {!props.collapsed &&
        (runs.every((run) => run.heading === undefined) ? (
          <ul className="flex flex-col gap-0.5">{props.elements.map(row)}</ul>
        ) : (
          runs.map((run) => (
            <div key={run.heading ?? ''}>
              <h4 className={subHeadingClass}>{run.heading}</h4>
              <ul className="flex flex-col gap-0.5">{run.elements.map(row)}</ul>
            </div>
          ))
        ))}
    </section>
  );
}

function NamespaceSection(props: {
  namespace: Namespace;
  selectedId: ResourceLocation | null;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
  assetActions: AssetActions;
  query: string;
  /** Whether the project has more than one namespace (then each is headed by its name). */
  headed: boolean;
  collapsed: ReadonlySet<string>;
  onToggleGroup(key: string): void;
  flowTitles: Readonly<Record<string, string>>;
}) {
  const { namespace } = props;
  // Re-reads the search once the plugins' word groups are loaded.
  useLocalWords();
  const visible = searchElements(namespace.elements, props.query);
  const searching = props.query.trim() !== '';
  const keyOf = (group: string) => `${namespace.name}/${group}`;
  const section = (
    group: string,
    label: string,
    elements: readonly Element[],
    subtitle?: string,
  ) => (
    <GroupSection
      key={group}
      namespace={namespace.name}
      part={props.headed ? namespace.name : undefined}
      group={group}
      label={label}
      subtitle={subtitle}
      elements={elements}
      selectedId={props.selectedId}
      // A search shows every match, whatever is collapsed.
      collapsed={!searching && props.collapsed.has(keyOf(group))}
      onToggle={() => props.onToggleGroup(keyOf(group))}
      onSelect={props.onSelect}
      onRemove={props.onRemove}
    />
  );

  let body: React.ReactNode;
  if (visible.length === 0) {
    body = <p className={emptyClass}>{searching ? 'Nothing matches.' : 'Nothing here yet.'}</p>;
  } else {
    const sets = creatorSets(visible, props.flowTitles);
    const inSets = new Set(sets.flatMap((set) => set.elements.map((element) => element.id)));
    const rest = visible.filter((element) => !inSets.has(element.id));
    const groups = groupByKind({ ...namespace, elements: rest });
    const main = groups.filter(([kind]) => !TECHNICAL_GROUPS.has(kind));
    const technical = groups.filter(([kind]) => TECHNICAL_GROUPS.has(kind));
    const moreCount = technical.reduce((sum, [, elements]) => sum + elements.length, 0);
    // "More" starts folded; its key in the set means the user opened it. End-to-end runs that
    // start every More options open start it open too (its key then folds it; ADR 0130).
    const moreStartsOpen = typeof window !== 'undefined' && window.msmMoreOptionsOpen === true;
    const moreOpen = searching || props.collapsed.has(keyOf('more')) !== moreStartsOpen;
    body = (
      <>
        {sets.map((set) => section(`set:${set.setId}`, set.label, set.elements))}
        {main.map(([kind, elements]) => section(kind, groupLabel(kind), elements))}
        {moreCount > 0 && (
          <section
            aria-label={props.headed ? `${namespace.name} More things` : 'More things'}
            className="mt-2"
          >
            <button
              type="button"
              className={`${headingClass} flex w-full cursor-pointer items-center gap-1 text-left`}
              aria-expanded={moreOpen}
              data-testid={`group-toggle-${namespace.name}-more`}
              onClick={() => props.onToggleGroup(keyOf('more'))}
            >
              {moreOpen ? (
                <ChevronDown size={12} aria-hidden />
              ) : (
                <ChevronRight size={12} aria-hidden />
              )}
              <span>More things ({moreCount})</span>
            </button>
            {moreOpen &&
              technical.map(([kind, elements]) => section(kind, groupLabel(kind), elements))}
          </section>
        )}
      </>
    );
  }

  return (
    <section aria-label={props.headed ? namespace.name : 'This mod'} className="mb-3">
      {props.headed && <h2 className="mt-2 mb-1 font-semibold">{namespace.name}</h2>}
      {body}
      {!searching && (
        <AssetList
          namespace={namespace.name}
          part={props.headed ? namespace.name : undefined}
          assets={namespace.assets}
          actions={props.assetActions}
        />
      )}
    </section>
  );
}

/**
 * The "Recent projects" list shown when no project is open: one row per project with its
 * name, path and an Open button. A missing project is marked "(missing)", cannot be opened
 * and can be removed from the list.
 */
export function RecentProjectsList(props: {
  projects: readonly RecentProjectView[];
  onOpen?: ((root: string) => void) | undefined;
  onRemove?: ((root: string) => void) | undefined;
}) {
  if (props.projects.length === 0) return null;
  return (
    <section aria-labelledby="recent-projects-heading" className="mt-3">
      <h2 id="recent-projects-heading" className={headingClass}>
        Recent projects
      </h2>
      <ul data-testid="recent-projects" className="flex flex-col gap-1">
        {props.projects.map((entry, index) => (
          <li
            key={entry.root}
            data-testid={`recent-row-${index}`}
            data-missing={entry.exists ? undefined : 'true'}
            className="flex min-w-0 items-center gap-1 rounded border border-border px-2 py-1"
          >
            <div className="flex w-0 min-w-0 flex-1 flex-col">
              <span className="truncate font-medium" title={entry.name}>
                {entry.name}
                {!entry.exists && <span className="ml-1 text-muted text-xs">(missing)</span>}
              </span>
              <span className="truncate text-muted text-xs" title={entry.root}>
                {entry.root}
              </span>
            </div>
            <button
              type="button"
              className={buttonClass}
              data-testid={`recent-open-${index}`}
              aria-label={`Open ${entry.name}${entry.exists ? '' : ' (missing)'}`}
              title={
                entry.exists ? `Open ${entry.root}` : `${entry.root} no longer holds a project`
              }
              disabled={!entry.exists || props.onOpen === undefined}
              onClick={() => props.onOpen?.(entry.root)}
            >
              Open
            </button>
            {!entry.exists && props.onRemove !== undefined && (
              <button
                type="button"
                className={iconButtonClass}
                data-testid={`recent-remove-${index}`}
                aria-label={`Remove ${entry.name} from recent projects`}
                title="Remove from recent projects"
                onClick={() => props.onRemove?.(entry.root)}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The left sidebar: namespaces, then kinds, then elements, plus each namespace's assets, in
 * plain words (plan B703, D5): names only, kind words as group headings and sub-headings.
 */
export function ElementSidebar({
  project,
  selectedId,
  onSelect,
  onRemove,
  assetActions = NO_ASSET_ACTIONS,
  recentProjects = [],
  onOpenRecent,
  onRemoveRecent,
  collapsed = NO_COLLAPSED,
  onToggleGroup = () => undefined,
  flowTitles = {},
}: ElementSidebarProps) {
  const [query, setQuery] = useState('');
  return (
    <ScrollArea.Root className="min-h-0 overflow-hidden border-r border-border">
      <ScrollArea.Viewport className="size-full">
        <nav aria-label="Things in this mod" className="p-2">
          {project !== null && project.namespaces.length > 0 && (
            <label className="mb-1 flex items-center gap-1 rounded border border-border bg-bg px-2 py-1">
              <Search size={14} aria-hidden className="text-muted" />
              <span className="sr-only">Search things in this mod</span>
              <input
                type="search"
                data-testid="sidebar-search"
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          )}
          {project === null ? (
            <>
              <p className={emptyClass}>No mod is open. Start one or open one from Home.</p>
              <RecentProjectsList
                projects={recentProjects}
                onOpen={onOpenRecent}
                onRemove={onRemoveRecent}
              />
            </>
          ) : project.namespaces.length === 0 ? (
            <p className={emptyClass}>Nothing here yet.</p>
          ) : (
            project.namespaces.map((namespace) => (
              <NamespaceSection
                key={namespace.name}
                namespace={namespace}
                selectedId={selectedId}
                onSelect={onSelect}
                onRemove={onRemove}
                assetActions={assetActions}
                headed={project.namespaces.length > 1}
                query={query}
                collapsed={collapsed}
                onToggleGroup={onToggleGroup}
                flowTitles={flowTitles}
              />
            ))
          )}
        </nav>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none p-0.5 select-none"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
