/**
 * Turns a search result's button into work (ADR 0124 D9's table; B664). The panel calls
 * `onAction(hit, which, { name }?)` with an action key (`wording.ts` `SearchActionKey`); the
 * doors (B667) hand it to {@link runSearchAction} with the app's {@link SearchActionHost}.
 *
 * - **Make this** (a flow): the Creator on a new set with the understood answers.
 * - **Add to my mod** (a flow): made at once through `makeFlow`, with a behaviour's answers, its
 *   rule (in a new rule book on the made thing) or its companion flow; one undo step
 *   "Make <name>". A starter or an example: `addBundle`, one undo step. A template: an element
 *   with the typed name, one undo step "Add <name>".
 * - **Start a mod with this**: no mod open, a new mod is asked for by name (as the Showcase asks)
 *   and made from the starter or example; a flow or template is then added to it.
 * - **Make something with it** (a vanilla id): the flows that take it, already answered
 *   (`vanilla-uses.ts`), one chosen, the Creator opened.
 * - **Add this rule**: a new rule in the mod's rule book (or a new one) that starts with the
 *   trigger or holds the step (`studios/rules/add-rule.ts`), the subject asked for when the
 *   trigger needs one; one undo step, then the Rule book on it.
 * - **Fix it**: the plain fix of a Thing to fix (a step removed: one undo step; a picture: the
 *   painter); **Show me** shows it.
 * - The rest open something through the host (an element, Settings at a line, the guide at a
 *   heading, a command, a Home tile).
 *
 * With no mod open, every action that makes something asks for the mod first. Every chosen
 * result is remembered (`host.rememberChoice`). Nothing is written before the action.
 *
 * Not a run-time importer of `@msm/search` (its types only), so the engine stays in the worker.
 *
 * @packageDocumentation
 */

import type { Element, Json, Problem, Project, ResourceLocation } from '@msm/core';
import type {
  ExampleProject,
  PluginSearchData,
  ProjectStarter,
  SearchBehaviour,
  SearchBehaviourSubject,
} from '@msm/plugin-api';
import type { SearchHit } from '@msm/search';
import {
  checkAnswers,
  freeId,
  type MakeFlowRequest,
  type MakeFlowResult,
  madeThing,
  makeFlow,
  RULES_KIND,
  THING_PLACEHOLDER,
} from '../changeset/make-flow';
import { toValues } from '../components/wizard/wizard-model';
import {
  displayNameOf,
  PLAIN_PROBLEMS,
  removeAtPointer,
  stepPointerOf,
} from '../session/plain-problems';
import type { ContentBundleBuilder } from '../session/project-session';
import {
  partLabel,
  planAddRule,
  type RulePartSort,
  subjectChoices,
  subjectNeed,
  triggerForPart,
} from '../studios/rules/add-rule';
import { templateContext, templateElementId, templatesFor } from '../studios/templates';
import { addWish } from '../wishlist/wishlist';
import type {
  SearchActionHost,
  SearchActionOutcome,
  SearchActionSession,
  SearchMakeChoice,
} from './actions';
import { gatherSearchData } from './plugin-data';
import { sortOfStarter } from './sources/flows';
import { actionOf, NOT_ON_TARGET, type SearchActionDescriptor } from './sources/shared';
import { vanillaUses } from './vanilla-uses';
import type { SearchActionKey } from './wording';

/** What `onAction` may carry besides the key (the panel's `SearchActionOptions`). */
export interface RunActionOptions {
  /** The name typed for a template. */
  readonly name?: string;
}

/** The undo label of a template's element. */
export const templateLabel = (name: string): string => `Add ${name}`;

/** The line after something was made at once (plan "Very easy wording"). */
export const MADE_LINE = 'Undo takes it back.';

const opened: SearchActionOutcome = Object.freeze({ status: 'opened' });
const cancelled: SearchActionOutcome = Object.freeze({ status: 'cancelled' });

