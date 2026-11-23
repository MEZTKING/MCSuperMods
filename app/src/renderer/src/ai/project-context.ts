/**
 * The volatile project facts sent with each AI helper run and returned by `project_summary`
 * (ADR 0041 D3): target, namespaces, element counts per kind, whether an `msm:mod` element
 * exists and the pending changeset's summary. Counts describe the project as it is; the
 * pending changes are summarised separately. When the caller knows them, also the mod's name and
 * the thing that is open (ADR 0125 D6).
 *
 * @packageDocumentation
 */

import type { AiProjectContext } from '@msm/ai';
import type { ResourceLocation } from '@msm/core';
import type { PendingChangeset } from '../changeset/changeset';
import { displayNameOf, findProjectElement } from '../session/plain-problems';
import type { ProjectSession } from '../session/project-session';

/** What the app knows beside the project (ADR 0125 D6). */
export interface ProjectContextExtras {
  /** The selected element, if any: the thing "this" or "it" in a message means. */
  openId?: ResourceLocation | null;
}

/** The `msm:mod` kind: the mod metadata every Fabric mod project needs once. */
export const MOD_KIND = 'msm:mod';

/** The project context of the open project, or an empty context when none is open. */
export function projectContextOf(
  session: ProjectSession,
  changeset: PendingChangeset,
  extras: ProjectContextExtras = {},
): AiProjectContext {
  const project = session.snapshot.project;
  let targetId = project?.targets[0] ?? '';
  let mcVersion = '';
  try {
    const target = session.target;
    targetId = target.id;
    mcVersion = target.mcVersion;
  } catch {
    // No built-in target: keep the project's own id.
  }
  const kindCounts: Record<string, number> = {};
  let hasModElement = false;
  let modName: string | undefined;
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements) {
      kindCounts[element.kind] = (kindCounts[element.kind] ?? 0) + 1;
      if (element.kind === MOD_KIND && !hasModElement) {
        hasModElement = true;
        modName = displayNameOf(element);
      }
    }
  }
  const open =
    extras.openId === undefined || extras.openId === null
      ? undefined
      : findProjectElement(project ?? null, extras.openId);
  return {
    targetId,
    mcVersion,
    namespaces: (project?.namespaces ?? []).map((namespace) => namespace.name),
    kindCounts,
    hasModElement,
    pendingSummary: changeset.summary().text,
    ...(modName === undefined ? {} : { modName }),
    ...(open === undefined
      ? {}
      : { open: { id: open.id, kind: open.kind, name: displayNameOf(open) } }),
  };
}
