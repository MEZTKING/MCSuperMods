import type { Element, Namespace, Project, ResourceLocation } from '@msm/core';
import { Trash2 } from 'lucide-react';
import { ScrollArea } from 'radix-ui';
import { type AssetActions, AssetList } from './AssetList';
import { iconButtonClass } from './ui/Button';

/** Props of {@link ElementSidebar}. */
export interface ElementSidebarProps {
  project: Project | null;
  selectedId: ResourceLocation | null;
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
  /** Asset import, thumbnails, reveal and remove; read-only list without it. */
  assetActions?: AssetActions;
}

const NO_ASSET_ACTIONS: AssetActions = {};

/** Groups a namespace's elements by kind, kinds and elements in id order. */
export function groupByKind(namespace: Namespace): [kind: string, elements: Element[]][] {
  const groups = new Map<string, Element[]>();
  for (const element of namespace.elements) {
    const group = groups.get(element.kind);
    if (group === undefined) groups.set(element.kind, [element]);
    else group.push(element);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, elements]) => [kind, [...elements].sort((a, b) => a.id.localeCompare(b.id))]);
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
  onSelect(id: ResourceLocation): void;
  onRemove(id: ResourceLocation): void;
}) {
  const { element } = props;
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        aria-label={element.id}
        aria-current={props.selected ? 'true' : undefined}
        title={element.id}
        data-testid={`element-row-${element.id}`}
        className={
          'flex-1 truncate rounded border px-2 py-0.5 text-left cursor-pointer ' +
          (props.selected
            ? 'border-accent bg-panel'
            : 'border-transparent hover:bg-panel hover:border-border')
        }
        onClick={() => props.onSelect(element.id)}
      >
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

/** The left sidebar: namespaces, then kinds, then elements, plus each namespace's assets. */
export function ElementSidebar({
  project,
  selectedId,
  onSelect,
  onRemove,
  assetActions = NO_ASSET_ACTIONS,
}: ElementSidebarProps) {
  return (
    <ScrollArea.Root className="min-h-0 overflow-hidden border-r border-border">
      <ScrollArea.Viewport className="size-full">
        <nav aria-label="Elements" className="p-2">
          {project === null ? (
            <p className={emptyClass}>No project is open. Use New or Open.</p>
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
