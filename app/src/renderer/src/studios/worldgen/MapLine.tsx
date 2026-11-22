/**
 * The worldgen Studios' map line (ADR 0119 D7, D8; B587): **See it on the map** opens the live
 * map of a world of the project that uses the element (the biome lit in it for the Biome
 * Studio), drawn as the project changes; **Walk in it** opens Try it with its ground picker on
 * My world generation, on that world, at the map's seed and place (`terrain/view-store.ts`).
 * The map itself is a lazy chunk (`terrain/LiveMap.tsx`).
 */

import type { Element, Project, Target } from '@msm/plugin-api';
import { lazy, Suspense, useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useUiStore } from '../../store/ui-store';
import { walkIn } from '../../terrain/walk-in';

const LiveMap = lazy(() => import('../../terrain/LiveMap'));

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const withNamespace = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** Whether `json` names `id` anywhere (with or without the `minecraft` namespace). */
function names(json: unknown, id: string): boolean {
  if (typeof json === 'string') return withNamespace(json.replace(/^#/, '')) === id;
  if (Array.isArray(json)) return json.some((item) => names(item, id));
  if (isObject(json)) return Object.values(json).some((item) => names(item, id));
  return false;
}

/**
 * The first world of the project that names `id` itself (a dimension, or a world preset's
 * dimension), as the ground picker keys it; `null` when none does. Used by Walk in it before
 * the map has found the world (the map follows the project's files further).
 */
export function worldNaming(project: Project, id: string): string | null {
  const wanted = withNamespace(id);
  let preset: string | null = null;
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const own = withNamespace(element.id);
      if (element.kind === 'minecraft:dimension' && names(element.data, wanted)) {
        return `dimension:${own}`;
      }
      if (preset === null && element.kind === 'minecraft:worldgen/world_preset') {
        const dimensions = isObject(element.data) && isObject(element.data.dimensions);
        if (!dimensions) continue;
        for (const [dimension, json] of Object.entries(
          (element.data as { dimensions: Json }).dimensions,
        )) {
          if (names(json, wanted)) {
            preset = `preset:${own}:${dimension}`;
            break;
          }
        }
      }
    }
  }
  return preset;
}

/** Props of {@link MapLine}. */
export interface MapLineProps {
  readonly project: Project;
  readonly target: Target;
  readonly element: Element;
  /** `element`: the element's own map (a biome); `host`: a world that uses it. */
  readonly mode: 'element' | 'host';
  /** What the line says, in plain words. */
  readonly words: string;
}

/** The line; see the module comment. */
export function MapLine(props: MapLineProps) {
  const { project, element } = props;
  const [open, setOpen] = useState(false);
  const [shownHost, setShownHost] = useState<string | null>(null);
  const root = useUiStore((state) => state.snapshot?.root ?? null);
  const vanillaReady = useUiStore((state) => state.minecraft.status?.cache != null);
  const onHost = useCallback((key: string | null) => setShownHost(key), []);
  const onSetup = useCallback(
    () =>
      useUiStore.getState().setMessage({
        kind: 'info',
        text: 'Set up your Minecraft folder in Settings, under Game locations, to see this world here.',
      }),
    [],
  );
  return (
    <div className="flex flex-col gap-2" data-testid="studio-map-line">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-expanded={open}
          data-testid="studio-see-map"
          onClick={() => setOpen((before) => !before)}
        >
          {open ? 'Hide the map' : 'See it on the map'}
        </Button>
        <Button
          data-testid="studio-walk-in-it"
          onClick={() =>
            walkIn(root, project, (open ? shownHost : null) ?? worldNaming(project, element.id))
          }
        >
          Walk in it
        </Button>
        <span className="text-xs text-muted">{props.words}</span>
      </div>
      {open && (
        <Suspense
          fallback={
            <p className="text-xs text-muted" data-testid="studio-map-loading">
              Loading the map…
            </p>
          }
        >
          <LiveMap
            owner="studio"
            project={project}
            target={props.target}
            element={element}
            mode={props.mode}
            root={root}
            vanillaReady={vanillaReady}
            onSetup={onSetup}
            onHost={onHost}
            testId="studio-map"
          />
        </Suspense>
      )}
    </div>
  );
}