function failed(host: SearchActionHost, message: string): SearchActionOutcome {
  host.notify({ kind: 'error', text: message });
  return { status: 'failed', message };
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const projectOf = (session: SearchActionSession): Project | null => session.snapshot.project;

const elementsOf = (project: Project): Element[] =>
  project.namespaces.flatMap((namespace) => namespace.elements);

/** The project's first own namespace (not `minecraft`), or undefined. */
export function ownNamespace(project: Project): string | undefined {
  return project.namespaces.find((entry) => entry.name !== 'minecraft')?.name;
}

/** Title case of plain words ("blue sword" reads "Blue Sword"). */
const titleCase = (text: string): string =>
  text
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * The name offered for a new mod when none is open (as the Showcase offers "Elm Mod"): the typed
 * name or the name answer, else the result's title, with "Mod" after it.
 */
export function modNameFor(hit: SearchHit, typed?: string): string {
  const answers = hit.answers ?? {};
  const named = Object.entries(answers).find(
    ([id, value]) => /(^|_)name$/.test(id) && typeof value === 'string' && value.trim() !== '',
  )?.[1] as string | undefined;
  const base = titleCase((typed ?? named ?? hit.entry.title).replace(/[^\p{L}\p{N} ]+/gu, ' '))
    .split(' ')
    .slice(0, 4)
    .join(' ');
  if (base === '') return 'My Mod';
  return /\bmod$/i.test(base) ? base : `${base} Mod`;
}

/** Asks for a mod when none is open; `true` once one is open. */
async function ensureMod(host: SearchActionHost, hit: SearchHit, typed?: string): Promise<boolean> {
  if (projectOf(host.session) !== null) return true;
  const made = await host.startMod({ name: modNameFor(hit, typed) });
  return made && projectOf(host.session) !== null;
}

// Behaviours --------------------------------------------------------------------------------

/** How a behaviour fits a flow (the engine's `behaviourFit`, B659, repeated: no run-time import). */
type Fit = 'flow' | 'answers' | 'rule' | 'beside';

function fitOf(behaviour: SearchBehaviour, starter: string, sort: string | undefined): Fit | null {
  if (Array.isArray(behaviour.flows) && behaviour.flows.includes(starter)) return 'flow';
  const answers = behaviour.answers?.[starter];
  if (typeof answers === 'object' && answers !== null) return 'answers';
  if (sort === undefined || !Array.isArray(behaviour.appliesTo)) return null;
  if (!(behaviour.appliesTo as readonly string[]).includes(sort)) return null;
  if (behaviour.rule !== undefined) return 'rule';
  if (behaviour.beside !== undefined) return 'beside';
  return null;
}

/** The plugins' data, in plugin order. */
async function searchDataOf(host: SearchActionHost): Promise<PluginSearchData[]> {
  return (await gatherSearchData(host.plugins())).map((entry) => entry.data);
}

/** The behaviour of a hit (the first plugin's with its id) and how it fits the flow. */
async function behaviourOf(
  host: SearchActionHost,
  hit: SearchHit,
  starter: ProjectStarter,
): Promise<{ behaviour: SearchBehaviour; fit: Fit } | null> {
  const id = hit.behaviour?.id;
  if (id === undefined) return null;
  for (const data of await searchDataOf(host)) {
    const behaviour = data.behaviours?.find((entry) => entry.id === id);
    if (behaviour === undefined) continue;
    const fit = fitOf(behaviour, starter.id, sortOfStarter(starter));
    return fit === null ? null : { behaviour, fit };
  }
  return null;
}

/** `value` with `$thing` replaced by `id` in every string (the engine's `replaceThing`). */
export function replaceThing(value: Json, id: string): Json {
  if (typeof value === 'string') return value.split(THING_PLACEHOLDER).join(id);
  if (Array.isArray(value)) return value.map((entry) => replaceThing(entry, id));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceThing(entry as Json, id)]),
    );
  }
  return value;
}

const holdsThing = (value: unknown): boolean =>
  JSON.stringify(value ?? null).includes(THING_PLACEHOLDER);

// Flows -------------------------------------------------------------------------------------

function starterById(session: SearchActionSession, id: string): ProjectStarter | undefined {
  return session.library.starters.find((entry) => entry.id === id);
}

