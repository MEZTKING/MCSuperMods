/**
 * Make a Creator flow at once (ADR 0124 D7, D9; B657): the search's **Add to my mod** and
 * Surprise me ([ADR 0086](../../../../../docs/adr/0086-surprise-me-random-mod.md)) share this
 * module. {@link makeFlow} checks the answers by the wizard's own rules (a bad one is dropped
 * and the flow's default used), builds the flow, plans it with the Creator's `planCreate` (so
 * the set carries `meta.creator` and reopens in the Creator), and optionally adds one rule
 * book with the made thing as the rule's subject, or one companion flow planned against the
 * project as it would be after the first. Everything comes back as one list of change items
 * for `applyChangeset`: one undo step, labelled "Make <name>".
 *
 * Pure apart from the flows' own `build`: no DOM, no session writes.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import type {
  ContentBundle,
  ProjectStarter,
  SearchBehaviourSubject,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';
import {
  type RawValue,
  type RawValues,
  toValues,
  validateParameter,
} from '../components/wizard/wizard-model';
import {
  type ChangeItem,
  type NewChangeItem,
  planChangeItems,
  type SkippedChange,
} from './changeset';
import {
  type CreatorPlan,
  type CreatorStamp,
  creatorChanges,
  creatorValues,
  isMergeableKind,
  planCreate,
  SINGLETON_KINDS,
  skippedThings,
} from './creator-sets';

/** The rule book kind (`@msm/plugin-rules`); this module does not import the plugin. */
export const RULES_KIND = 'msm:rules';

/** The string a behaviour's rule names the made thing by (ADR 0124 D7, B655). */
export const THING_PLACEHOLDER = '$thing';

type JsonObject = { [key: string]: Json };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function elementsOf(project: Project): Element[] {
  return project.namespaces.flatMap((namespace) => namespace.elements);
}

// Answers ----------------------------------------------------------------------------------

/**
 * The editing value of one given answer, or `undefined` when its type does not fit the
 * parameter (a number for a choice, a list for a string).
 */
function rawOf(parameter: StarterParameter, value: unknown): RawValue | undefined {
  switch (parameter.type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
    case 'set':
      return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
        ? [...(value as string[])]
        : undefined;
    case 'image':
    case 'audio':
      return value === null ? '' : typeof value === 'string' ? value : undefined;
    default:
      return typeof value === 'string' ? value : undefined;
  }
}

/** Given answers in the wizard's editing form, with the ones that fail its check left out. */
export interface CheckedAnswers {
  /** The editing values of the answers that pass `validateParameter` (no defaults filled in). */
  raw: RawValues;
  /** The question ids whose answers were dropped (an unknown question, a wrong type, a failed check). */
  dropped: string[];
}

/**
 * Checks given answers (JSON, as `meta.creator.values` and the search store them) against a
 * flow's questions, one by one, by the wizard's own `validateParameter`: an answer that passes
 * is kept, any other is dropped, so the flow's default stands in for it. Nothing is invented.
 */
export function checkAnswers(
  parameters: readonly StarterParameter[] | undefined,
  values: Readonly<Record<string, unknown>>,
): CheckedAnswers {
  const raw: Record<string, RawValue> = {};
  const dropped: string[] = [];
  for (const [id, value] of Object.entries(values)) {
    const parameter = (parameters ?? []).find((entry) => entry.id === id);
    const candidate = parameter === undefined ? undefined : rawOf(parameter, value);
    if (
      parameter === undefined ||
      candidate === undefined ||
      validateParameter(parameter, candidate) !== null
    ) {
      dropped.push(id);
      continue;
    }
    raw[id] = candidate;
  }
  return { raw, dropped };
}

/** The flow's name question: the first string question whose id ends in `name`. */
export function nameParameterOf(
  parameters: readonly StarterParameter[] | undefined,
): StarterParameter | undefined {
  return (parameters ?? []).find(
    (parameter) => parameter.type === 'string' && /(^|_)name$/.test(parameter.id),
  );
}

/** The name a set of answers gives (its name answer), else the flow's title. */
export function flowName(starter: ProjectStarter, values: Readonly<Record<string, Json>>): string {
  const parameter = nameParameterOf(starter.parameters);
  const value = parameter === undefined ? undefined : values[parameter.id];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : starter.title;
}

