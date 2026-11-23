/**
 * The live world map outside the preview panel (ADR 0119 D7, D11; B587): the Creator's world and
 * dimension flows and the worldgen Studios' **See it on the map**. A lazy chunk of its own.
 *
 * - **From memory.** Neither the Creator nor a Studio holds the project session, so each has a
 *   session of its own here ({@link MemoryWorldgenSession}): the project as the caller shows it
 *   (the Creator's bundle laid over the project, never written to disk; ADR 0118's
 *   `preview/bundle-source.ts` pattern), the target, and the built-in plugins' kinds to lower
 *   it with. Each has its own `TerrainFiles` and worker client ({@link memoryTerrain}), so it
 *   never pushes the preview panel's or Try it's world out of their worker (one world a worker).
 * - **Live.** A new project is handed on at once; `TerrainFiles` lowers what changed 150 ms after
 *   the last change and the map redraws, coarse first, as in the preview panel.
 * - **Element or host.** `element` draws the element's own map view (a world preset or a
 *   dimension, a biome lit in its worlds). `host` draws a world of the project that uses the
 *   element (a placed feature, a tree, a dimension type), with a **Seen in** choice when there
 *   are several, or says that no world of the project uses it yet.
 * - The map keeps its Preview tag, notes and set-up banner (`WorldMap.tsx`); the seed and place
 *   are the project's view, shared with the preview panel and Try it.
 */

import { ElementKindRegistry, registerPlugin } from '@msm/core';
import type { Element, Project, Target } from '@msm/plugin-api';
import { useEffect, useId, useMemo, useState } from 'react';
import { inputClass } from '../forms';
import { builtInPlugins } from '../plugins/built-in';
import { usePlain } from '../studios/plain';
import { plainWorldLabel } from '../studios/plain-things';
import type { WorldgenKindLike, WorldgenSession } from './files';
import { hostsFor, type TerrainHost, withNamespace } from './hosts';
import { useTerrainSnapshot } from './views';
import WorldMap, { createTerrainSession, type TerrainSessionHandle } from './WorldMap';

// --- A session from memory ------------------------------------------------------------------

type Listener = (snapshot: { readonly project: Project | null }) => void;

/** A {@link WorldgenSession} over a project held in memory; {@link set} hands on a new one. */
export class MemoryWorldgenSession implements WorldgenSession {
  snapshot: { readonly project: Project | null };
  target: Target;
  readonly registry: { get(kind: string): WorldgenKindLike | undefined };
  readonly #listeners = new Set<Listener>();

  constructor(
    project: Project | null,
    target: Target,
    registry: { get(kind: string): WorldgenKindLike | undefined },
  ) {
    this.snapshot = { project };
    this.target = target;
    this.registry = registry;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Hands on `project` (and `target`) when either changed. */
  set(project: Project | null, target: Target): void {
    if (project === this.snapshot.project && target === this.target) return;
    this.snapshot = { project };
    this.target = target;
    for (const listener of this.#listeners) listener(this.snapshot);
  }
}

let builtInRegistry: ElementKindRegistry | null = null;

/** The built-in plugins' kinds (worldgen kinds are all built in), registered once. */
export function builtInKinds(): ElementKindRegistry {
  if (builtInRegistry === null) {
    const registry = new ElementKindRegistry();
    for (const plugin of builtInPlugins) registerPlugin(registry, plugin);
    builtInRegistry = registry;
  }
  return builtInRegistry;
}

/** Whose map it is: one session and one worker each. */
export type MemoryMapOwner = 'creator' | 'studio';

const memory = new Map<
  MemoryMapOwner,
  { session: MemoryWorldgenSession; handle: TerrainSessionHandle }
>();

/** The owner's session and terrain handle, made on first use with `project`. */
export function memoryTerrain(
  owner: MemoryMapOwner,
  project: Project,
  target: Target,
): { session: MemoryWorldgenSession; handle: TerrainSessionHandle } {
  let entry = memory.get(owner);
  if (entry === undefined) {
    const session = new MemoryWorldgenSession(project, target, builtInKinds());
    entry = { session, handle: createTerrainSession(session) };
    memory.set(owner, entry);
  }
  return entry;
}

// --- Worlds that use an element ---------------------------------------------------------------

/** The project element that makes a host's world (a dimension or a world preset), if any. */
export function hostElement(project: Project, host: TerrainHost): Element | null {
  const source = host.source;
  const wanted =
    'preset' in source
      ? { kind: 'minecraft:worldgen/world_preset', id: withNamespace(source.preset) }
      : { kind: 'minecraft:dimension', id: withNamespace(source.dimension) };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === wanted.kind && withNamespace(element.id) === wanted.id) return element;
    }
  }
  return null;
}