/** The answers of a flow result: the entry's, then the understood ones. */
function answersOf(
  descriptor: { readonly values?: Readonly<Record<string, Json>> },
  hit: SearchHit,
): Record<string, Json> {
  return { ...(descriptor.values ?? {}), ...(hit.answers ?? {}) };
}

/** "Filled in from your words: the name, the colour." */
export function filledNote(
  starter: ProjectStarter,
  values: Readonly<Record<string, Json>>,
  extra?: string,
): string | undefined {
  const labels = (starter.parameters ?? [])
    .filter((parameter) => values[parameter.id] !== undefined)
    .map((parameter) => `the ${parameter.label.toLowerCase()}`);
  const lines: string[] = [];
  if (labels.length > 0) lines.push(`Filled in from your words: ${labels.join(', ')}.`);
  if (extra !== undefined) lines.push(extra);
  return lines.length === 0 ? undefined : lines.join(' ');
}

/** **Make this**: the Creator on the flow with the answers (and a behaviour's answers). */
async function makeThis(
  host: SearchActionHost,
  hit: SearchHit,
  descriptor: Extract<SearchActionDescriptor, { type: 'flow' }>,
): Promise<SearchActionOutcome> {
  const starter = starterById(host.session, descriptor.starter);
  if (starter?.creator === undefined)
    return failed(host, `There is no flow ${descriptor.starter}.`);
  if (!(await ensureMod(host, hit))) return cancelled;
  let values = answersOf(descriptor, hit);
  const behaviour = await behaviourOf(host, hit, starter);
  let extra: string | undefined;
  if (behaviour?.fit === 'answers') {
    values = { ...values, ...(behaviour.behaviour.answers?.[starter.id] as Record<string, Json>) };
  } else if (behaviour?.fit === 'rule' || behaviour?.fit === 'beside') {
    extra = `"${behaviour.behaviour.sentence}" is added by Add to my mod, not here.`;
  }
  // Only answers the questions take reach the Creator (it checks them again).
  const kept = checkAnswers(starter.parameters, values).raw;
  const checked = Object.fromEntries(
    Object.keys(kept).map((id) => [id, values[id] as Json]),
  ) as Record<string, Json>;
  const note = filledNote(starter, checked, extra);
  host.openCreator({
    flowId: starter.id,
    values: checked,
    ...(note !== undefined ? { note } : {}),
  });
  return opened;
}

/** The plain lines after a make. */
function madeLines(result: MakeFlowResult, starter: ProjectStarter): string {
  const lines = [`Made ${result.made.name}.`];
  if (result.beside !== null) lines.push(`Also made ${result.beside.name}.`);
  if (result.rule !== null) lines.push('Its rule is in the Rule book.');
  if (result.made.dropped.length > 0) {
    const labels = result.made.dropped
      .map((id) => (starter.parameters ?? []).find((entry) => entry.id === id)?.label)
      .filter((label): label is string => label !== undefined)
      .map((label) => label.toLowerCase());
    if (labels.length > 0) lines.push(`Left as it was: ${labels.join(', ')}.`);
  }
  if (result.made.skippedNames.length > 0) {
    lines.push(`Already in your mod, so not made again: ${result.made.skippedNames.join(', ')}.`);
  }
  lines.push(...result.notes, MADE_LINE);
  return lines.join(' ');
}

