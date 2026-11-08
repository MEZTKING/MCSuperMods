import type { Element, Namespace, Project, ResourceLocation } from '@msm/core';
import { ChevronDown, ChevronRight, Search, Trash2 } from 'lucide-react';
import { ScrollArea } from 'radix-ui';
import { useState } from 'react';
import type { RecentProjectView } from '../../../shared/platform';
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
  /** Easy groups by Creator set and folds technical groups; Advanced shows kind ids (ADR 0047). */
  mode?: 'easy' | 'advanced';
  /** Collapsed group keys (`<namespace>/<group>`). */
  collapsed?: ReadonlySet<string>;
  /** Collapses or expands a group. */
  onToggleGroup?(key: string): void;
  /** Creator flow titles by flow id, for naming sets in Easy mode. */
  flowTitles?: Readonly<Record<string, string>>;
}

/** Friendly sidebar headings per kind (ADR 0047 D2); other kinds show their id. */
export const GROUP_LABELS: Readonly<Record<string, string>> = {
  'msm:item': 'Items',
  'msm:block': 'Blocks',
  'msm:mod': 'Mod settings',
  'minecraft:model': 'Models',
  'minecraft:item_definition': 'Item looks',
  'minecraft:block_definition': 'Block states',
  'minecraft:equipment': 'Armour looks',
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
};

/** Groups Easy mode folds under "More": the files behind content (ADR 0047 D1). */
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

/** The heading of a group: its friendly label, or the group key itself. */
export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

/** Whether `element` matches a sidebar search (id, kind or friendly group, case-insensitive). */
export function matchesSearch(element: Element, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (text === '') return true;
  return [element.id, element.kind, groupLabel(groupOf(element.kind))].some((value) =>
    value.toLowerCase().includes(text),
  );
}

/** One Creator set in Easy mode: its key, label and elements. */
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

/** The heading worldgen kinds (`minecraft:worldgen/<registry>`, dimensions) are grouped under. */
export const WORLDGEN_GROUP = 'Worldgen';

/** The heading structure templates are grouped under. */
export const STRUCTURES_GROUP = 'Structures';

/** The heading custom entities (`msm:entity`) are grouped under. */
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

/** The label shown before the name in the {@link MODELS_ANIM_GROUP} group, per kind. */
const MODELS_ANIM_LABELS: Readonly<Record<string, string>> = {
  'msm:geo_model': 'model',
  'msm:animation': 'animation',
};

/** The registry of a tag kind (`item` for `minecraft:tag/item`), or `undefined`. */
export function tagRegistryOf(kind: string): string | undefined {
  return kind.startsWith(TAG_KIND_PREFIX) ? kind.slice(TAG_KIND_PREFIX.length) : undefined;
}

