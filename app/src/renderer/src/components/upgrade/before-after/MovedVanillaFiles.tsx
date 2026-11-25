/**
 * **Minecraft changed these too** for a move's report (ADR 0136 D11, B823's part, wired by
 * B819): the change sets of the move's steps up (`vanillaFileListsOf`), the moved copy's things
 * and their lowered files on the version moved to (`elementFilesOf` over the session's
 * expanded copy and lowering), their hits (`vanillaFileHits`), and Minecraft's own two copies
 * read from the user's game files. Recomputed when the move's report is.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/plugin-api';
import { useEffect, useMemo, useState } from 'react';
import type { MoveReport } from '../../UpgradeTargetDialog';
import { thingName } from '../parts/shared';
import {
  elementFilesOf,
  type VanillaFileHit,
  VanillaFiles,
  vanillaFileHits,
  vanillaFileListsOf,
} from '../parts/VanillaFiles';
import type { UpgradeViewsHost } from './host';

/** Props of {@link MovedVanillaFiles}. */
export interface MovedVanillaFilesProps {
  readonly host: UpgradeViewsHost;
  /** The project as it is (for the things' names). */
  readonly project: Project;
  readonly move: MoveReport;
}

/** The part; nothing while it works or when no thing is touched. */
export function MovedVanillaFiles({ host, project, move }: MovedVanillaFilesProps) {
  const { from, to } = move.report;
  const lists = useMemo(
    () =>
      vanillaFileListsOf(
        (move.hops ?? [])
          .filter((hop) => hop.direction === 'up')
          .map((hop) => host.targets.find((target) => target.id === hop.to)?.changes),
      ),
    [move.hops, host.targets],
  );
  const [hits, setHits] = useState<readonly VanillaFileHit[]>([]);
  useEffect(() => {
    if (lists.length === 0) {
      setHits([]);
      return;
    }
    let live = true;
    const side = move.moved ?? project;
    const targetId = move.moved === undefined ? from.targetId : to.targetId;
    host
      .loweredElements(side, targetId)
      .then((lowered) =>
        elementFilesOf(
          lowered.expanded,
          (element) => lowered.files.get(element.id),
          (element) => thingName(project, element.id),
        ),
      )
      .then(
        (elements) => {
          if (live) setHits(vanillaFileHits(lists, elements));
        },
        () => {
          if (live) setHits([]);
        },
      );
    return () => {
      live = false;
    };
  }, [host, lists, move.moved, project, from.targetId, to.targetId]);
  return (
    <VanillaFiles
      hits={hits}
      onShow={host.onShow}
      fromVersion={from.mcVersion}
      toVersion={to.mcVersion}
      readVanillaFile={host.readVanillaAsset}
    />
  );
}