/** **Add to my mod** for a flow: made at once with its behaviour, one undo step. */
async function addFlow(
  host: SearchActionHost,
  hit: SearchHit,
  descriptor: Extract<SearchActionDescriptor, { type: 'flow' }>,
): Promise<SearchActionOutcome> {
  const { session } = host;
  const starter = starterById(session, descriptor.starter);
  if (starter?.creator === undefined)
    return failed(host, `There is no flow ${descriptor.starter}.`);
  if (!(await ensureMod(host, hit))) return cancelled;
  const project = projectOf(session);
  if (project === null) return cancelled;
  let values = answersOf(descriptor, hit);
  const behaviour = await behaviourOf(host, hit, starter);
  if (behaviour?.fit === 'answers') {
    values = { ...values, ...(behaviour.behaviour.answers?.[starter.id] as Record<string, Json>) };
  }
  let extras:
    | { rule?: Json; appliesTo?: readonly SearchBehaviourSubject[] }
    | { beside: { starter: string; values: Record<string, Json> } } = {};
  if (behaviour?.fit === 'rule') {
    extras = { rule: behaviour.behaviour.rule as Json, appliesTo: behaviour.behaviour.appliesTo };
  } else if (behaviour?.fit === 'beside' && behaviour.behaviour.beside !== undefined) {
    const beside = behaviour.behaviour.beside;
    extras = { beside: { starter: beside.starter, values: { ...(beside.values ?? {}) } } };
  }
  try {
    // `$thing` in answers or a companion's answers names the made thing: find its id first.
    if (holdsThing(values) || ('beside' in extras && holdsThing(extras.beside.values))) {
      const dry = await makeFlow(session, project, { flowId: starter.id, values });
      const thing = madeThing(
        dry.made.bundle,
        behaviour?.behaviour.appliesTo as readonly SearchBehaviourSubject[] | undefined,
      );
      if (thing !== undefined) {
        values = replaceThing(values, thing.id) as Record<string, Json>;
        if ('beside' in extras) {
          extras = {
            beside: {
              starter: extras.beside.starter,
              values: replaceThing(extras.beside.values, thing.id) as Record<string, Json>,
            },
          };
        }
      }
    }
    const request = { flowId: starter.id, values, ...extras } as MakeFlowRequest;
    const made = await makeFlow(session, project, request);
    const result = await session.applyChangeset(made.items, made.label);
    if (result.applied.length === 0) {
      return failed(host, `Nothing was made: your mod already has ${made.made.name}.`);
    }
    host.notify({ kind: 'info', text: madeLines(made, starter) });
    return { status: 'written', label: made.label };
  } catch (error) {
    return failed(host, `Could not make ${starter.title}: ${messageOf(error)}`);
  }
}

// Starters and examples ----------------------------------------------------------------------

/** A starter with given answers (checked), as a bundle source. */
function withAnswers(
  starter: ProjectStarter,
  given: Readonly<Record<string, Json>>,
): { source: ContentBundleBuilder; values: Record<string, Json> } {
  const values = toValues(
    starter.parameters,
    checkAnswers(starter.parameters, given).raw,
  ) as Record<string, Json>;
  const source: ContentBundleBuilder = {
    title: starter.title,
    ...(starter.parameters !== undefined ? { parameters: starter.parameters } : {}),
    build: (context) => starter.build({ ...context, values: { ...context.values, ...values } }),
  };
  return { source, values };
}

/** Adds a bundle source to the open mod as one undo step. */
async function addSource(
  host: SearchActionHost,
  source: ContentBundleBuilder,
  label: string,
): Promise<SearchActionOutcome> {
  const project = projectOf(host.session);
  if (project === null) return cancelled;
  const namespace = ownNamespace(project);
  if (namespace === undefined) return failed(host, 'Your mod has no name of its own yet.');
  try {
    const result = await host.session.addBundle(source, { namespace, label });
    if (result.added.length === 0 && result.merged.length === 0) {
      return failed(host, `Nothing was added: your mod already has everything in ${source.title}.`);
    }
    const skipped = result.duplicates.length + result.skippedAssets.length;
    host.notify({
      kind: 'info',
      text:
        `Added ${source.title}.` +
        (skipped > 0 ? ` ${skipped} already in your mod and left as they were.` : '') +
        ` ${MADE_LINE}`,
    });
    return { status: 'written', label };
  } catch (error) {
    return failed(host, `Could not add ${source.title}: ${messageOf(error)}`);
  }
}

/** **Add to my mod** or **Start a mod with this** for a starter or an example. */
async function addOrStart(
  host: SearchActionHost,
  hit: SearchHit,
  source: ContentBundleBuilder,
  values: Readonly<Record<string, Json>> | undefined,
  label: string,
): Promise<SearchActionOutcome> {
  if (projectOf(host.session) === null) {
    const made = await host.startMod({
      name: modNameFor(hit),
      from: { source, ...(values !== undefined ? { values } : {}) },
    });
    if (!made || projectOf(host.session) === null) return cancelled;
    host.notify({ kind: 'info', text: `Your new mod starts with ${source.title}.` });
    return opened;
  }
  return addSource(host, source, label);
}

