/**
 * The words of the upgrade report (ADR 0136 D4, D6, D15; B818): one template per kind of
 * change, detail, problem and fact, used when the change set gives no curated sentence. The
 * templates name no Minecraft version, id or registry member of their own: versions come from
 * the targets' facts, names from the report's records. Plain words first (ADR 0130 D2): ids and
 * field names are turned into words here, and shown as they are only under More options.
 *
 * Pure: no React, no session, so the After moving group of Things to fix can use it without
 * the report view's chunk.
 *
 * @packageDocumentation
 */

import type { Project, UpgradeTodoItem } from '@msm/core';
import { plainProblem, problemThingName } from '../../session/plain-problems';

/** A namespaced id (`minecraft:stone`, `#minecraft:logs`), as the plain view must never show. */
const ID_IN_TEXT = /#?\b[a-z_][a-z0-9_.-]*:([a-z0-9_.-]+\/)*([a-z0-9_.-]+)\b/g;
/** A snake_case name (`default_block`, `base_block`). */
const SNAKE = /\b([a-z0-9]+(?:_[a-z0-9]+)+)\b/g;

/**
 * `text` with every id turned into the words of its last path part (`minecraft:dripstone_block`
 * reads "dripstone block") and every snake_case name into words, for the plain view.
 *
 * @param text - A sentence that may hold ids (a curated hint, a message).
 */
export function plainText(text: string): string {
  return text
    .replace(ID_IN_TEXT, (_match, _dirs: string | undefined, last: string) => last)
    .replace(SNAKE, (name: string) => name.replaceAll('_', ' '));
}

/** Words for the last part of an id or a path (`worldgen/feature_type` reads "feature type"). */
export function wordsOf(name: string): string {
  const path = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
  const last =
    path
      .split('/')
      .filter((part) => part !== '' && !/^\d+$/.test(part) && part !== '*')
      .pop() ?? path;
  return last.replaceAll('_', ' ').replace(/^#/, '').trim() || name;
}

/**
 * The plain sentence of one After moving item (part 3 of the report): the problem table's
 * words when it knows the code, else a sentence for the kind of problem that names the thing and
 * the version moved to.
 *
 * @param item - The item.
 * @param project - The project, for the thing's display name.
 * @param mcVersion - The Minecraft version the mod moved (or would move) to.
 */
export function todoItemText(
  item: UpgradeTodoItem,
  project: Project | null,
  mcVersion: string,
): string {
  const problem = item.problem;
  const thing = problemThingName(project, problem);
  const known = plainProblem(problem, thing);
  if (known.known) return known.text;
  switch (problem.code) {
    case 'target.removed-id':
      return `${thing} uses something Minecraft ${mcVersion} no longer has.`;
    case 'target.removed-id-in-text':
      return `${thing} names something in its text that Minecraft ${mcVersion} no longer has.`;
    case 'target.field-not-moved':
      return `MCSuperMods could not move a setting of ${thing} to its new place for Minecraft ${mcVersion}.`;
    case 'target.no-migration-path':
      return `MCSuperMods cannot change ${thing} for Minecraft ${mcVersion} by itself.`;
    default:
      if (item.source === 'export') {
        return `${thing} cannot be put into a file for Minecraft ${mcVersion} as it is.`;
      }
      return problem.severity === 'error'
        ? `Something in ${thing} needs changing for Minecraft ${mcVersion}.`
        : `Something in ${thing} may need changing for Minecraft ${mcVersion}.`;
  }
}

/** The plain hint of an item ("How: …"), or `null` when the change set gives none. */
export function todoItemHint(item: UpgradeTodoItem): string | null {
  if (item.hint === undefined || item.hint.trim() === '') return null;
  const text = plainText(item.hint.trim());
  return `How: ${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`;
}
