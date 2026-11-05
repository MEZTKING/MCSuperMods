/**
 * The volatile project facts sent with each AI helper run and returned by `project_summary`
 * (ADR 0041 D3): target, namespaces, element counts per kind, whether an `msm:mod` element
 * exists and the pending changeset's summary. Counts describe the project as it is; the
 * pending changes are summarised separately.
 *
 * @packageDocumentation
 */

import type { AiProjectContext } from '@msm/ai';
import type { PendingChangeset } from '../changeset/changeset';
import type { ProjectSession } from '../session/project-session';

/** The `msm:mod` kind: the mod metadata every Fabric mod project needs once. */
export const MOD_KIND = 'msm:mod';

/** The project context of the open project, or an empty context when none is open. */
export function projectContextOf(
  session: ProjectSession,
  changeset: PendingChangeset,
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
  for (const namespace of project?.namespaces ?? []) {
    for (const element of namespace.elements) {
      kindCounts[element.kind] = (kindCounts[element.kind] ?? 0) + 1;
      if (element.kind === MOD_KIND) hasModElement = true;
    }
  }
  return {
    targetId,
    mcVersion,
    namespaces: (project?.namespaces ?? []).map((namespace) => namespace.name),
    kindCounts,
    hasModElement,
    pendingSummary: changeset.summary().text,
  };
}
