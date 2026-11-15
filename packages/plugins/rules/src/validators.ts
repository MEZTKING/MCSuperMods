/**
 * Project validators of `@msm/plugin-rules` (ADR 0082 D6). The compiler's checks (unknown
 * trigger, step, condition, value, place or subject of a definition trigger; a trigger the
 * subject cannot have; missing actors; caps; event id clashes; scripts on a target without
 * them: `RULES_COMPILE_CODES`) are reported once, by the project expander, which compiles every
 * book against the saved project. These validators add the checks of the book itself and of
 * vanilla subjects, which need no compilation:
 *
 * - `rules.duplicate-key` (error): two rules of a book share a key (generated ids would clash).
 * - `rules.bad-counter-name` (error): a counter name that is not 1 to 32 of `a-z`, `0-9`, `_`.
 * - `rules.duplicate-counter` (error): a counter declared twice with the same scope.
 * - `rules.undeclared-counter` (warning): a step, condition or value uses a counter the book
 *   does not declare; it starts at 0 (the editor declares counters on first use).
 * - `rules.unknown-subject` (error, one of `RULES_COMPILE_CODES`): an `any_` trigger names a
 *   block, item or mob the target and the project do not have, so the rule would never run.
 * - `rules.script-path-clash` (warning): an `msm:script` element lowers to the same file as a
 *   book's generated script (`msm/<ns>/script/rules/<book path>.ts`).
 * - `rules.unknown-hud` (error): a "Show on screen", "Hide from the screen" or "Show a number on
 *   screen" step names no `msm:hud` element of the project (the controls validators check
 *   the HUD actions of events, not rule books; B413).
 *
 * Every problem carries the book's id and an RFC 6901 pointer into it.
 */
import type { Element, Json, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { asArray, asObject, bookRules, pointer, stepList, str } from './book';
import { HUD_KIND, triggerById } from './catalogue';
import { RULES_COMPILE_CODES } from './compile';
import { RULES_KIND } from './kinds';

/** The codes only the validators report. */
export const RULES_VALIDATOR_CODES = Object.freeze({
  duplicateKey: 'rules.duplicate-key',
  badCounterName: 'rules.bad-counter-name',
  duplicateCounter: 'rules.duplicate-counter',
  undeclaredCounter: 'rules.undeclared-counter',
  scriptPathClash: 'rules.script-path-clash',
  unknownHud: 'rules.unknown-hud',
});

/**
 * Every code the rules plugin reports, from the expander (the compiler) and the validators,
 * sorted. `rules.unknown-subject` is reported by both: by the compiler for definition triggers,
 * by the validators for `any_` triggers.
 */
export const RULES_PROBLEM_CODES: readonly string[] = Object.freeze(
  [
    ...new Set([...Object.values(RULES_COMPILE_CODES), ...Object.values(RULES_VALIDATOR_CODES)]),
  ].sort(),
);

const NAME = /^[a-z0-9_]{1,32}$/;
const HUD_STEPS = new Set(['show_hud', 'hide_hud', 'set_hud']);

/** Every HUD step of a step list, nested ones included, with the pointer to its `hud`. */
function hudUses(
  owner: JsonObject,
  field: string,
  path: string,
  out: { hud: string; path: string }[],
): void {
  for (const { step, index } of stepList(owner, field)) {
    const at = pointer(path, field, index);
    const hud = str(step, 'hud');
    if (HUD_STEPS.has(str(step, 'step') ?? '') && hud !== undefined) {
      out.push({ hud, path: pointer(at, 'hud') });
    }
    hudUses(step, 'do', at, out);
    hudUses(step, 'else', at, out);
  }
}
const SCRIPT_KIND = 'msm:script';

/** The registry an `any_` trigger's subject belongs to. */
const SUBJECT_REGISTRY: Record<string, string | undefined> = {
  block: 'block',
  item: 'item',
  mob: 'entity_type',
};

const SUBJECT_WORDS: Record<string, string> = { block: 'block', item: 'item', mob: 'mob' };

/** Every counter a rule uses, with the pointer to the object naming it. */
function counterUses(
  value: Json | undefined,
  path: string,
  out: { name: string; scope: string; path: string }[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      counterUses(entry, pointer(path, index), out);
    });
    return;
  }
  const object = asObject(value);
  if (object === undefined) return;
  const name = str(object, 'counter');
  if (name !== undefined) out.push({ name, scope: str(object, 'scope') ?? 'world', path });
  for (const [key, child] of Object.entries(object)) counterUses(child, pointer(path, key), out);
}

