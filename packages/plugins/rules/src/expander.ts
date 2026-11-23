/**
 * The rules plugin's project expander (ADR 0082 D3, D9; plugin API 1.15.0): compiles every
 * `msm:rules` book of the project together and returns
 *
 * - the patches to the subjects' definitions (generated events and trigger components; books
 *   sharing a subject and trigger share one event, so no path is patched twice), and
 * - one patch per book that needs a script, writing its generated lines into the book's copy at
 *   `generated_script` for the kind's lowering to turn into `msm/<ns>/script/rules/<path>.ts`
 *   (a hand-written `generated_script` in a saved book is cleared the same way),
 *
 * - one patch on the first book (in id order) with a rule on an area, a timer or a one block,
 *   writing the function bridge at `generated_signal` (ADR 0115 D5): the namespace of the signal
 *   command and every signal a rule listens to, for the kind's lowering to turn into the
 *   command, the bridge's functions and its function tags (`lowering/signal.ts`),
 *
 * plus the compiler's problems (`RULES_COMPILE_CODES`), each on its book with a pointer to the
 * rule. Books are compiled in id order, so the result does not depend on the project's order.
 */
import type {
  Element,
  ElementPatch,
  ExpansionInput,
  ExpansionResult,
  ProjectExpander,
} from '@msm/plugin-api';
import { asObject } from './book';
import { OBJECTIVE_KIND, TEAM_KIND, TRIGGERS } from './catalogue';
import { compileRuleBooks } from './compile';
import { RULES_KIND } from './kinds';
import { RULES_SCRIPT_FIELD, RULES_SIGNAL_FIELD } from './lowering';

/** The id of the rules expander. */
export const RULES_EXPANDER_ID = 'msm.rules.expand';

const byId = (a: Element, b: Element): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Expands a project's rule books (pure; the same input gives the same patches). */
export function expandRules({ elements, target }: ExpansionInput): ExpansionResult {
  const books = elements.filter((element) => element.kind === RULES_KIND).sort(byId);
  if (books.length === 0) return { patches: [], problems: [] };
  const compiled = compileRuleBooks(books, elements, target);
  const patches: ElementPatch[] = [...compiled.patches];
  for (const book of books) {
    const script = compiled.scripts.get(book.id);
    const saved = asObject(book.data)?.[RULES_SCRIPT_FIELD];
    if (script !== undefined || saved !== undefined) {
      patches.push({
        elementId: book.id,
        path: [RULES_SCRIPT_FIELD],
        value: script === undefined ? null : [...script],
        origin: { elementId: book.id, pointer: '' },
      });
    }
    const signals = compiled.signals?.host === book.id ? compiled.signals : undefined;
    const savedSignal = asObject(book.data)?.[RULES_SIGNAL_FIELD];
    if (signals === undefined && savedSignal === undefined) continue;
    patches.push({
      elementId: book.id,
      path: [RULES_SIGNAL_FIELD],
      value:
        signals === undefined
          ? null
          : {
              namespace: signals.namespace,
              signals: signals.signals.map((signal) => ({ ...signal })),
            },
      origin: { elementId: book.id, pointer: '' },
    });
  }
  return { patches, problems: compiled.problems };
}

/**
 * The kinds the expander reads: rule books, and every kind a rule's subject may be (a changed
 * block or item changes its patches too).
 */
export const RULES_EXPANDER_KINDS: readonly string[] = Object.freeze([
  RULES_KIND,
  ...[
    ...new Set([...TRIGGERS.flatMap((trigger) => trigger.subjectKinds), TEAM_KIND, OBJECTIVE_KIND]),
  ].sort(),
]);

export const rulesExpander: ProjectExpander = {
  id: RULES_EXPANDER_ID,
  kinds: RULES_EXPANDER_KINDS,
  expand: expandRules,
};