/** The project's worlds that use `element` (no plain worlds), as the map's Seen in finds them. */
export function projectHosts(
  element: Pick<Element, 'kind' | 'id' | 'data'>,
  files: Parameters<typeof hostsFor>[1],
): TerrainHost[] {
  return hostsFor(element, files, null).filter((host) => !host.plain);
}

// --- The view ---------------------------------------------------------------------------------

/** Props of {@link LiveMap}. */
export interface LiveMapProps {
  readonly owner: MemoryMapOwner;
  /** The project as the caller shows it (the Creator's bundle laid over it). */
  readonly project: Project;
  readonly target: Target;
  /** The element drawn (`element`) or whose worlds are drawn (`host`). */
  readonly element: Element;
  readonly mode: 'element' | 'host';
  /** The project's folder (the view's key), or `null` before it is saved. */
  readonly root: string | null;
  readonly vanillaReady: boolean;
  onSetup(): void;
  /** Called with the key of the project world shown (`dimension:<id>`, `preset:<id>:<dim>`). */
  onHost?(key: string | null): void;
  /** Test ids start with this. */
  readonly testId: string;
  /** Test hook: the terrain handle (default: the owner's, {@link memoryTerrain}). */
  readonly terrain?: TerrainSessionHandle;
}

/** The live map of an element or of a world that uses it; see the module comment. */
export default function LiveMap(props: LiveMapProps) {
  const { project, target, owner, onHost } = props;
  // Very easy names the worlds, never their ids (ADR 0083 D3).
  const veryEasy = usePlain();
  // The owner's session is made once; later projects go through `set` below.
  const [own] = useState(() =>
    props.terrain === undefined ? memoryTerrain(owner, project, target) : null,
  );
  useEffect(() => {
    own?.session.set(project, target);
  }, [own, project, target]);
  const terrain = props.terrain ?? (own?.handle as TerrainSessionHandle);
  const session = own?.session ?? (undefined as unknown as WorldgenSession);
  const { state } = useTerrainSnapshot(terrain);

  const hosts = useMemo(
    () => (state === null ? [] : projectHosts(props.element, state.project)),
    [props.element, state],
  );
  const [hostKey, setHostKey] = useState<string | null>(null);
  const host = hosts.find((entry) => entry.key === hostKey) ?? hosts[0];
  const shownKey = host?.key ?? null;
  useEffect(() => {
    onHost?.(shownKey);
  }, [onHost, shownKey]);
  const seenInId = useId();

  const map = (element: Element) => (
    <WorldMap
      session={session}
      terrain={terrain}
      root={props.root}
      project={project}
      element={element}
      vanillaReady={props.vanillaReady}
      onSetup={props.onSetup}
      walkIn={false}
    />
  );

  if (props.mode === 'element') {
    return <div data-testid={props.testId}>{map(props.element)}</div>;
  }
  if (state === null) {
    return (
      <p className="text-xs text-muted" data-testid={`${props.testId}-loading`}>
        Drawing…
      </p>
    );
  }
  const world = host === undefined ? null : hostElement(project, host);
  if (host === undefined || world === null) {
    return (
      <p className="text-sm text-muted" data-testid={`${props.testId}-none`}>
        No world of yours uses this yet. Use it in a world of your own (a biome of a dimension or a
        world type) to see it on the map; the Preview shows it on its own.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid={props.testId}>
      {hosts.length > 1 && (
        <label className="flex items-center gap-2 text-sm" htmlFor={seenInId}>
          Seen in
          <select
            id={seenInId}
            className={inputClass}
            value={host.key}
            data-testid={`${props.testId}-seen-in`}
            onChange={(event) => setHostKey(event.target.value)}
          >
            {hosts.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {veryEasy ? plainWorldLabel(project, entry.label) : entry.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {map(world)}
    </div>
  );
}