// The made thing ---------------------------------------------------------------------------

/** Kinds that only support a flow's main thing (pack files, models, names, mod settings). */
const SUPPORTING_KINDS: ReadonlySet<string> = new Set([
  'minecraft:pack_mcmeta',
  'msm:mod',
  'minecraft:lang',
  'minecraft:model',
  'minecraft:item_definition',
  'minecraft:block_definition',
  'msm:geo_model',
  'msm:animation',
]);

/** The flow's main thing: its first element that is not a supporting file, or `undefined`. */
export function mainThing(bundle: ContentBundle): ContentBundle['elements'][number] | undefined {
  return bundle.elements.find((entry) => !SUPPORTING_KINDS.has(entry.kind));
}

/** The element kind of each sort of made thing a rule can be about (the Rules catalogue's). */
export const SUBJECT_KINDS: Readonly<Record<SearchBehaviourSubject, string>> = {
  block: 'msm:block',
  item: 'msm:item',
  mob: 'msm:entity',
  vehicle: 'msm:vehicle',
};

const SORTS = Object.keys(SUBJECT_KINDS) as SearchBehaviourSubject[];

/**
 * The made thing a rule is about: of the sorts in `appliesTo` (default: any of block, item, mob
 * and vehicle), the flow's main thing when it is of one of them, else the bundle's first element
 * of the first sort it has. `undefined` when the bundle makes nothing of those sorts.
 */
export function madeThing(
  bundle: ContentBundle,
  appliesTo: readonly SearchBehaviourSubject[] = SORTS,
): { id: ResourceLocation; kind: string; sort: SearchBehaviourSubject } | undefined {
  const sorts = appliesTo.length === 0 ? SORTS : appliesTo;
  const sortOf = (kind: string) => sorts.find((sort) => SUBJECT_KINDS[sort] === kind);
  const main = mainThing(bundle);
  const mainSort = main === undefined ? undefined : sortOf(main.kind);
  if (main !== undefined && mainSort !== undefined) {
    return { id: main.id as ResourceLocation, kind: main.kind, sort: mainSort };
  }
  for (const sort of sorts) {
    const entry = bundle.elements.find((element) => element.kind === SUBJECT_KINDS[sort]);
    if (entry !== undefined) return { id: entry.id as ResourceLocation, kind: entry.kind, sort };
  }
  return undefined;
}

/** `value` with every string that is exactly {@link THING_PLACEHOLDER} replaced by `id`. */
export function withThing(value: Json, id: string): Json {
  if (value === THING_PLACEHOLDER) return id;
  if (Array.isArray(value)) return value.map((entry) => withThing(entry, id));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, withThing(entry, id)]),
    );
  }
  return value;
}

// Planning, shared with Surprise me --------------------------------------------------------

/**
 * Whether a bundle's ids or files clash with what `project` already has. Pack and mod settings,
 * language files and tags are shared; so is an id the same flow made for another of its sets
 * (the Custom ore flow's advancement tab root, the Custom mob flow's death function), which the
 * Creator keeps as it is.
 */
export function bundleClashes(bundle: ContentBundle, project: Project, flowId?: string): boolean {
  const ids = new Map(elementsOf(project).map((element) => [element.id as string, element]));
  for (const entry of bundle.elements) {
    if (SINGLETON_KINDS.includes(entry.kind)) continue;
    const existing = ids.get(entry.id);
    if (existing === undefined) continue;
    if (existing.kind === entry.kind && isMergeableKind(entry.kind)) continue;
    if (flowId !== undefined && existing.meta.creator?.flowId === flowId) continue;
    return true;
  }
  for (const asset of bundle.assets) {
    const recorded = project.namespaces
      .find((namespace) => namespace.name === asset.namespace)
      ?.assets.some((entry) => entry.path === asset.path);
    if (recorded === true) return true;
  }
  return false;
}

/**
 * One item per element: an update of an element an earlier item creates goes into that create,
 * and two updates of one element become one (the first `before`, the last `after`). The
 * session's changeset replays its commands, so an element made by the same command cannot be
 * changed again by it.
 */