// Templates ---------------------------------------------------------------------------------

/** A typed name as an element path ("Blue Sword" reads `blue_sword`). */
export function pathFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.\-/]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** **Add to my mod** for a template: an element with the typed name, one undo step. */
async function addTemplate(
  host: SearchActionHost,
  hit: SearchHit,
  descriptor: Extract<SearchActionDescriptor, { type: 'template' }>,
  typed: string | undefined,
): Promise<SearchActionOutcome> {
  const { session } = host;
  const kinds = session.registry.all().map((kind) => kind.id);
  const template = templatesFor(kinds, session.library.templates).find(
    (entry) => entry.id === descriptor.template,
  );
  if (template === undefined) return failed(host, `There is no template ${descriptor.template}.`);
  const name = typed?.trim() ?? '';
  const path =
    template.fixedName === true
      ? (template.defaultName ?? '')
      : pathFromName(name || (template.defaultName ?? ''));
  if (path === '') {
    // No name typed and none to offer: the New element dialog asks for one.
    if (!(await ensureMod(host, hit))) return cancelled;
    host.newElement({ kind: template.kind, template: template.id });
    return opened;
  }
  if (!(await ensureMod(host, hit, name || undefined))) return cancelled;
  const project = projectOf(session);
  if (project === null) return cancelled;
  const namespace = template.defaultNamespace ?? ownNamespace(project);
  if (namespace === undefined) return failed(host, 'Your mod has no name of its own yet.');
  try {
    const wanted = templateElementId(template, namespace, path);
    const id = template.fixedName === true ? wanted : (freeId(project, wanted) ?? wanted);
    const data = await template.data(
      templateContext(
        id,
        project.namespaces.map((entry) => entry.name),
        session.kindDefault(template.kind),
        session.target,
      ),
    );
    const display = name !== '' ? name : template.title;
    const label = templateLabel(display);
    const result = await session.applyChangeset(
      [
        {
          itemId: 'template-1',
          op: 'create',
          elementId: id,
          kind: template.kind,
          after: data,
          accepted: true,
          problems: [],
        },
      ],
      label,
    );
    if (result.applied.length === 0) return failed(host, `Your mod already has ${display}.`);
    host.notify({ kind: 'info', text: `Added ${display}. ${MADE_LINE}` });
    return { status: 'written', label };
  } catch (error) {
    return failed(host, `Could not add ${template.title}: ${messageOf(error)}`);
  }
}

// Rules -------------------------------------------------------------------------------------

/** **Add this rule**: a new rule starting with the part, its subject asked for when needed. */
async function addRulePart(
  host: SearchActionHost,
  hit: SearchHit,
  part: RulePartSort,
  id: string,
): Promise<SearchActionOutcome> {
  const { session } = host;
  if (session.registry.get(RULES_KIND) === undefined) {
    return failed(host, 'Rules are not available: no loaded plugin provides rule books.');
  }
  if (!(await ensureMod(host, hit))) return cancelled;
  const project = projectOf(session);
  if (project === null) return cancelled;
  const trigger = triggerForPart(part, id);
  let subject: ResourceLocation | undefined;
  if (subjectNeed(trigger) === 'required') {
    const choices = subjectChoices(project, trigger);
    if (choices.length > 0) {
      const chosen = await host.chooseSubject({
        trigger: trigger?.label ?? partLabel(part, id),
        choices: choices.map(({ id: thing, name }) => ({ id: thing, name })),
      });
      if (chosen === null) return cancelled;
      subject = chosen;
    }
  }
  try {
    const plan = planAddRule(project, {
      part,
      id,
      ...(subject !== undefined ? { subject } : {}),
    });
    const result = await session.applyChangeset(plan.items, plan.label);
    if (result.applied.length === 0) {
      return failed(host, 'Your mod changed meanwhile: nothing was written. Try again.');
    }
    host.openRule(plan.bookId, plan.index);
    host.notify({
      kind: 'info',
      text: [`Added a rule: ${partLabel(part, id)}.`, plan.note, MADE_LINE]
        .filter((line) => line !== undefined)
        .join(' '),
    });
    return { status: 'written', label: plan.label };
  } catch (error) {
    return failed(host, `Could not add the rule: ${messageOf(error)}`);
  }
}