/** The checks of one book. */
function checkBook(
  book: Element,
  has: (registry: string, id: string) => boolean,
  scriptIds: ReadonlySet<string>,
  hudIds: ReadonlySet<string>,
): Problem[] {
  const problems: Problem[] = [];
  const elementId = book.id;
  const error = (code: string, path: string, message: string): void => {
    problems.push({ severity: 'error', code, message, elementId, path });
  };
  const warning = (code: string, path: string, message: string): void => {
    problems.push({
      severity: 'warning',
      code,
      message,
      elementId,
      ...(path === '' ? {} : { path }),
    });
  };
  const data: JsonObject = asObject(book.data) ?? {};

  const declared = new Set<string>();
  asArray(data.counters).forEach((entry, index) => {
    const counter = asObject(entry);
    const name = str(counter, 'name');
    const scope = str(counter, 'scope') ?? 'world';
    if (name === undefined) return;
    const at = pointer('/counters', index, 'name');
    if (!NAME.test(name)) {
      error(
        RULES_VALIDATOR_CODES.badCounterName,
        at,
        `The counter name "${name}" can use only lower-case letters, digits and underscores (1 to 32).`,
      );
    }
    const key = `${scope}:${name}`;
    if (declared.has(key)) {
      error(
        RULES_VALIDATOR_CODES.duplicateCounter,
        at,
        `The ${scope} counter "${name}" is declared twice; remove one of them.`,
      );
    }
    declared.add(key);
  });

  const keys = new Map<string, number>();
  for (const { rule, index } of bookRules(data)) {
    const base = `/rules/${index}`;
    const key = str(rule, 'key');
    if (key !== undefined) {
      const first = keys.get(key);
      if (first === undefined) {
        keys.set(key, index);
      } else {
        error(
          RULES_VALIDATOR_CODES.duplicateKey,
          pointer(base, 'key'),
          `Rule ${index + 1} has the same key "${key}" as rule ${first + 1}; each rule needs its own key.`,
        );
      }
    }

    const uses: { name: string; scope: string; path: string }[] = [];
    counterUses(rule.only_if, pointer(base, 'only_if'), uses);
    counterUses(rule.do, pointer(base, 'do'), uses);
    const reported = new Set<string>();
    for (const use of uses) {
      const id = `${use.scope}:${use.name}`;
      if (declared.has(id) || reported.has(id)) continue;
      reported.add(id);
      warning(
        RULES_VALIDATOR_CODES.undeclaredCounter,
        pointer(use.path, 'counter'),
        `The ${use.scope} counter "${use.name}" is not in the book's counters, so it starts at 0.`,
      );
    }

    const huds: { hud: string; path: string }[] = [];
    hudUses(rule, 'do', base, huds);
    for (const use of huds) {
      if (hudIds.has(use.hud)) continue;
      error(
        RULES_VALIDATOR_CODES.unknownHud,
        use.path,
        `"${use.hud}" is not one of your HUD elements; make it first (a bar or a number on screen) or pick another.`,
      );
    }

    const when = asObject(rule.when);
    const trigger = triggerById(str(when, 'trigger') ?? '');
    const subject = str(when, 'subject');
    if (trigger === undefined || !trigger.subjectOptional || subject === undefined) continue;
    const registry = SUBJECT_REGISTRY[trigger.subject];
    if (registry === undefined || has(registry, subject)) continue;
    error(
      RULES_COMPILE_CODES.unknownSubject,
      pointer(base, 'when', 'subject'),
      `"${subject}" is not a ${SUBJECT_WORDS[trigger.subject] ?? trigger.subject} of this Minecraft version or of your project, so this rule would never run.`,
    );
  }

  const colon = elementId.indexOf(':');
  const scriptId = `${elementId.slice(0, colon)}:rules/${elementId.slice(colon + 1)}`;
  if (scriptIds.has(scriptId)) {
    warning(
      RULES_VALIDATOR_CODES.scriptPathClash,
      '',
      `The script "${scriptId}" is saved where this rule book's generated script goes; rename the script.`,
    );
  }
  return problems;
}

export const rulesBookValidator: ProjectValidator = {
  id: 'msm.rules.book',
  kinds: [RULES_KIND, SCRIPT_KIND, HUD_KIND],
  validate: ({ elements, registry }) => {
    const idsOf = (kind: string): Set<string> =>
      new Set(elements.filter((element) => element.kind === kind).map((element) => element.id));
    const scriptIds = idsOf(SCRIPT_KIND);
    const hudIds = idsOf(HUD_KIND);
    return elements
      .filter((element) => element.kind === RULES_KIND)
      .flatMap((book) => checkBook(book, (name, id) => registry.has(name, id), scriptIds, hudIds));
  },
};

/** Every validator of the plugin, in order. */
export const rulesValidators: readonly ProjectValidator[] = Object.freeze([rulesBookValidator]);