/**
 * The registry shown before the name in the {@link WORLDGEN_GROUP} group (`biome` for
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
  if (MODELS_ANIM_LABELS[kind] !== undefined) return MODELS_ANIM_GROUP;
  if (kind === SCRIPT_KIND) return SCRIPTS_GROUP;
  return kind;
}

/** The registry shown before an element's name in its group, or `undefined`. */
function rowRegistry(group: string, kind: string): string | undefined {
  if (group === TAGS_GROUP) return tagRegistryOf(kind);
  if (group === WORLDGEN_GROUP) return worldgenRegistryOf(kind);
  if (group === MODELS_ANIM_GROUP) return MODELS_ANIM_LABELS[kind];
  return undefined;
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

function pathOf(id: ResourceLocation): string {
  const colon = id.indexOf(':');
  return colon === -1 ? id : id.slice(colon + 1);
}

const headingClass = 'mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted';
const emptyClass = 'px-1 py-0.5 text-muted';

function ElementRow(props: {
  element: Element;
  selected: boolean;
  /** The label shown before the name in the "Tags", "Worldgen" and "Models and animations" groups. */
  tagRegistry?: string | undefined;
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
        aria-label={element.id}
        aria-current={props.selected ? 'true' : undefined}
        title={element.id}
        data-testid={`element-row-${element.id}`}
        className={
          'w-0 min-w-0 flex-1 truncate rounded border px-2 py-0.5 text-left cursor-pointer ' +
          (props.selected
            ? 'border-accent bg-panel'
            : 'border-transparent hover:bg-panel hover:border-border')
        }
        onClick={() => props.onSelect(element.id)}
      >
        {props.tagRegistry !== undefined && (
          <span className="mr-1 text-muted text-xs">{props.tagRegistry}</span>
        )}
        {pathOf(element.id)}
      </button>
      <button
        type="button"
        className={iconButtonClass}
        aria-label={`Remove ${element.id}`}
        title={`Remove ${element.id}`}
        onClick={() => props.onRemove(element.id)}
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </li>
  );
}

/** A collapsible group heading with its rows. */
function GroupSection(props: {
  namespace: string;
  group: string;
  label: string;
  subtitle?: string | undefined;
  elements: readonly Element[];
  selectedId: ResourceLocation | null;
  collapsed: boolean;
  onToggle(): void;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
  /** The label before each row's name (Tags, Worldgen, Models and animations). */
  rowLabel?: ((element: Element) => string | undefined) | undefined;
}) {
  const Chevron = props.collapsed ? ChevronRight : ChevronDown;
  return (
    <section aria-label={`${props.namespace} ${props.group}`} className="ml-1">
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
      {!props.collapsed && (
        <ul className="flex flex-col gap-0.5">
          {props.elements.map((element) => (
            <ElementRow
              key={element.id}
              element={element}
              selected={element.id === props.selectedId}
              tagRegistry={props.rowLabel?.(element)}
              onSelect={props.onSelect}
              onRemove={props.onRemove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NamespaceSection(props: {
  namespace: Namespace;
  selectedId: ResourceLocation | null;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
  assetActions: AssetActions;
  mode: 'easy' | 'advanced';
  query: string;
  collapsed: ReadonlySet<string>;
  onToggleGroup(key: string): void;
  flowTitles: Readonly<Record<string, string>>;
}) {
  const { namespace, mode } = props;
  const visible = namespace.elements.filter((element) => matchesSearch(element, props.query));
  const searching = props.query.trim() !== '';
  const keyOf = (group: string) => `${namespace.name}/${group}`;
  const section = (
    group: string,
    label: string,
    elements: readonly Element[],
    subtitle?: string,
    rowLabel?: (element: Element) => string | undefined,
  ) => (
    <GroupSection
      key={group}
      namespace={namespace.name}
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
      rowLabel={rowLabel}
    />
  );

  let body: React.ReactNode;
  if (visible.length === 0) {
    body = <p className={emptyClass}>{searching ? 'Nothing matches.' : 'No elements.'}</p>;
  } else if (mode === 'advanced') {
    body = groupByKind({ ...namespace, elements: visible }).map(([kind, elements]) =>
      section(
        kind,
        groupLabel(kind),
        elements,
        GROUP_LABELS[kind] === undefined ? undefined : kind,
        (element) => rowRegistry(kind, element.kind),
      ),
    );
  } else {
    const sets = creatorSets(visible, props.flowTitles);
    const inSets = new Set(sets.flatMap((set) => set.elements.map((element) => element.id)));
    const rest = visible.filter((element) => !inSets.has(element.id));
    const groups = groupByKind({ ...namespace, elements: rest });
    const main = groups.filter(([kind]) => !TECHNICAL_GROUPS.has(kind));
    const technical = groups.filter(([kind]) => TECHNICAL_GROUPS.has(kind));
    const moreCount = technical.reduce((sum, [, elements]) => sum + elements.length, 0);
    // "More" starts folded; its key in the set means the user opened it.
    const moreOpen = searching || props.collapsed.has(keyOf('more'));
    body = (
      <>
        {sets.map((set) => section(`set:${set.setId}`, set.label, set.elements))}
        {main.map(([kind, elements]) =>
          section(kind, groupLabel(kind), elements, undefined, (element) =>
            rowRegistry(kind, element.kind),
          ),
        )}
        {moreCount > 0 && (
          <section aria-label={`${namespace.name} more`} className="mt-2">
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
              <span>More ({moreCount} technical)</span>
            </button>
            {moreOpen &&
              technical.map(([kind, elements]) => section(kind, groupLabel(kind), elements))}
          </section>
        )}
      </>
    );
  }

  return (
    <section aria-label={`Namespace ${namespace.name}`} className="mb-3">
      <h2 className="mt-2 mb-1 font-semibold">{namespace.name}</h2>
      {body}
      {(mode === 'advanced' || !searching) && (
        <AssetList
          namespace={namespace.name}
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

/** The left sidebar: namespaces, then kinds, then elements, plus each namespace's assets. */
export function ElementSidebar({
  project,
  selectedId,
  onSelect,
  onRemove,
  assetActions = NO_ASSET_ACTIONS,
  recentProjects = [],
  onOpenRecent,
  onRemoveRecent,
  mode = 'advanced',
  collapsed = NO_COLLAPSED,
  onToggleGroup = () => undefined,
  flowTitles = {},
}: ElementSidebarProps) {
  const [query, setQuery] = useState('');
  return (
    <ScrollArea.Root className="min-h-0 overflow-hidden border-r border-border">
      <ScrollArea.Viewport className="size-full">
        <nav aria-label="Elements" className="p-2">
          {project !== null && project.namespaces.length > 0 && (
            <label className="mb-1 flex items-center gap-1 rounded border border-border bg-bg px-2 py-1">
              <Search size={14} aria-hidden className="text-muted" />
              <span className="sr-only">Search elements</span>
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
              <p className={emptyClass}>No project is open. Use New or Open.</p>
              <RecentProjectsList
                projects={recentProjects}
                onOpen={onOpenRecent}
                onRemove={onRemoveRecent}
              />
            </>
          ) : project.namespaces.length === 0 ? (
            <p className={emptyClass}>No namespaces yet. Use Add namespace.</p>
          ) : (
            project.namespaces.map((namespace) => (
              <NamespaceSection
                key={namespace.name}
                namespace={namespace}
                selectedId={selectedId}
                onSelect={onSelect}
                onRemove={onRemove}
                assetActions={assetActions}
                mode={mode}
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