export function foldItems(items: readonly ChangeItem[]): ChangeItem[] {
  const out: ChangeItem[] = [];
  const byElement = new Map<string, number>();
  for (const item of items) {
    const id = item.elementId;
    const index = id === undefined ? undefined : byElement.get(id);
    const earlier = index === undefined ? undefined : out[index];
    if (item.op === 'update' && earlier !== undefined && index !== undefined) {
      out[index] = { ...earlier, after: item.after as Json };
      continue;
    }
    if (id !== undefined && (item.op === 'create' || item.op === 'update')) {
      byElement.set(id, out.length);
    }
    out.push(item);
  }
  return out;
}

/** New items as accepted change items `<prefix>-<n>`, numbered on from `start`. */
export function toChangeItems(
  items: readonly NewChangeItem[],
  prefix: string,
  start: number,
): ChangeItem[] {
  return items.map((item, index) => ({
    ...item,
    itemId: `${prefix}-${start + index + 1}`,
    accepted: true,
    problems: [],
  }));
}

/** The outcome of planning some items against a project. */
export interface PlannedStep {
  /** The items, numbered. */
  items: ChangeItem[];
  /** The project as it would be after them. */
  state: Project;
  /** Items that would not apply. */
  skipped: SkippedChange[];
}

/** Numbers `items` and plays them on `project`, so the next part is planned against the result. */
export function planStep(
  project: Project,
  items: readonly NewChangeItem[],
  prefix: string,
  start: number,
): PlannedStep {
  const numbered = toChangeItems(items, prefix, start);
  const planned = planChangeItems(project, structuredClone(numbered));
  return { items: numbered, state: planned.state, skipped: planned.skipped };
}

/** One flow's set planned as the Creator's Create plans it. */
export interface PlannedSet extends PlannedStep {
  plan: CreatorPlan;
}

/**
 * Plans a new set of a flow's bundle with `planCreate` (each element stamped with
 * `meta.creator`) and plays it on `project`.
 *
 * @throws Error If an element's kind is unknown.
 */
export function planSet(
  project: Project,
  bundle: ContentBundle,
  stamp: CreatorStamp,
  isKnownKind: (kind: string) => boolean,
  prefix: string,
  start: number,
): PlannedSet {
  const plan = planCreate(bundle, project, stamp, isKnownKind);
  return { plan, ...planStep(project, creatorChanges(plan).items, prefix, start) };
}

/** `base`, else `base_2` up to `base_<max>`: the first id `project` does not have, or `null`. */
export function freeId(project: Project, base: string, max = 99): ResourceLocation | null {
  const taken = new Set(elementsOf(project).map((element) => element.id as string));
  if (!taken.has(base)) return base as ResourceLocation;
  for (let number = 2; number <= max; number += 1) {
    const id = `${base}_${number}`;
    if (!taken.has(id)) return id as ResourceLocation;
  }
  return null;
}

/** The data of a rule book holding `rules`, as the Rule book stores it. */
export function ruleBookData(rules: readonly Json[]): Json {
  return { counters: [], format: 1, rules: [...rules] };
}

/** The `create` item of a rule book (no `meta.creator`: the book is not part of any set). */
export function ruleBookItem(id: ResourceLocation, rules: readonly Json[]): NewChangeItem {
  return { op: 'create', elementId: id, kind: RULES_KIND, after: ruleBookData(rules) };
}

// makeFlow ---------------------------------------------------------------------------------

/** What {@link makeFlow} needs of the project session. */
export interface MakeFlowSession {
  library: { starters: readonly ProjectStarter[] };
  target: TargetFacts;
  registry: { get(kind: string): unknown };
}

/** A companion flow made beside the first (ADR 0124 D7: "sets mobs on fire"). */
export interface MakeFlowBeside {
  /** The companion flow's starter id. */
  starter: string;
  /** Its answers by question id; each is checked as the first flow's are. */
  values: Readonly<Record<string, Json>>;
}

