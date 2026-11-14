/**
 * "Copy as my own script" (ADR 0082 D7 (d), Advanced mode): the changeset that takes a rule
 * book's output over as ordinary project content, as one undo step. The work is done by
 * `copyRuleBookAsScript` in `@msm/plugin-rules` (the book's generated script becomes a normal
 * `msm:script`, its generated events hand-made events on its things, and its rules are turned
 * off); this file only turns that into change items.
 *
 * @packageDocumentation
 */

import type { Element, Project, ResourceLocation } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { copyRuleBookAsScript, RULES_KIND } from '@msm/plugin-rules';
import type { ChangeItem } from '../../changeset/changeset';

/** The kind of the script the copy makes (`@msm/plugin-scripting`). */
export const SCRIPT_KIND = 'msm:script';

/** The outcome of {@link planCopyAsScript}. */
export type CopyAsScriptPlan =
  | {
      readonly ok: true;
      readonly items: ChangeItem[];
      readonly label: string;
      /** The new script, or `null` when every rule was plain (events only). */
      readonly scriptId: ResourceLocation | null;
      /** The things that got the book's events as their own. */
      readonly subjects: readonly ResourceLocation[];
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

/** Plans "Copy as my own script" for book `bookId` of `project` on `target`. */
export function planCopyAsScript(
  project: Project,
  bookId: string,
  target: TargetFacts,
): CopyAsScriptPlan {
  const elements: Element[] = project.namespaces.flatMap((namespace) => namespace.elements);
  const copy = copyRuleBookAsScript(bookId, elements, target);
  if (!copy.ok) return copy;
  const byId = new Map(elements.map((element) => [element.id as string, element]));
  const book = byId.get(bookId) as Element;
  const items: ChangeItem[] = [];
  if (copy.scriptLines !== null) {
    items.push({
      itemId: 'copy-as-script-script',
      op: 'create',
      elementId: copy.scriptId,
      kind: SCRIPT_KIND,
      after: { lines: copy.scriptLines },
      accepted: true,
      problems: [],
    });
  }
  for (const subject of copy.subjects) {
    const saved = byId.get(subject.elementId);
    if (saved === undefined) continue;
    items.push({
      itemId: `copy-as-script-subject-${subject.elementId}`,
      op: 'update',
      elementId: subject.elementId,
      kind: saved.kind,
      before: saved.data,
      after: subject.data,
      accepted: true,
      problems: [],
    });
  }
  items.push({
    itemId: 'copy-as-script-book',
    op: 'update',
    elementId: book.id,
    kind: RULES_KIND,
    before: book.data,
    after: copy.book,
    accepted: true,
    problems: [],
  });
  return {
    ok: true,
    items,
    label: `Copy ${bookId} as my own script`,
    scriptId: copy.scriptLines === null ? null : copy.scriptId,
    subjects: copy.subjects.map((subject) => subject.elementId),
    warnings: copy.warnings,
  };
}