// Vanilla things ----------------------------------------------------------------------------

/** Question ids the plugins mark `never`, by starter id. */
async function neverAnswered(host: SearchActionHost): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const data of await searchDataOf(host)) {
    for (const [starter, questions] of Object.entries(data.questions ?? {})) {
      for (const [question, hint] of Object.entries(questions)) {
        if (hint.never !== true) continue;
        const list = out[starter] ?? [];
        list.push(question);
        out[starter] = list;
      }
    }
  }
  return out;
}

/** **Make something with it**: the flows that take the thing, one chosen, the Creator opened. */
async function makeWith(
  host: SearchActionHost,
  hit: SearchHit,
  descriptor: Extract<SearchActionDescriptor, { type: 'vanilla' }>,
): Promise<SearchActionOutcome> {
  const { session } = host;
  const uses = vanillaUses({
    id: descriptor.id,
    sort: descriptor.sort,
    starters: session.library.starters,
    target: session.target,
    isKnownKind: (kind) => session.registry.get(kind) !== undefined,
    never: await neverAnswered(host),
    ...(host.vanillaSort !== undefined ? { sortOf: host.vanillaSort } : {}),
  });
  const thing = hit.entry.title;
  if (uses.length === 0) {
    return failed(
      host,
      `Nothing here takes ${thing} yet. Try other words, or add it to your Wishlist.`,
    );
  }
  const choices: SearchMakeChoice[] = uses.map((use) => ({
    flowId: use.flowId,
    title: use.title,
    questionLabel: use.questionLabel,
    values: use.values,
  }));
  const chosen =
    choices.length === 1
      ? (choices[0] as SearchMakeChoice)
      : await host.chooseMake({ thing, choices });
  if (chosen === null) return cancelled;
  if (!(await ensureMod(host, hit))) return cancelled;
  host.openCreator({
    flowId: chosen.flowId,
    values: chosen.values,
    note: `Filled in from your words: ${thing} as the ${chosen.questionLabel.toLowerCase()}.`,
  });
  return opened;
}

// Things to fix -----------------------------------------------------------------------------

type ProblemDescriptor = Extract<SearchActionDescriptor, { type: 'problem' }>;

/** The live problem a descriptor names, else one made from it. */
function problemOf(session: SearchActionSession, descriptor: ProblemDescriptor): Problem {
  const found = session.snapshot.problems.find(
    (problem) =>
      problem.code === descriptor.code &&
      (problem.elementId ?? undefined) === descriptor.element &&
      (problem.path ?? undefined) === descriptor.path &&
      (problem.file ?? undefined) === descriptor.file,
  );
  if (found !== undefined) return found;
  return {
    severity: 'error',
    code: descriptor.code,
    message: '',
    ...(descriptor.element !== undefined
      ? { elementId: descriptor.element as ResourceLocation }
      : {}),
    ...(descriptor.path !== undefined ? { path: descriptor.path } : {}),
    ...(descriptor.file !== undefined ? { file: descriptor.file } : {}),
  };
}

/** The one-step fix of a Thing to fix, when it has one and its thing is still there. */
function fixOf(
  session: SearchActionSession,
  descriptor: ProblemDescriptor,
): 'remove-step' | 'paint-picture' | undefined {
  const fix = PLAIN_PROBLEMS[descriptor.code]?.fix;
  if (fix === undefined) return undefined;
  const project = projectOf(session);
  if (project === null || descriptor.element === undefined) return undefined;
  if (!elementsOf(project).some((element) => element.id === descriptor.element)) return undefined;
  if (fix === 'remove-step' && stepPointerOf(descriptor.path) === null) return undefined;
  return fix;
}