interface MakeFlowBase {
  /** The Creator flow (a starter with `creator`). */
  flowId: string;
  /** Answers by question id; each must pass the wizard's check, or it is dropped. */
  values: Readonly<Record<string, Json>>;
  /** The namespace the things go in (default: the project's first own namespace). */
  namespace?: string;
  /** A new Creator set id per flow made (default `crypto.randomUUID`). */
  newSetId?(): string;
}

/** What to make: one flow, and at most one rule book or one companion flow beside it. */
export type MakeFlowRequest = MakeFlowBase &
  (
    | {
        /**
         * One `msm:rules` rule as the rule book stores it, the string `$thing` standing for
         * the made thing's id wherever it appears (`when.subject`, `take_item.item`, ...).
         */
        rule?: Json;
        /** The sorts of thing the rule is about (a behaviour's `appliesTo`); default any. */
        appliesTo?: readonly SearchBehaviourSubject[];
        beside?: never;
      }
    | { beside?: MakeFlowBeside; rule?: never; appliesTo?: never }
  );

/** One flow of a {@link MakeFlowResult}. */
export interface MadeFlow {
  flowId: string;
  /** The flow's title ("Weapon"). */
  title: string;
  /** Its name answer, else the title ("Blue Sword"). */
  name: string;
  /** The answers the flow was built with (defaults for the dropped and missing ones). */
  values: Record<string, Json>;
  /** Question ids whose given answers failed the check and were dropped. */
  dropped: string[];
  bundle: ContentBundle;
  /** The set id stamped in `meta.creator`. */
  setId: string;
  /** Names of things not made because the project already has their ids. */
  skippedNames: string[];
}

/** What {@link makeFlow} returns. */
export interface MakeFlowResult {
  /** The first flow. */
  made: MadeFlow;
  /** The companion flow, when one was asked for and could be made. */
  beside: MadeFlow | null;
  /** The rule book, when a rule was asked for and could be added. */
  rule: { bookId: ResourceLocation; subject: ResourceLocation; key: string | null } | null;
  /** Why a part that was asked for was left out, in plain words. */
  notes: string[];
  /** Every change, in order and folded, for `applyChangeset` as one undo step. */
  items: ChangeItem[];
  /** The undo label: "Make <name>". */
  label: string;
}

/** The project's first own namespace (not `minecraft`). */
function firstNamespace(project: Project): string {
  return project.namespaces.find((entry) => entry.name !== 'minecraft')?.name ?? 'minecraft';
}

/** A usable flow by id, or an error that says why not. */
function usableFlow(session: MakeFlowSession, id: string): ProjectStarter {
  const starter = session.library.starters.find((entry) => entry.id === id);
  if (starter === undefined) throw new Error(`There is no flow ${JSON.stringify(id)}.`);
  if (starter.supports !== undefined && !starter.supports(session.target)) {
    throw new Error(
      `${starter.title} is not available for Minecraft ${session.target.mcVersion} (this project's target).`,
    );
  }
  const missing = starter.requiresKinds.find((kind) => session.registry.get(kind) === undefined);
  if (missing !== undefined) {
    throw new Error(`${starter.title} needs ${missing}, which no loaded plugin provides.`);
  }
  return starter;
}

/** Builds one flow with checked answers. */
async function buildFlow(
  starter: ProjectStarter,
  given: Readonly<Record<string, Json>>,
  namespace: string,
  project: Project,
  target: TargetFacts,
): Promise<{ values: Record<string, Json>; dropped: string[]; bundle: ContentBundle }> {
  const checked = checkAnswers(starter.parameters, given);
  const values = toValues(starter.parameters, checked.raw) as Record<string, Json>;
  const bundle = await starter.build({ namespace, projectName: project.name, target, values });
  return { values, dropped: checked.dropped, bundle };
}

/** Whether a plan made the element `id` (its entry is a create, not a conflict). */
function planMakes(plan: CreatorPlan, id: string): boolean {
  return plan.entries.some((entry) => entry.key === id && entry.status === 'create');
}

