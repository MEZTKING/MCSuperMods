import type { Element, Namespace, Project, ResourceLocation } from '@msm/core';
import { Trash2 } from 'lucide-react';
import { ScrollArea } from 'radix-ui';
import type { RecentProjectView } from '../../../shared/platform';
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
}

const NO_ASSET_ACTIONS: AssetActions = {};

/** The prefix of tag kinds (`minecraft:tag/<registry>`), which share one "Tags" group. */
const TAG_KIND_PREFIX = 'minecraft:tag/';

/** The heading tag kinds are grouped under. */
export const TAGS_GROUP = 'Tags';

/** The heading worldgen kinds (`minecraft:worldgen/<registry>`, dimensions) are grouped under. */
export const WORLDGEN_GROUP = 'Worldgen';

/** The heading structure templates are grouped under. */
export const STRUCTURES_GROUP = 'Structures';

const WORLDGEN_KIND_PREFIX = 'minecraft:worldgen/';
const DIMENSION_KIND = 'minecraft:dimension';
const STRUCTURE_TEMPLATE_KIND = 'minecraft:structure_template';

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
  return kind;
}

/** The registry shown before an element's name in its group, or `undefined`. */
function rowRegistry(group: string, kind: string): string | undefined {
  if (group === TAGS_GROUP) return tagRegistryOf(kind);
  if (group === WORLDGEN_GROUP) return worldgenRegistryOf(kind);
  return undefined;
}

/**
 * Groups a namespace's elements by kind, kinds and elements in id order. Every tag kind
 * (`minecraft:tag/<registry>`) goes into one {@link TAGS_GROUP} group, every worldgen kind
 * (`minecraft:worldgen/<registry>` and `minecraft:dimension`) into one
 * {@link WORLDGEN_GROUP} group, and structure templates into {@link STRUCTURES_GROUP}; shared
 * groups are ordered by kind and then id.
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
  /** The registry shown before the name in the "Tags" and "Worldgen" groups. */
  tagRegistry?: string | undefined;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
}) {
  const { element } = props;
  return (
    <li className="group flex min-w-0 items-center gap-1">
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

function NamespaceSection(props: {
  namespace: Namespace;
  selectedId: ResourceLocation | null;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
  assetActions: AssetActions;
}) {
  const { namespace } = props;
  const groups = groupByKind(namespace);
  return (
    <section aria-label={`Namespace ${namespace.name}`} className="mb-3">
      <h2 className="mt-2 mb-1 font-semibold">{namespace.name}</h2>
      {groups.length === 0 ? (
        <p className={emptyClass}>No elements.</p>
      ) : (
        groups.map(([kind, elements]) => (
          <section key={kind} aria-label={`${namespace.name} ${kind}`} className="ml-1">
            <h3 className={headingClass}>{kind}</h3>
            <ul className="flex flex-col gap-0.5">
              {elements.map((element) => (
                <ElementRow
                  key={element.id}
                  element={element}
                  selected={element.id === props.selectedId}
                  tagRegistry={rowRegistry(kind, element.kind)}
                  onSelect={props.onSelect}
                  onRemove={props.onRemove}
                />
              ))}
            </ul>
          </section>
        ))
      )}
      <AssetList
        namespace={namespace.name}
        assets={namespace.assets}
        actions={props.assetActions}
      />
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
}: ElementSidebarProps) {
  return (
    <ScrollArea.Root className="min-h-0 overflow-hidden border-r border-border">
      <ScrollArea.Viewport className="size-full">
        <nav aria-label="Elements" className="p-2">
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