/** Whether a hit is a Thing to fix with a one-step fix (the panel's `canFix`). */
export function canFixSearchHit(session: SearchActionSession, hit: SearchHit): boolean {
  const descriptor = actionOf(hit.entry);
  return descriptor.type === 'problem' && fixOf(session, descriptor) !== undefined;
}

/** **Fix it**: a step removed (one undo step) or the painter on the missing picture. */
async function fixProblem(
  host: SearchActionHost,
  descriptor: ProblemDescriptor,
): Promise<SearchActionOutcome> {
  const { session } = host;
  const fix = fixOf(session, descriptor);
  const problem = problemOf(session, descriptor);
  if (fix === undefined) {
    host.showProblem(problem);
    return opened;
  }
  if (fix === 'paint-picture') {
    host.paintMissing(problem);
    return opened;
  }
  const project = projectOf(session) as Project;
  const element = elementsOf(project).find((entry) => entry.id === descriptor.element) as Element;
  const pointer = stepPointerOf(descriptor.path) as string;
  const next = removeAtPointer(element.data, pointer);
  if (next === null) return failed(host, 'That step could not be found any more.');
  const label = 'Remove this step';
  const result = await session.applyChangeset(
    [
      {
        itemId: 'fix-1',
        op: 'update',
        elementId: element.id,
        kind: element.kind,
        before: element.data,
        after: next,
        accepted: true,
        problems: [],
      },
    ],
    label,
  );
  if (result.applied.length === 0) {
    return failed(host, 'Your mod changed meanwhile: nothing was written. Try again.');
  }
  host.notify({
    kind: 'info',
    text: `Removed the step from ${displayNameOf(element)}. ${MADE_LINE}`,
  });
  return { status: 'written', label };
}

// The Wishlist ------------------------------------------------------------------------------

/**
 * **Add it to my Wishlist** when nothing is close: the words as an open wish of the mod's
 * Wishlist (not part of the undo history, ADR 0053).
 */
export async function addSearchWish(
  host: SearchActionHost,
  text: string,
): Promise<SearchActionOutcome> {
  const words = text.trim();
  if (words === '') return failed(host, 'Type what you wanted first.');
  if (projectOf(host.session) === null) {
    return failed(host, 'Open or make a mod first: the Wishlist is kept with it.');
  }
  try {
    const entries = await host.session.readWishlist();
    await host.session.writeWishlist(
      addWish(entries, {
        source: 'user',
        title: words.slice(0, 80),
        request: words,
        missing: 'The search found nothing close.',
      }),
    );
    host.notify({ kind: 'info', text: 'Added to your Wishlist.' });
    return opened;
  } catch (error) {
    return failed(host, `Could not add it to your Wishlist: ${messageOf(error)}`);
  }
}

// Elements ----------------------------------------------------------------------------------

function elementById(session: SearchActionSession, id: string): Element | undefined {
  const project = projectOf(session);
  return project === null ? undefined : elementsOf(project).find((entry) => entry.id === id);
}

function elementAction(
  host: SearchActionHost,
  id: ResourceLocation,
  which: SearchActionKey,
): SearchActionOutcome {
  const element = elementById(host.session, id);
  if (element === undefined) return failed(host, 'That is not in your mod any more.');
  switch (which) {
    case 'rename':
      host.renameElement(element.id);
      return opened;
    case 'find-usages':
      host.findUsages(element.id);
      return opened;
    case 'edit-in-creator':
      if (element.meta.creator === undefined) {
        host.notify({
          kind: 'info',
          text: `${displayNameOf(element)} was not made with the Creator, so it opens here.`,
        });
        host.openElement(element.id);
        return opened;
      }
      host.editInCreator(element.id);
      return opened;
    default:
      host.openElement(element.id);
      return opened;
  }
}

// The table ---------------------------------------------------------------------------------