/**
 * Makes a Creator flow at once with the given answers, and optionally one rule book on the
 * made thing or one companion flow: the search's **Add to my mod** (ADR 0124 D9). The result's
 * `items` go to `applyChangeset(items, label)` as one undo step, "Make <name>"; every set
 * carries `meta.creator`, so **Edit in Creator** reopens it.
 *
 * - Answers: each checked by the wizard's `validateParameter`; a bad one is dropped (listed in
 *   `dropped`) and the flow's default used.
 * - Clashes: ids the project already has are skipped, as the Creator skips them
 *   (`skippedNames`); shared language files and tags are merged.
 * - The rule: put in a new rule book `<namespace>:<thing>_rules` (`_rules_2` and on when that id
 *   is taken), with `$thing` replaced by the made thing's id everywhere in it. Left out, with a
 *   note, when the rules kind is not registered, the flow makes no thing of the rule's sorts,
 *   or the project already had the thing (it was skipped, not made).
 * - The companion: planned against the project as it would be after the first flow, with its
 *   own set id.
 *
 * @throws Error If the flow (or the companion) is unknown, unavailable on the target, or its
 *   build fails.
 */
export async function makeFlow(
  session: MakeFlowSession,
  project: Project,
  request: MakeFlowRequest,
): Promise<MakeFlowResult> {
  const namespace = request.namespace ?? firstNamespace(project);
  const isKnownKind = (kind: string) => session.registry.get(kind) !== undefined;
  const newSetId = request.newSetId ?? (() => crypto.randomUUID());
  const notes: string[] = [];
  const items: ChangeItem[] = [];

  const makeOne = async (
    starter: ProjectStarter,
    given: Readonly<Record<string, Json>>,
    against: Project,
  ): Promise<{ made: MadeFlow; set: PlannedSet }> => {
    const built = await buildFlow(starter, given, namespace, against, session.target);
    const setId = newSetId();
    const set = planSet(
      against,
      built.bundle,
      { flowId: starter.id, setId, values: creatorValues(built.values) },
      isKnownKind,
      'make',
      items.length,
    );
    return {
      set,
      made: {
        flowId: starter.id,
        title: starter.title,
        name: flowName(starter, built.values),
        values: built.values,
        dropped: built.dropped,
        bundle: built.bundle,
        setId,
        skippedNames: skippedThings(set.plan).map((thing) => thing.name),
      },
    };
  };

  const starter = usableFlow(session, request.flowId);
  const first = await makeOne(starter, request.values, project);
  items.push(...first.set.items);
  let virtual = first.set.state;

  let beside: MadeFlow | null = null;
  if (request.beside !== undefined) {
    const companion = usableFlow(session, request.beside.starter);
    const second = await makeOne(companion, request.beside.values, virtual);
    items.push(...second.set.items);
    virtual = second.set.state;
    beside = second.made;
  }

  let rule: MakeFlowResult['rule'] = null;
  if (request.rule !== undefined) {
    const thing = madeThing(first.made.bundle, request.appliesTo);
    if (!isKnownKind(RULES_KIND)) {
      notes.push('The rule was left out: no loaded plugin provides rule books.');
    } else if (thing === undefined) {
      notes.push(`The rule was left out: ${first.made.name} has nothing the rule can be about.`);
    } else if (!planMakes(first.set.plan, thing.id)) {
      notes.push(
        `The rule was left out: your mod already has ${first.made.name}, so it was not made again.`,
      );
    } else {
      const colon = thing.id.indexOf(':');
      const bookId = freeId(
        virtual,
        `${thing.id.slice(0, colon)}:${thing.id.slice(colon + 1).replaceAll('/', '_')}_rules`,
      );
      if (bookId === null) {
        notes.push('The rule was left out: every rule book name for it is taken.');
      } else {
        const ruleData = withThing(request.rule, thing.id);
        const step = planStep(virtual, [ruleBookItem(bookId, [ruleData])], 'make', items.length);
        if (step.skipped.length > 0) {
          notes.push(`The rule was left out: ${step.skipped[0]?.reason ?? 'it does not fit.'}`);
        } else {
          items.push(...step.items);
          virtual = step.state;
          const key = isObject(ruleData) && typeof ruleData.key === 'string' ? ruleData.key : null;
          rule = { bookId, subject: thing.id, key };
        }
      }
    }
  }

  return {
    made: first.made,
    beside,
    rule,
    notes,
    items: foldItems(items),
    label: `Make ${first.made.name}`,
  };
}
