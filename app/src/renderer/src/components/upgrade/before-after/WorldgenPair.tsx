/**
 * A world generation thing before and after a move (ADR 0136 D13, B819), a lazy chunk of its
 * own: the live world map of the moved copy on the new version, with the project as it is on
 * its own version in the compare view's place ("Before the move"). A density function, a noise,
 * a feature or a carver has no map from above, so its two views (a Value map, a Scatter, the
 * carver's line) stand side by side instead.
 *
 * Each side is a world of its own: a session held in memory (`MemoryWorldgenSession`) over the
 * project or the copy and its target, with its own files and worker, made once and kept, as
 * the Creator's and the Studios' maps are. Only one pair is open at a time, so two workers do.
 * Minecraft's own land files are read for each side's version from the user's own jar.
 *
 * @packageDocumentation
 */

import type { Element, Project, Target } from '@msm/plugin-api';
import { useEffect, useMemo, useState } from 'react';
import type { WorldgenKindLike, WorldgenSession } from '../../../terrain/files';
import { folderOfKind } from '../../../terrain/hosts';
import { MemoryWorldgenSession } from '../../../terrain/LiveMap';
import WorldMap, {
  createTerrainSession,
  SCATTER_FOLDERS,
  type TerrainSessionHandle,
  VALUE_FOLDERS,
} from '../../../terrain/WorldMap';
import { PairLayout } from './PairLayout';

/** The two sides' sessions and handles. */
export interface WorldgenSides {
  readonly before: { session: WorldgenSession; terrain: TerrainSessionHandle };
  readonly after: { session: WorldgenSession; terrain: TerrainSessionHandle };
}

let kept: {
  registry: { get(kind: string): WorldgenKindLike | undefined };
  before: { session: MemoryWorldgenSession; terrain: TerrainSessionHandle };
  after: { session: MemoryWorldgenSession; terrain: TerrainSessionHandle };
} | null = null;

/** The two sides over `project` and `moved`, made on first use and then handed the new ones. */
function sidesFor(
  registry: { get(kind: string): WorldgenKindLike | undefined },
  project: Project,
  from: Target,
  moved: Project,
  to: Target,
): WorldgenSides {
  if (kept !== null && kept.registry !== registry) {
    // Another project session: its kinds lower the files, so the sides are made again.
    for (const side of [kept.before, kept.after]) {
      side.terrain.files.dispose();
      side.terrain.client.dispose();
    }
    kept = null;
  }
  if (kept === null) {
    const before = new MemoryWorldgenSession(project, from, registry);
    const after = new MemoryWorldgenSession(moved, to, registry);
    kept = {
      registry,
      before: { session: before, terrain: createTerrainSession(before) },
      after: { session: after, terrain: createTerrainSession(after) },
    };
  }
  return kept;
}

/** Props of {@link WorldgenPair}. */
export interface WorldgenPairProps {
  readonly registry: { get(kind: string): WorldgenKindLike | undefined };
  /** The project as it is, on its target. */
  readonly project: Project;
  readonly from: Target;
  /** The moved copy, on the target it moves to. */
  readonly moved: Project;
  readonly to: Target;
  /** The thing before and after the move. */
  readonly before: Element;
  readonly after: Element;
  readonly beforeLabel: string;
  readonly afterLabel: string;
  /** The line said under the before world. */
  readonly beforeNote: string;
  /** Whether the user's Minecraft files of the version moved to are set up. */
  readonly vanillaReady: boolean;
  readonly root: string | null;
  onSetup(): void;
  /** Test hook: the sides' sessions and handles. */
  readonly sides?: WorldgenSides;
  /** Test hook: the layout of two views side by side. */
  readonly layout?: 'wide' | 'narrow';
}

/** The pair; see the module comment. */
export default function WorldgenPair(props: WorldgenPairProps) {
  const { registry, project, from, moved, to } = props;
  const [own] = useState(() =>
    props.sides === undefined ? sidesFor(registry, project, from, moved, to) : null,
  );
  const sides = props.sides ?? (own as WorldgenSides);
  useEffect(() => {
    if (own === null || kept === null) return;
    kept.before.session.set(project, from);
    kept.after.session.set(moved, to);
  }, [own, project, from, moved, to]);
  const folder = folderOfKind(props.after.kind);
  const apart = useMemo(
    () => VALUE_FOLDERS.has(folder) || SCATTER_FOLDERS.has(folder) || folder === 'worldgen/carver',
    [folder],
  );
  if (apart) {
    return (
      <PairLayout
        beforeLabel={props.beforeLabel}
        afterLabel={props.afterLabel}
        {...(props.layout === undefined ? {} : { layout: props.layout })}
        before={
          <WorldMap
            session={sides.before.session}
            terrain={sides.before.terrain}
            root={props.root}
            project={project}
            element={props.before}
            vanillaReady={props.vanillaReady}
            onSetup={props.onSetup}
            walkIn={false}
          />
        }
        after={
          <WorldMap
            session={sides.after.session}
            terrain={sides.after.terrain}
            root={props.root}
            project={moved}
            element={props.after}
            vanillaReady={props.vanillaReady}
            onSetup={props.onSetup}
            walkIn={false}
          />
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-1" data-testid="upgrade-pair-map">
      <p className="font-medium text-xs">{props.afterLabel}</p>
      <WorldMap
        session={sides.after.session}
        terrain={sides.after.terrain}
        root={props.root}
        project={moved}
        element={props.after}
        vanillaReady={props.vanillaReady}
        onSetup={props.onSetup}
        walkIn={false}
        compareWith={{
          label: 'Before the move',
          terrain: sides.before.terrain,
          note: props.beforeNote,
        }}
      />
    </div>
  );
}