/** Runs one action of D9's table; see the module comment. */
async function run(
  host: SearchActionHost,
  hit: SearchHit,
  which: SearchActionKey,
  options: RunActionOptions,
): Promise<SearchActionOutcome> {
  const { session } = host;
  const descriptor = actionOf(hit.entry);
  switch (descriptor.type) {
    case 'flow':
      if (which === 'make') return makeThis(host, hit, descriptor);
      return addFlow(host, hit, descriptor);
    case 'starter': {
      const starter = starterById(session, descriptor.starter);
      if (starter === undefined) return failed(host, `There is no starter ${descriptor.starter}.`);
      const given = answersOf(descriptor, hit);
      const { source, values } = withAnswers(starter, given);
      return addOrStart(host, hit, source, values, `Add ${starter.title}`);
    }
    case 'example': {
      const example: ExampleProject | undefined = session.library.examples.find(
        (entry) => entry.id === descriptor.example,
      );
      if (example === undefined) return failed(host, `There is no example ${descriptor.example}.`);
      if (which === 'see-example') {
        host.seeExample(example.id);
        return opened;
      }
      return addOrStart(host, hit, example, undefined, `Add ${example.title}`);
    }
    case 'flows':
      if (!(await ensureMod(host, hit))) return cancelled;
      host.chooseFlows({
        flows: descriptor.flows,
        ...(descriptor.starters !== undefined ? { starters: descriptor.starters } : {}),
        ...(descriptor.tile !== undefined ? { tile: descriptor.tile } : {}),
      });
      return opened;
    case 'template':
      return addTemplate(host, hit, descriptor, options.name);
    case 'kind':
      if (which === 'show-mine') {
        host.showMine(descriptor.kind);
        return opened;
      }
      if (!(await ensureMod(host, hit))) return cancelled;
      host.newElement({ kind: descriptor.kind });
      return opened;
    case 'surprise':
      host.surprise();
      return opened;
    case 'rules-book':
      if (!(await ensureMod(host, hit))) return cancelled;
      host.openRuleBook();
      return opened;
    case 'paint':
      host.paint();
      return opened;
    case 'ai':
      host.askAi();
      return opened;
    case 'element':
      return elementAction(host, descriptor.element as ResourceLocation, which);
    case 'asset':
      host.openAsset(descriptor.namespace, descriptor.path);
      return opened;
    case 'rule': {
      const book = elementById(session, descriptor.book);
      if (book === undefined) return failed(host, 'That rule is not in your mod any more.');
      host.openRule(book.id, descriptor.index);
      return opened;
    }
    case 'vanilla':
      if (which === 'copy-id') {
        host.copyText(descriptor.id);
        host.notify({ kind: 'info', text: `Copied ${descriptor.id}.` });
        return opened;
      }
      return makeWith(host, hit, descriptor);
    case 'rule-part':
      return addRulePart(host, hit, descriptor.part, descriptor.id);
    case 'setting':
      host.openSettings(descriptor.setting);
      return opened;
    case 'command':
      host.runCommand(descriptor.command);
      return opened;
    case 'guide':
      host.openGuide(descriptor.page, descriptor.anchor);
      return opened;
    case 'problem':
      if (which === 'fix') return fixProblem(host, descriptor);
      host.showProblem(problemOf(session, descriptor));
      return opened;
    default:
      return failed(host, 'This result has nothing to do yet.');
  }
}

/**
 * Runs the button `which` of a search result (ADR 0124 D9) through the app's host: remembers the
 * choice, then makes, adds, opens or fixes as the result's descriptor says. A result the target
 * cannot make does nothing but say so. Never throws: a failure is shown and returned.
 */
export async function runSearchAction(
  host: SearchActionHost,
  hit: SearchHit,
  which: SearchActionKey,
  options: RunActionOptions = {},
): Promise<SearchActionOutcome> {
  if (hit.entry.available === false) {
    return failed(host, hit.entry.unavailableReason ?? NOT_ON_TARGET);
  }
  host.rememberChoice(hit.entry.id);
  if (which === 'ask-ai') {
    host.askAi();
    return opened;
  }
  if (which === 'surprise') {
    host.surprise();
    return opened;
  }
  try {
    return await run(host, hit, which, options);
  } catch (error) {
    return failed(host, messageOf(error));
  }
}
