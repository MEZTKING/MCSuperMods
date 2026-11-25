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

import type {
  Project,
  UpgradeAdditions,
  UpgradePlayerFact,
  UpgradeReport,
  UpgradeStandingCheck,
  UpgradeTodoItem,
} from '@msm/core';
import type { Json, MigrationDetail, TargetChange } from '@msm/plugin-api';
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

/**
 * The plain hint of an item ("How: …"), or `null` when the change set gives none or the item
 * before it (`previous`) is on the same thing with the same hint (said once).
 */
export function todoItemHint(
  item: UpgradeTodoItem,
  previous?: UpgradeTodoItem | undefined,
): string | null {
  if (
    previous !== undefined &&
    previous.hint === item.hint &&
    previous.problem.elementId === item.problem.elementId
  ) {
    return null;
  }
  if (item.hint === undefined || item.hint.trim() === '') return null;
  const text = plainText(item.hint.trim());
  return `How: ${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`;
}

// The report's parts ---------------------------------------------------------------------

/** "1 thing", "2 things". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Words for a camelCase or PascalCase name (`LargeSpeleothemConfig` reads "large speleothem"). */
function camelWords(name: string): string {
  return name
    .replace(/(Config|Ref)$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
    .trim();
}

/** Words for a registry (`tag/entity_type` reads "entity type tag", `texture` "picture"). */
export function registryWords(registry: string): string {
  const path = registry.includes(':') ? registry.slice(registry.indexOf(':') + 1) : registry;
  if (path.startsWith('tag/')) return `${registryWords(path.slice(4))} tag`;
  if (path === 'texture') return 'picture';
  if (path === 'sound_event') return 'sound';
  if (path === 'feature_config') return 'feature settings';
  return wordsOf(path);
}

/** Words for a field pointer (`/adult_sounds/ambient_sound` reads "ambient sound"). */
export function fieldWords(field: string | undefined): string {
  if (field === undefined || field === '' || field === '/') return 'whole';
  return wordsOf(field.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/** Words for what a change is about, without ids. */
export function subjectWords(change: TargetChange): string {
  const { subject, registry } = change;
  switch (change.area) {
    case 'commands':
      return `${subject.split(' ')[0] ?? subject} command`;
    case 'block-states':
      return `${wordsOf(subject)} block`;
    case 'packs':
    case 'players':
    case 'java':
    case 'vanilla-files':
      return wordsOf(subject);
    default:
      break;
  }
  if (subject.startsWith('::')) return camelWords(subject.split('::').pop() ?? subject);
  if (registry !== undefined && subject.startsWith(`${registry}/`)) {
    const member = subject.slice(registry.length + 1);
    const words = member.startsWith('::')
      ? camelWords(member.split('::').pop() ?? member)
      : wordsOf(member);
    // Files of a data pack folder (`minecraft:resource`): the member alone names them.
    if (registry === 'minecraft:resource') return words;
    return `${words} ${registryWords(registry)}`;
  }
  return wordsOf(subject);
}

/** A value in words: an id's name, a number, yes or no; anything bigger is "a new value". */
export function valueWords(value: Json | undefined): string {
  if (value === undefined || value === null) return 'nothing';
  if (typeof value === 'string') return plainText(value.startsWith('#') ? value.slice(1) : value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (!Array.isArray(value) && typeof value.major === 'number') {
    const minor = typeof value.minor === 'number' && value.minor !== 0 ? `.${value.minor}` : '';
    return `${value.major}${minor}`;
  }
  return 'a new value';
}

/**
 * The plain sentence of one change in Minecraft (part 1, and part 4's pack changes): the change
 * set's curated sentence when it has one (its ids turned into words), else the template for its
 * kind, filled from the change itself and the version moved to.
 *
 * @param change - The change-set entry.
 * @param mcVersion - The Minecraft version moved to.
 */
export function changeSentence(change: TargetChange, mcVersion: string): string {
  if (change.sentence !== undefined && change.sentence.trim() !== '') {
    return plainText(change.sentence.trim());
  }
  const v = mcVersion;
  const subject = subjectWords(change);
  const field = fieldWords(change.field);
  const registry = change.registry === undefined ? '' : ` ${registryWords(change.registry)}`;
  const member =
    change.registry !== undefined && change.subject.startsWith(`${change.registry}/`)
      ? wordsOf(change.subject.slice(change.registry.length + 1))
      : wordsOf(change.subject);
  switch (change.what) {
    case 'member-removed':
      return `Minecraft ${v} no longer has the ${member}${registry}.`;
    case 'member-renamed':
      return typeof change.to === 'string'
        ? `Minecraft ${v} renames the ${member}${registry} to ${wordsOf(change.to)}.`
        : `Minecraft ${v} renames the ${member}${registry}.`;
    case 'registry-moved':
      return `Minecraft ${v} keeps the ${subject} list in another place.`;
    case 'type-added':
      return `Minecraft ${v} adds a new kind of thing: ${subject}.`;
    case 'type-removed':
      return `Minecraft ${v} no longer has the ${subject}.`;
    case 'type-changed':
      return `Minecraft ${v} changes how ${subject} are written.`;
    case 'field-removed':
      return `In Minecraft ${v}, ${subject} no longer have the setting ${field}.`;
    case 'field-addedRequired':
      return `In Minecraft ${v}, ${subject} need a new setting, ${field}.`;
    case 'field-addedOptional':
      return `Minecraft ${v} adds the setting ${field} to ${subject}; it can be left out.`;
    case 'field-madeOptional':
      return `In Minecraft ${v}, the setting ${field} of ${subject} can be left out.`;
    case 'field-madeRequired':
      return `In Minecraft ${v}, ${subject} need the setting ${field}.`;
    case 'field-retyped':
      return `In Minecraft ${v}, the setting ${field} of ${subject} takes another kind of value.`;
    case 'root-removed':
      return `Minecraft ${v} no longer has the ${subject}.`;
    case 'path-removed':
      return `Minecraft ${v} drops a part of the ${subject}.`;
    case 'argument-changed':
      return `Minecraft ${v} changes what the ${subject} takes.`;
    case 'property-added':
      return `In Minecraft ${v}, the ${subject} has a new state, ${field}.`;
    case 'property-removed':
      return `In Minecraft ${v}, the ${subject} no longer has the state ${field}.`;
    case 'values-changed':
      return `In Minecraft ${v}, the state ${field} of the ${subject} takes other values.`;
    case 'default-changed':
      return `In Minecraft ${v}, the ${subject} starts with another ${field}.`;
    case 'value-changed':
      return change.from !== undefined && change.to !== undefined
        ? `Minecraft ${v} changes the ${subject} from ${valueWords(change.from)} to ${valueWords(change.to)}.`
        : `Minecraft ${v} changes the ${subject}.`;
    case 'file-changed':
      return `Minecraft ${v} changes its own file ${subject}.`;
    default:
      return `Minecraft ${v} changes ${subject}.`;
  }
}

/**
 * The plain sentence of one thing a move does inside an element (part 2): a template for the
 * step's kind, naming the setting and the value in words.
 *
 * @param detail - The step.
 * @param mcVersion - The Minecraft version moved to.
 */
export function detailSentence(detail: MigrationDetail, mcVersion: string): string {
  const v = mcVersion;
  switch (detail.op) {
    case 'drop':
      return `Its ${fieldWords(detail.path)} setting goes: Minecraft ${v} no longer has it.`;
    case 'rename-id':
      return `${capitalise(valueWords(detail.before))} becomes ${valueWords(detail.after)}, its name in Minecraft ${v}.`;
    case 'move':
      return `Its ${fieldWords(detail.from)} setting moves to ${fieldWords(detail.path)}, where Minecraft ${v} expects it.`;
    case 'set':
      return `Its ${fieldWords(detail.path)} setting is set to ${valueWords(detail.after)}, which Minecraft ${v} needs.`;
    default:
      return `MCSuperMods changes it for Minecraft ${v}.`;
  }
}

function capitalise(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** The plain label of a row of part 4 ("What your players need"). */
export const PLAYER_FACT_LABELS: Readonly<Record<UpgradePlayerFact, string>> = {
  minecraft: 'Minecraft',
  java: 'Java',
  'resource-pack-format': 'Resource pack format',
  'data-pack-format': 'Data pack format',
  'fabric-loader': 'Fabric Loader',
  'fabric-api': "Fabric's shared library mod",
  runtime: 'MCSuperMods runtime mod',
  geckolib: 'GeckoLib, for animated mobs',
  'java-project': 'Export as a Java project',
};

/** The name a row of part 4 has under More options, where it differs from the plain one. */
export const PLAYER_FACT_NAMES: Readonly<Partial<Record<UpgradePlayerFact, string>>> = {
  'fabric-api': 'Fabric API',
  runtime: 'msm_runtime',
};

/** A value of a row of part 4 in words. */
export function playerValue(fact: UpgradePlayerFact, value: string | boolean | undefined): string {
  if (value === undefined) return 'none';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (fact === 'runtime') return `for Minecraft ${value}`;
  return value;
}

/** The standing checks of part 6 (ADR 0136 D12). */
export function standingCheck(check: UpgradeStandingCheck, mcVersion: string): string {
  switch (check) {
    case 'start-game':
      return `Start Minecraft ${mcVersion} once with your mod.`;
    case 'open-world':
      return `Open or make a world. A world opened in Minecraft ${mcVersion} cannot go back to an older version, so make a copy of the world first.`;
    case 'look-at-changes':
      return 'Look at each thing named above.';
    default:
      return 'Play your mod once.';
  }
}

/** The one sentence on what the report cannot know (ADR 0136 D12). */
export function inGameLimit(mcVersion: string): string {
  return `MCSuperMods checks that your mod's files are right for Minecraft ${mcVersion}, not that the game plays the same: play it once to be sure.`;
}

/** The line on what does not touch the mod (ADR 0136 D4's seventh line). */
export function untouchedSentence(total: number, mcVersion: string): string {
  return total === 1
    ? `1 other change in Minecraft ${mcVersion} does not touch your mod, as far as MCSuperMods knows.`
    : `${total} other changes in Minecraft ${mcVersion} do not touch your mod, as far as MCSuperMods knows.`;
}

/** The one sentence of a mod nothing touches. */
export function nothingTouchesSentence(total: number, mcVersion: string): string {
  return total === 0
    ? `Nothing in your mod needs changing for Minecraft ${mcVersion}.`
    : `Nothing in your mod needs changing for Minecraft ${mcVersion}: none of the ${count(total, 'change', 'changes')} MCSuperMods knows about touches it.`;
}

/** The report's summary before a move: what changes by itself and what needs the user. */
export function moveSummary(report: UpgradeReport): string {
  const done = report.done.filter((item) => item.kind !== 'note').length;
  const todo = report.todo.length;
  if (done === 0 && todo === 0) return 'Nothing in your mod needs changing.';
  const doneText = done === 1 ? '1 thing changes by itself' : `${done} things change by themselves`;
  const todoText = todo === 1 ? '1 needs you' : `${todo} need you`;
  return `${doneText}, ${todoText}.`;
}

/** Part 5's line: how many new things, with the blocks and items counted when there are some. */
export function additionsSentence(added: UpgradeAdditions, mcVersion: string): string {
  const of = (kind: string): number => added.byKind[kind] ?? 0;
  const named = [
    of('ids:block') > 0 ? count(of('ids:block'), 'block', 'blocks') : null,
    of('ids:item') > 0 ? count(of('ids:item'), 'item', 'items') : null,
  ].filter((part): part is string => part !== null);
  const such = named.length === 0 ? '' : `, such as ${named.join(' and ')}`;
  return `Minecraft ${mcVersion} adds ${count(added.total, 'new thing', 'new things')} your mod could use${such}.`;
}

/** A date for people (`25 November 2026`), from an ISO time; the text itself when unreadable. */
export function dayOf(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return new Date(time).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The summary of a saved move. */
export function savedSummary(from: string, to: string, movedAt: string): string {
  return `Moved from Minecraft ${from} to ${to} on ${dayOf(movedAt)}.`;
}
