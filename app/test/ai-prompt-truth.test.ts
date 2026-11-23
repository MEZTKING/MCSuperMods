/**
 * The prompt's truth test (ADR 0125 D7, B683): every fact of the AI helper's system prompt that
 * B682 made a constant is checked here against the merged code, never against the prompt's own
 * words. Kinds against the plugin registry, templates against the session library, flows, their
 * parameters and choices against the library's starters, the Script API's versions, members and
 * events against `script-api-v1.json` both ways, Try it's numbers, grounds, tools and commands
 * against `@msm/sim` and the Try it view, the app's labels against the components, the Rules
 * limits against `@msm/plugin-rules`, the drawn recipes against the art table, and every "not
 * available" claim against a probe that fails once the thing exists.
 *
 * Each check is a function of the prompt's facts and the code's sources that returns the facts
 * it finds false, so the mutation cases at the end run the same checks on a copy of a source
 * with one fact changed and prove that each check bites.
 *
 * Later plans add their cases in siblings (`ai-prompt-truth.<topic>.test.ts`), never by editing
 * this file. The constants other tests already pin (the Rules catalogue, the templates and answers
 * of the vanilla parity batches, the problem codes) stay in `ai-rules.test.ts`; the guard at the
 * end only asks that every prompt constant is pinned by some test of the app.
 */

import { readdirSync, readFileSync } from 'node:fs';
import * as ai from '@msm/ai';
import {
  APP_MAP_LABELS,
  APP_MAP_TILES,
  CONTROLS_PROMPT_TEMPLATES,
  MOB_VARIANT_PROMPT_KINDS,
  MOBS_COMMANDS_PROMPT_TEMPLATES,
  MORE_DATA_PROMPT_KINDS,
  MORE_TAG_PROMPT_KINDS,
  PLANTS_STORAGE_PROMPT_TEMPLATES,
  PROMPT_CONTEXT_LINES,
  PROMPT_FLOWS,
  PROMPT_KINDS,
  PROMPT_NOT_AVAILABLE,
  PROMPT_VIEWS,
  type PromptAbsence,
  type PromptFlow,
  projectContextBlock,
  RULES_PROMPT_LIMITS,
  RULES_PROMPT_TEMPLATES,
  SCRIPT_API_PROMPT_VERSIONS,
  type ScriptApiPromptVersion,
  systemPrompt,
  TEXTURE_PROMPT_RECIPES,
  TRY_IT_PROMPT_AREA,
  TRY_IT_PROMPT_COMMANDS,
  TRY_IT_PROMPT_GROUNDS,
  TRY_IT_PROMPT_LABELS,
  TRY_IT_PROMPT_SCRIPT_SECONDS,
  TRY_IT_PROMPT_TICK_COMMANDS,
  TRY_IT_PROMPT_TOOLS,
  VANILLA_PACK_FLOWS,
  VANILLA_PARITY_PROMPT_TEMPLATES,
  VEHICLE_PROMPT_TEMPLATES,
  VILLAGERS_FLUIDS_PROMPT_TEMPLATES,
  WORLD_FLOW_ANSWERS,
} from '@msm/ai';
import type { ProjectStarter } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { MAKE_TILES, MAKE_WORLD_PICKS } from '../src/renderer/src/components/home/tiles';
import {
  componentKeys,
  enumValues,
  exportedLiteral,
  labelInSource,
  playLabelsOf,
  type ScriptApiJson,
  type ScriptApiNode,
  SOURCE_FILES,
  sourceOfDirs,
  structFields,
  type TruthSources,
  truthSources,
  uiModesOf,
  WORLD_MAP_SOURCE_DIRS,
} from './ai-prompt-truth-sources';

// ---------------------------------------------------------------------------------------------
// The prompt's facts, as one value the mutation cases can copy and change.

/** The prompt's text and the constants it is made from. */
interface PromptFacts {
  readonly text: string;
  readonly flows: Readonly<Record<string, PromptFlow>>;
  readonly kinds: readonly string[];
  readonly wordKinds: readonly string[];
  readonly templates: readonly string[];
  readonly scriptVersions: Readonly<Record<string, ScriptApiPromptVersion>>;
  readonly absences: readonly PromptAbsence[];
}

/** The prompt as it is. */
function promptFacts(): PromptFacts {
  return {
    text: systemPrompt(),
    flows: PROMPT_FLOWS,
    kinds: PROMPT_KINDS,
    wordKinds: [
      ...Object.keys(MOB_VARIANT_PROMPT_KINDS),
      ...Object.keys(MORE_TAG_PROMPT_KINDS),
      ...Object.keys(MORE_DATA_PROMPT_KINDS),
    ],
    templates: [
      ...RULES_PROMPT_TEMPLATES,
      ...VEHICLE_PROMPT_TEMPLATES,
      ...CONTROLS_PROMPT_TEMPLATES,
      ...VANILLA_PARITY_PROMPT_TEMPLATES,
      ...VILLAGERS_FLUIDS_PROMPT_TEMPLATES,
      ...PLANTS_STORAGE_PROMPT_TEMPLATES,
      ...MOBS_COMMANDS_PROMPT_TEMPLATES,
    ],
    scriptVersions: SCRIPT_API_PROMPT_VERSIONS,
    absences: PROMPT_NOT_AVAILABLE,
  };
}

/** The paragraph of the prompt that starts with `head` (one line of the text). */
function paragraph(text: string, head: string): string {
  const line = text.split('\n').find((candidate) => candidate.startsWith(head));
  if (line === undefined) throw new Error(`No paragraph starts with ${JSON.stringify(head)}.`);
  return line;
}

/** A deep copy of a JSON-like value, for the mutation cases. */
const copy = <T>(value: T): T => structuredClone(value);

// ---------------------------------------------------------------------------------------------
// Kinds.

/** Every kind the prompt names is a kind of the registry, and the kind lists are complete. */
function checkKinds(facts: PromptFacts, sources: TruthSources): string[] {
  const problems: string[] = [];
  const registry = new Set(sources.kinds);
  for (const kind of [...facts.kinds, ...facts.wordKinds]) {
    if (!registry.has(kind))
      problems.push(`the prompt names the kind ${kind}, which has no plugin`);
  }
  const named = new Set([...facts.kinds, ...facts.wordKinds]);
  for (const match of facts.text.matchAll(/"([a-z_]+:[a-z0-9_/]+)"/g)) {
    const id = match[1] as string;
    if (registry.has(id) && !named.has(id)) {
      problems.push(`the prompt quotes the kind ${id}, which no kind constant lists`);
    }
  }
  const components = componentKeys(sources.mcdoc);
  for (const match of new Set(facts.text.match(/\bmsm:[a-z_]+/g) ?? [])) {
    if (!registry.has(match) && !components.has(match)) {
      problems.push(`the prompt names ${match}, which is neither a kind nor an MSM component`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Templates.

/** Every template the prompt names by id is in the session library. */
function checkTemplates(facts: PromptFacts, sources: TruthSources): string[] {
  const library = new Set(sources.templates.map((template) => template.id));
  const named = new Set([
    ...facts.templates,
    ...(facts.text.match(/\b(?:msm_[a-z0-9_]+|dimension_type_[a-z_]+)\b/g) ?? []),
  ]);
  return [...named]
    .filter((id) => !library.has(id))
    .map((id) => `the prompt names the template ${id}, which the library does not have`);
}

// ---------------------------------------------------------------------------------------------
// Flows.

const paramIds = (starter: ProjectStarter): Set<string> =>
  new Set((starter.parameters ?? []).map((parameter) => parameter.id));

const choiceValues = (starter: ProjectStarter): Set<string> =>
  new Set(
    (starter.parameters ?? []).flatMap((parameter) =>
      'choices' in parameter ? parameter.choices.map((choice) => choice.value) : [],
    ),
  );

/** A named parameter such as `variant_<n>_colour` matches `variant_1_colour`. */
const namesParameter = (word: string, params: Set<string>): boolean => {
  if (params.has(word)) return true;
  if (!word.includes('<n>')) return false;
  const pattern = new RegExp(`^${word.replaceAll('<n>', '\\d+')}$`);
  return [...params].some((param) => pattern.test(param));
};

/** The text inside the bracket that opens at `start` (after the opening bracket). */
function bracketBody(text: string, start: number): string {
  let depth = 1;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index);
    }
  }
  return text.slice(start);
}

/**
 * Every flow the prompt names: by its starter, its title and its parameters; and where the text
 * writes `"Title" (id: ...)`, every quoted answer there is a choice of the flow and every
 * parameter-like word one of its parameters.
 */
function checkFlows(facts: PromptFacts, sources: TruthSources): string[] {
  const problems: string[] = [];
  const starters = new Map(sources.starters.map((starter) => [starter.id, starter]));
  for (const [id, flow] of Object.entries(facts.flows)) {
    const starter = starters.get(id);
    if (starter === undefined) {
      problems.push(`the prompt names the flow ${id}, which the library does not have`);
      continue;
    }
    if (starter.title !== flow.title) {
      problems.push(
        `the prompt calls ${id} "${flow.title}"; the library calls it "${starter.title}"`,
      );
    }
    const params = paramIds(starter);
    for (const parameter of flow.parameters) {
      if (!params.has(parameter)) problems.push(`the flow ${id} has no parameter ${parameter}`);
    }
  }
  const titles = new Set(sources.starters.map((starter) => starter.title));
  for (const match of facts.text.matchAll(/"([^"]+)" \(([a-z][a-z0-9_-]*)(:|\))/g)) {
    const [, title, id, after] = match as unknown as [string, string, string, string];
    const starter = starters.get(id);
    if (starter === undefined) continue;
    // `"Title" (id ...)` names a flow; `"Answer label" (id: ...)` an answer of one; any other
    // quoted word before a bracket ("sapling" (tree: ...), a block type) is not about a flow.
    const answer = (starter.parameters ?? []).some((parameter) => parameter.label === title);
    if (!titles.has(title) && !answer) continue;
    if (facts.flows[id] === undefined)
      problems.push(`the flow ${id} is named but not in PROMPT_FLOWS`);
    if (!answer && starter.title !== title) {
      problems.push(
        `the prompt writes "${title}" (${id}); the library calls it "${starter.title}"`,
      );
    }
    if (after !== ':') continue;
    const body = bracketBody(facts.text, (match.index ?? 0) + match[0].length);
    const choices = choiceValues(starter);
    const params = paramIds(starter);
    for (const quoted of body.matchAll(/"([^"]+)"/g)) {
      const value = quoted[1] as string;
      if (!value.includes('<') && !choices.has(value)) {
        problems.push(`the flow ${id} has no answer "${value}"`);
      }
    }
    const words = body.replace(/"[^"]*"/g, '').replace(/\([^)]*\)/g, '');
    for (const word of words.match(/\b[a-z]+(?:_[a-z0-9<>]+)+\b/g) ?? []) {
      if (!namesParameter(word, params)) problems.push(`the flow ${id} has no parameter ${word}`);
    }
  }
  for (const id of VANILLA_PACK_FLOWS) {
    const starter = starters.get(id);
    if (starter === undefined) problems.push(`the vanilla pack flow ${id} does not exist`);
    else if (starter.requiresKinds.some((kind) => kind.startsWith('msm:'))) {
      problems.push(
        `the flow ${id} needs ${starter.requiresKinds.join(', ')}, so not a plain pack`,
      );
    }
  }
  // "each takes preset (the model: a, b or c, as the flow offers)": the presets the mob flows
  // of that sentence offer, together.
  const presets =
    /each takes preset \(the model: ([a-z_, ]+) or ([a-z_]+), as the flow offers\)/.exec(
      facts.text,
    );
  const mobFlows = ['pet', 'farm-animal', 'mount', 'flying-mob', 'water-mob', 'boss'];
  const offered = new Set(
    mobFlows.flatMap((id) =>
      (starters.get(id)?.parameters ?? []).flatMap((parameter) =>
        parameter.id === 'preset' && 'choices' in parameter
          ? parameter.choices.map((choice) => choice.value)
          : [],
      ),
    ),
  );
  const said =
    presets === null ? [] : [...(presets[1] as string).split(', '), presets[2] as string];
  if (JSON.stringify([...said].sort()) !== JSON.stringify([...offered].sort())) {
    problems.push(
      `the mob flows offer the presets ${[...offered].join(', ')}, not ${said.join(', ')}`,
    );
  }
  const worldFlows = sources.starters
    .filter((starter) => starter.id.startsWith('world-'))
    .map((starter) => starter.id);
  if (JSON.stringify(Object.keys(WORLD_FLOW_ANSWERS)) !== JSON.stringify(worldFlows)) {
    problems.push(`the world flows are ${worldFlows.join(', ')}, not the prompt's`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// The Script API.

const sinceRuntime = (node: ScriptApiNode | undefined): string[] =>
  [node?.doc, ...(node?.overloads ?? []).map((overload) => overload.doc)]
    .map((doc) => (doc === undefined ? undefined : /Since runtime (\d+\.\d+\.\d+)/.exec(doc)?.[1]))
    .filter((release): release is string => release !== undefined);

/** A member path of the prompt's table (`Type.member`, `msm.member`, a type or an alias). */
function scriptApiNode(api: ScriptApiJson, path: string): ScriptApiNode | undefined {
  const [owner, member] = path.split('.') as [string, string | undefined];
  if (member === undefined) return api.types[owner] ?? api.aliases[owner];
  const holder = owner === 'msm' ? api.globals.msm : api.types[owner];
  return holder?.members?.[member];
}

/**
 * Every version's members and events exist with the runtime release the version names, and the
 * other way: every event of the API is named by exactly one version, so a version without its
 * paragraph fails (F8 b). The first API's members and events say no release.
 */
function checkScriptApi(facts: PromptFacts, sources: TruthSources): string[] {
  const problems: string[] = [];
  const api = sources.scriptApi;
  const named = new Map<string, string>();
  for (const [version, entry] of Object.entries(facts.scriptVersions)) {
    const release = (node: ScriptApiNode | undefined, what: string): void => {
      const releases = sinceRuntime(node);
      if (entry.runtime === null ? releases.length > 0 : !releases.includes(entry.runtime)) {
        problems.push(
          `${what} says ${releases.join(', ') || 'no release'}; Script API ${version} says ${entry.runtime ?? 'none'}`,
        );
      }
    };
    for (const event of entry.events) {
      if (named.has(event)) problems.push(`the event ${event} is named by two versions`);
      named.set(event, version);
      const node = api.events[event];
      if (node === undefined)
        problems.push(`Script API ${version} names ${event}, which is no event`);
      else release(node, `the event ${event}`);
    }
    for (const member of entry.members) {
      const node = scriptApiNode(api, member);
      if (node === undefined)
        problems.push(`Script API ${version} names ${member}, which is not in it`);
      else release(node, member);
    }
  }
  for (const event of Object.keys(api.events)) {
    if (!named.has(event)) problems.push(`the event ${event} is in no paragraph of the prompt`);
    else if (!facts.text.includes(event))
      problems.push(`the prompt never writes the event ${event}`);
  }
  // "The first events are ...; the first five can be cancelled with e.cancel()."
  const first = facts.scriptVersions['1.0']?.events ?? [];
  const cancellable = first.filter((event) => api.events[event]?.cancellable === true);
  if (JSON.stringify(cancellable) !== JSON.stringify(first.slice(0, 5))) {
    problems.push(`the first events that can be cancelled are ${cancellable.join(', ')}`);
  }
  // Script API 1.3: world.spawnParticle's count is capped only with motion.
  const particleDoc = JSON.stringify(api.types.World?.members?.spawnParticle ?? {});
  if (facts.text.includes('count (at least 1; at most 1000 with motion)')) {
    if (!particleDoc.includes('at most 1000 with `motion`')) {
      problems.push('world.spawnParticle no longer caps count at 1000 with motion');
    }
  } else problems.push('the Script API 1.3 paragraph does not say how count is capped');
  // Script API 1.6: block.place and world.explosion can be cancelled; command cannot.
  for (const [event, can] of [
    ['block.place', true],
    ['world.explosion', true],
    ['command', false],
  ] as const) {
    if ((api.events[event]?.cancellable === true) !== can) {
      problems.push(`the prompt says ${event} ${can ? 'can' : 'cannot'} be cancelled`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Try it.

/** Try it's paragraph against `@msm/sim` and the Try it view. */
function checkTryIt(facts: PromptFacts, sources: TruthSources): string[] {
  const problems: string[] = [];
  const { tryIt, files, targets } = sources;
  const same = (what: string, prompt: unknown, code: unknown): void => {
    if (JSON.stringify(prompt) !== JSON.stringify(code)) {
      problems.push(
        `${what}: the prompt says ${JSON.stringify(prompt)}, the code ${JSON.stringify(code)}`,
      );
    }
  };
  same('the area (AREA_SIZE_*)', TRY_IT_PROMPT_AREA, tryIt.area);
  same('the grounds (GROUND_CHOICES)', TRY_IT_PROMPT_GROUNDS, tryIt.groundLabels);
  same('the game commands (VANILLA_COMMANDS)', TRY_IT_PROMPT_COMMANDS, tryIt.commands);
  same('the tick cap (TICK_COMMAND_CAP)', TRY_IT_PROMPT_TICK_COMMANDS, tryIt.tickCap);
  same(
    'the script budget (SCRIPT_BUDGET_MS)',
    TRY_IT_PROMPT_SCRIPT_SECONDS * 1000,
    exportedLiteral(files[SOURCE_FILES.scriptWorker] ?? '', 'SCRIPT_BUDGET_MS'),
  );
  // The tool strip: SIM_TOOLS' buttons, then the view's "Clear the area".
  const strip = [...tryIt.toolLabels];
  const view = files[SOURCE_FILES.tryItView] ?? '';
  const last = TRY_IT_PROMPT_TOOLS[TRY_IT_PROMPT_TOOLS.length - 1] ?? '';
  if (labelInSource(view, last)) strip.push(last);
  same('the tool strip (SIM_TOOLS and the view)', TRY_IT_PROMPT_TOOLS, strip);
  // The labels the paragraph quotes.
  const label = (what: string, prompt: string, code: unknown): void => same(what, prompt, code);
  label(
    'the Play button (PLAY_LABEL)',
    TRY_IT_PROMPT_LABELS.play,
    exportedLiteral(view, 'PLAY_LABEL'),
  );
  const happened = files[SOURCE_FILES.whatHappened] ?? '';
  label(
    'the log (WHAT_HAPPENED_TITLE)',
    TRY_IT_PROMPT_LABELS.log,
    exportedLiteral(happened, 'WHAT_HAPPENED_TITLE'),
  );
  label(
    'the only-in-Minecraft words (ONLY_IN_MINECRAFT)',
    `${TRY_IT_PROMPT_LABELS.onlyInMinecraft}:`,
    exportedLiteral(happened, 'ONLY_IN_MINECRAFT'),
  );
  label(
    'the chance switch (RUN_EVERY_TIME_LABEL)',
    TRY_IT_PROMPT_LABELS.runEveryTime,
    exportedLiteral(happened, 'RUN_EVERY_TIME_LABEL'),
  );
  if (!labelInSource(files[SOURCE_FILES.toolbar] ?? '', TRY_IT_PROMPT_LABELS.button)) {
    problems.push(`the toolbar has no "${TRY_IT_PROMPT_LABELS.button}" button`);
  }
  const text = paragraph(facts.text, `- Try it (the "${TRY_IT_PROMPT_LABELS.button}"`);
  if (text.includes('F6') && !/event\.key === 'F6'/.test(files[SOURCE_FILES.shortcuts] ?? '')) {
    problems.push('the prompt says F6 opens Try it; the shortcuts do not');
  }
  if (
    text.includes('(T, or /)') &&
    !(files[SOURCE_FILES.tryItInput] ?? '').includes("keys: 'T or /'")
  ) {
    problems.push('the prompt says T or / opens the chat box; the controls do not');
  }
  // Every game command the chat box runs is a command of both targets.
  for (const target of targets) {
    const names = new Set(target.commands?.vanillaNames ?? []);
    for (const command of TRY_IT_PROMPT_COMMANDS) {
      if (!names.has(command)) problems.push(`${command} is no command of ${target.mcVersion}`);
    }
  }
  // What an event action does in Try it (SIM_ACTIONS): an action Try it runs is never "only said"
  // (B613 made run_function run), and one it only says is never said to run.
  for (const clause of text.split(/[.;]/)) {
    for (const [action, handling] of Object.entries(tryIt.actions)) {
      if (!new RegExp(`\\b${action} (action|step)`).test(clause)) continue;
      const said = /only said|is said|only in minecraft/i.test(clause);
      if (handling === 'runs' && said) {
        problems.push(
          `the prompt says Try it only says the ${action} action; it runs it (SIM_ACTIONS)`,
        );
      }
      if (handling === 'onlyInMinecraft' && !said) {
        problems.push(
          `the prompt says Try it runs the ${action} action; it only says it (SIM_ACTIONS)`,
        );
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// The app's labels.

/** Where each label of `APP_MAP_LABELS` is found: an exported constant or a component's markup. */
function checkAppMap(sources: TruthSources): string[] {
  const problems: string[] = [];
  const F = SOURCE_FILES;
  const file = (path: string): string => sources.files[path] ?? '';
  const inMarkup = (labels: string | readonly string[], ...paths: string[]): void => {
    for (const label of typeof labels === 'string' ? [labels] : labels) {
      if (!paths.some((path) => labelInSource(file(path), label))) {
        problems.push(`"${label}" is not in ${paths.join(' or ')}`);
      }
    }
  };
  const constant = (label: string, path: string, name: string): void => {
    const value = exportedLiteral(file(path), name);
    if (value !== label) problems.push(`"${label}" is not ${name} of ${path} (${String(value)})`);
  };
  const M = APP_MAP_LABELS;
  const uiModes = uiModesOf(file(F.preferences));
  const play = playLabelsOf(file(F.playStore));
  // The mode switch: UI_MODES' labels, read from the store's source as written.
  if (JSON.stringify(M.modes) !== JSON.stringify(uiModes.map((mode) => mode.label))) {
    problems.push('the modes are not UI_MODES');
  }
  inMarkup(M.modes, F.preferences);
  // Very easy's toolbar: its own buttons, Try it, and Play and Reload from PLAY_CONTROL_LABELS.
  for (const label of M.veryEasyToolbar) {
    if (label === play.play || label === play.reload) {
      inMarkup(label, F.playStore);
    } else inMarkup(label, F.toolbar);
  }
  if (!M.veryEasyToolbar.includes(play.play ?? '')) problems.push('no Play in the toolbar');
  inMarkup(M.playMenu, F.playStore);
  if (M.playMenu[0] !== play.newWorld || M.playMenu[1] !== play.restart) {
    problems.push('the Play menu is not PLAY_CONTROL_LABELS');
  }
  inMarkup(M.makeSomething, F.makeTiles);
  inMarkup(M.myThings, F.myThings);
  inMarkup(M.thingMenu, F.myThings);
  if (!MAKE_TILES.some((tile) => tile.id === 'surprise' && tile.label === M.surprise)) {
    problems.push(`"${M.surprise}" is not the surprise tile`);
  }
  inMarkup(M.surprise, F.tiles);
  inMarkup(M.showcase, F.app);
  inMarkup(M.showcaseButtons, F.showcaseCard);
  constant(M.showShowcase, F.home, 'SHOW_SHOWCASE');
  inMarkup([M.thingsToFix, M.nothingToFix, ...M.thingsToFixButtons], F.thingsToFix);
  inMarkup(M.dockTabs, F.rightDock);
  inMarkup(M.elementHeader, F.editorArea);
  constant(M.draw, F.drawButton, 'DRAW');
  constant(M.drawVeryEasy, F.drawButton, 'DRAW_IT_FOR_ME_BUTTON');
  constant(M.makeWithAi, F.makeWithAiButton, 'MAKE_WITH_AI');
  constant(M.makeWithAiVeryEasy, F.makeWithAiButton, 'MAKE_IT_WITH_AI');
  constant(M.setUpAiPictures, F.makeWithAiButton, 'SET_UP_AI_PICTURES');
  inMarkup(M.aiPictures, F.aiPicturesSettings);
  // The default picture service is the one the prompt names.
  const pictures = file(F.aiPictures);
  const defaultService = /DEFAULT_AI_PICTURE_SERVICE: \w+ = '([a-z-]+)'/.exec(pictures)?.[1];
  const serviceLabel =
    defaultService === undefined
      ? undefined
      : new RegExp(`'${defaultService}': \\{\\s*label: '([^']+)'`).exec(pictures)?.[1];
  if (serviceLabel === undefined || !serviceLabel.startsWith(M.aiPictureService)) {
    problems.push(
      `the default picture service is ${serviceLabel ?? 'unknown'}, not ${M.aiPictureService}`,
    );
  }
  inMarkup([M.wishlist, M.exportJar], F.menu);
  if (!/label: 'Help',\s*submenu: \[[^\]]*'Wishlist…'/.test(file(F.menu))) {
    problems.push('the Wishlist is not in the Help menu');
  }
  // Home's tiles, in Home's order.
  const tiles = MAKE_TILES.map((tile) => tile.label);
  if (JSON.stringify(APP_MAP_TILES) !== JSON.stringify(tiles)) {
    problems.push(`the tiles are ${tiles.join(', ')}, not the prompt's`);
  }
  inMarkup(APP_MAP_TILES, F.tiles);
  return problems;
}

/** The labels the live world map paragraph quotes are in the map's, Try it's and the Studios' source. */
function checkWorldMapLabels(facts: PromptFacts, source: string): string[] {
  const text = paragraph(facts.text, '- The live world map:');
  return [...text.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1] as string)
    .filter((label) => !labelInSource(source, label))
    .map((label) => `the world map paragraph quotes "${label}", which the app does not show`);
}

// ---------------------------------------------------------------------------------------------
// Rules, textures, speaking.

function checkRulesLimits(sources: TruthSources): string[] {
  return Object.entries(RULES_PROMPT_LIMITS)
    .filter(
      ([key, value]) => sources.rulesLimits[key as keyof typeof RULES_PROMPT_LIMITS] !== value,
    )
    .map(([key, value]) => `the Rules limit ${key} is ${value} in the prompt`);
}

/**
 * The drawn recipes against the art table: the same ids, each size the words name ("64 by 32")
 * the recipe's size, a family's size its recipes', and the finishes named after "finish" the
 * recipe's own.
 */
function checkTextures(sources: TruthSources): string[] {
  const problems: string[] = [];
  const info = new Map(sources.art.map((entry) => [entry.id as string, entry]));
  const rows = Object.entries(TEXTURE_PROMPT_RECIPES).flatMap(([family, recipes]) =>
    recipes.map(([id, words]) => ({ family, id, words })),
  );
  const ids = rows.map((row) => row.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...info.keys()].sort())) {
    problems.push('the drawn recipes are not ART_RECIPE_INFO');
  }
  const familySize: Readonly<Record<string, string>> = { blocks: '16x16', items: '16x16' };
  for (const { family, id, words } of rows) {
    const entry = info.get(id);
    if (entry === undefined) continue;
    const size = `${entry.width}x${entry.height}`;
    const named = /(\d+) by (\d+)/.exec(words);
    const expected = named === null ? familySize[family] : `${named[1]}x${named[2]}`;
    if (id.startsWith('particle_')) {
      if (size !== '8x8' || entry.frames !== 4)
        problems.push(`${id} is ${size} with ${entry.frames} frames`);
    } else if (id === 'effect_icon') {
      if (size !== '18x18') problems.push(`${id} is ${size}`);
    } else if (expected !== undefined && expected !== size) {
      problems.push(`${id} is ${size}, the prompt says ${expected}`);
    }
    const finish = /finish ([a-z_]+(?:, [a-z_]+)*(?: or [a-z_]+)?)/.exec(words);
    if (finish !== null) {
      const finishes = (finish[1] as string).split(/, | or /);
      if (JSON.stringify([...finishes].sort()) !== JSON.stringify([...entry.finishes].sort())) {
        problems.push(`${id} has the finishes ${entry.finishes.join(', ')}`);
      }
    }
    if (words.includes('second colour') && entry.colours !== 2)
      problems.push(`${id} takes one colour`);
  }
  return problems;
}

function checkSpeaking(facts: PromptFacts, sources: TruthSources): string[] {
  const problems: string[] = [];
  const modes = uiModesOf(sources.files[SOURCE_FILES.preferences] ?? '').map((mode) => mode.mode);
  if (modes.length === 0 || JSON.stringify(PROMPT_VIEWS) !== JSON.stringify(modes)) {
    problems.push('the View values are not the modes of UI_MODES');
  }
  const block = projectContextBlock({
    targetId: 'mc-26.3',
    mcVersion: '26.3',
    namespaces: ['demo'],
    kindCounts: { 'msm:item': 1 },
    hasModElement: true,
    pendingSummary: '',
    view: 'easy',
    modName: 'Ruby Mod',
    open: { name: 'Ruby Sword', id: 'demo:ruby_sword', kind: 'msm:item' },
  });
  for (const line of PROMPT_CONTEXT_LINES) {
    if (!block.split('\n').some((row) => row.startsWith(`${line} `))) {
      problems.push(`the context has no "${line}" line`);
    }
  }
  if (!block.includes('Open: Ruby Sword (demo:ruby_sword, msm:item)')) {
    problems.push('the Open line is not "name (id, kind)"');
  }
  if (!facts.text.includes('"name (id, kind)"'))
    problems.push('the prompt does not say the Open form');
  return problems;
}

// ---------------------------------------------------------------------------------------------
// What is not available.

/** A probe: why the thing exists after all, or `null` while it does not. */
type Probe = (sources: TruthSources) => string | null;

const kindOrComponent = (sources: TruthSources, pattern: RegExp): string | null => {
  const found = [...sources.kinds, ...componentKeys(sources.mcdoc)].find((id) => pattern.test(id));
  return found === undefined ? null : `${found} exists`;
};

const fieldLike = (sources: TruthSources, struct: string, pattern: RegExp): string | null => {
  const found = structFields(sources.mcdoc, struct).find((field) => pattern.test(field));
  return found === undefined ? null : `${struct} has the field ${found}`;
};

const valueLike = (sources: TruthSources, enumName: string, pattern: RegExp): string | null => {
  const found = enumValues(sources.mcdoc, enumName).find((value) => pattern.test(value));
  return found === undefined ? null : `${enumName} has "${found}"`;
};

const onlyFields = (
  sources: TruthSources,
  struct: string,
  allowed: readonly string[],
): string | null => {
  const fields = structFields(sources.mcdoc, struct);
  if (fields.length === 0) return `${struct} is gone from the mcdoc`;
  const extra = fields.filter((field) => !allowed.includes(field));
  return extra.length === 0 ? null : `${struct} has ${extra.join(', ')}`;
};

const onlyValues = (
  sources: TruthSources,
  enumName: string,
  allowed: readonly string[],
): string | null => {
  const values = enumValues(sources.mcdoc, enumName);
  if (values.length === 0) return `${enumName} is gone from the mcdoc`;
  const extra = values.filter((value) => !allowed.includes(value));
  return extra.length === 0 ? null : `${enumName} has ${extra.join(', ')}`;
};

const first = (...results: (string | null)[]): string | null =>
  results.find((result) => result !== null) ?? null;

const sourceSays = (sources: TruthSources, path: string, words: string): string | null =>
  (sources.files[path] ?? '').includes(words) ? null : `${path} no longer says "${words}"`;

const eventMembers = (sources: TruthSources, event: string): Record<string, ScriptApiNode> => {
  const type = (sources.scriptApi.events[event] as { type?: string } | undefined)?.type;
  return { ...(type === undefined ? {} : sources.scriptApi.types[type]?.members) };
};

/**
 * One probe per missing thing, keyed by the thing as `PROMPT_NOT_AVAILABLE` writes it, and the
 * claims F8 found false, kept so a restored sentence fails at once.
 */
const PROBES: Readonly<Record<string, Probe>> = {
  // F8 (a) to (c), kept as probes: each finds the thing.
  "boats of vanilla's kind": (s) => kindOrComponent(s, /^msm:boat$/),
  'block.place': (s) =>
    s.scriptApi.events['block.place'] === undefined ? null : 'the event block.place exists',
  'brewing an effect': (s) => kindOrComponent(s, /^msm:potion$/),
  // thrown-extras
  'a trident-like 3D model in flight': (s) =>
    first(fieldLike(s, 'Throwable', /model|geometry|render/), kindOrComponent(s, /trident/)),
  'a real return flight': (s) =>
    first(
      fieldLike(s, 'Throwable', /return|loyal/),
      onlyValues(s, 'AfterThrow', ['consume', 'keep', 'drop', 'return']),
      s.mcdoc.includes('(no return flight)')
        ? null
        : 'AfterThrow no longer says "(no return flight)"',
    ),
  'custom arrows': (s) =>
    first(kindOrComponent(s, /arrow|ammo/), fieldLike(s, 'RangedWeapon', /ammo|arrow|projectile/)),
  'instant effects': (s) => fieldLike(s, 'EffectCommon', /instant/),
  // wolf-sound-variants
  'wolf sound variants': (s) => kindOrComponent(s, /^minecraft:wolf_sound_variant$/),
  // script-damage-amount
  'changing a damage amount from a script': (s) => {
    for (const event of ['entity.hurt', 'entity.damaged']) {
      const members = eventMembers(s, event);
      if (Object.keys(members).length === 0) return `${event} has no type`;
      const setter = Object.entries(members).find(
        ([name, node]) => node.kind === 'method' && name !== 'cancel',
      );
      if (setter !== undefined) return `${event} has the method ${setter[0]}`;
    }
    return null;
  },
  // shelves
  shelves: (s) => first(valueLike(s, 'BlockType', /shel/), kindOrComponent(s, /shel/)),
  // container-screens
  'custom screens': (s) => kindOrComponent(s, /screen|gui|menu/),
  'custom slot layouts': (s) =>
    first(
      onlyValues(s, 'ContainerLayout', ['chest', 'hopper', 'dispenser', 'none']),
      fieldLike(s, 'Container', /slots|slot_/),
    ),
  'slot filters': (s) => fieldLike(s, 'Container', /filter|accept|allow/),
  // machine-extras
  'brewing stands': (s) =>
    first(valueLike(s, 'MachineMenu', /brew/), valueLike(s, 'ContainerLayout', /brew/)),
  'crafting grids': (s) =>
    first(valueLike(s, 'MachineMenu', /craft/), valueLike(s, 'ContainerLayout', /craft/)),
  'custom GUIs': (s) => kindOrComponent(s, /gui|screen/),
  'more than three machine slots': (s) => fieldLike(s, 'Machine', /slot|input|output/),
  'fluid tanks': (s) =>
    first(
      kindOrComponent(s, /tank/),
      fieldLike(s, 'Machine', /tank|fluid/),
      fieldLike(s, 'Container', /tank|fluid/),
    ),
  energy: (s) =>
    first(
      onlyValues(s, 'MachinePower', ['fuel', 'redstone', 'always']),
      kindOrComponent(s, /energy/),
    ),
  // mob-extras
  "vanilla's brain-driven behaviours (a warden's senses, a frog's tongue, a piglin's brain, sculk reactions)":
    (s) => valueLike(s, 'GoalType', /sculk|vibration|tongue|brain|sniff|sense|warden/),
  'a held bow or crossbow and its pose': (s) =>
    first(
      fieldLike(s, 'AnimatedModel', /hold|held|pose|arm/),
      fieldLike(s, 'RangedAttack', /hold|held|pose/),
    ),
  'baby or variant changes to the model rather than the texture': (s) =>
    first(
      onlyFields(s, 'EntityVariant', ['id', 'texture', 'weight', 'biomes']),
      fieldLike(s, 'Breedable', /model|geometry/),
    ),
  'a "geckolib" renderer on a target without GeckoLib': (s) =>
    s.mobProblemCodes.includes('entities.geckolib-renderer-target')
      ? null
      : 'the refusal entities.geckolib-renderer-target is gone',
  'Molang, easings and sound or particle keyframes in the built-in renderer': (s) =>
    first(
      sourceSays(s, SOURCE_FILES.geoAnimationReader, 'any other string is Molang, read as 0'),
      sourceSays(s, SOURCE_FILES.geoAnimationReader, 'Keyframe sound, particle and'),
      s.mcdoc.includes('lerp_mode?: ("linear" | "catmullrom")')
        ? null
        : 'Keyframe lerp_mode changed',
    ),
  'two triggered animations in one tick in the built-in renderer': (s) =>
    sourceSays(
      s,
      SOURCE_FILES.msmMob,
      "The body class's triggered animation accessor ({@code DATA_ANIM}",
    ),
  'pets that follow their owner while swimming': (s) => fieldLike(s, 'Tameable', /swim|water/),
  // fluid-extras
  'potion-like mixtures in a cauldron': (s) => onlyFields(s, 'FluidCauldron', ['levels']),
  'tanks and pipes': (s) => kindOrComponent(s, /tank|pipe/),
  'waterlogging by a project fluid': (s) =>
    first(
      /struct Waterloggable \{\}/.test(s.mcdoc) ? null : 'msm:waterloggable takes a fluid now',
      fieldLike(s, 'FluidCommon', /waterlog/),
    ),
  "a swim speed other than water's": (s) => fieldLike(s, 'FluidCommon', /swim|drag|speed|motion/),
  'fire spread, lava particles or random ticks from a lava-like fluid': (s) =>
    fieldLike(s, 'FluidCommon', /fire|particle|random|burn/),
  // sky-pictures
  "sky pictures of a dimension's own": (s) => {
    for (const target of s.targets) {
      const found = (target.worldgen.environmentAttributes ?? []).find((id) =>
        /texture|sprite|skybox|picture/.test(id),
      );
      if (found !== undefined) return `${target.mcVersion} has ${found}`;
    }
    return kindOrComponent(s, /sky/);
  },
};

/**
 * Every claim has a probe for each of its things and no probe finds the thing; every "not
 * available" of the text lies inside one of the claims' sentences.
 */
function checkAbsences(facts: PromptFacts, sources: TruthSources): string[] {
  const problems: string[] = [];
  for (const absence of facts.absences) {
    if (!facts.text.includes(absence.sentence))
      problems.push(`${absence.id}: its sentence is not in the prompt`);
    for (const thing of absence.things) {
      const probe = PROBES[thing];
      if (probe === undefined) {
        problems.push(`${absence.id}: "${thing}" has no probe; add one that fails when it exists`);
        continue;
      }
      const found = probe(sources);
      if (found !== null)
        problems.push(`${absence.id}: "${thing}" is said to be missing, but ${found}`);
    }
  }
  let rest = facts.text;
  for (const absence of facts.absences) rest = rest.split(absence.sentence).join('');
  for (const match of rest.matchAll(/[^.]*\bnot (?:yet )?available\b[^.]*\./gi)) {
    problems.push(`"${match[0].trim()}" is a "not available" outside PROMPT_NOT_AVAILABLE`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Counts.

/** A count in words or digits, as the prompt writes it. */
const COUNT_WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

const countOf = (word: string): number => {
  const index = COUNT_WORDS.indexOf(word.toLowerCase());
  return index >= 0 ? index : Number(word.replaceAll(',', ''));
};

/**
 * Every number the text writes before "kinds", "flows", "templates", "recipes", "triggers",
 * "steps" or "conditions" (up to two words between), with the source its number comes from;
 * `null` marks a phrase that counts nothing of the code.
 */
function countSources(sources: TruthSources): Readonly<Record<string, number | null>> {
  return {
    'eight more tag kinds': Object.keys(MORE_TAG_PROMPT_KINDS).length,
    'Four flows': VANILLA_PACK_FLOWS.length,
    'five flows': sources.starters.filter((starter) => starter.id.startsWith('world-')).length,
    '50 steps': sources.rulesLimits.steps,
    // "...adds to the mod as one step that Undo takes back": an undo step, not a Rules step.
    'one step': null,
    // "...shared by every rule on one subject and trigger".
    'one subject and trigger': null,
  };
}

function checkCounts(facts: PromptFacts, sources: TruthSources): string[] {
  const problems: string[] = [];
  const known = countSources(sources);
  const pattern = new RegExp(
    `\\b(${COUNT_WORDS.join('|')}|\\d[\\d,]*)((?: [a-z]+){0,2}) (kinds|flows|templates|recipes|triggers|steps|conditions)\\b`,
    'gi',
  );
  for (const match of facts.text.matchAll(pattern)) {
    const phrase = match[0];
    if (!(phrase in known)) {
      problems.push(`"${phrase}" is a count no constant produced: add its source here`);
      continue;
    }
    const expected = known[phrase];
    if (expected !== null && expected !== undefined && countOf(match[1] as string) !== expected) {
      problems.push(`"${phrase}": the code has ${expected}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// The cases.

describe('the prompt as a whole (ADR 0125 D2, D7)', () => {
  it('is one text for both run sizes', () => {
    expect(systemPrompt('chat')).toBe(systemPrompt('build'));
  });

  it('stays within its budget of 98,000 characters', () => {
    // The budget of ADR 0125 D7: raise it only with a line in ADR 0125 (raised from 96,000 by B617).
    expect(systemPrompt().length).toBeLessThanOrEqual(98_000);
  });
});

describe('the prompt against the code (ADR 0125 D7)', () => {
  const facts = promptFacts();
  const sources = truthSources();

  it('names kinds the plugin registry has, and lists every kind it quotes', () => {
    expect(checkKinds(facts, sources)).toEqual([]);
  });

  it('names templates the session library has', () => {
    expect(checkTemplates(facts, sources)).toEqual([]);
  });

  it("names flows by the library's ids and titles, with their parameters and answers", () => {
    expect(checkFlows(facts, sources)).toEqual([]);
    const picks = MAKE_WORLD_PICKS.map((pick) => pick.flowId);
    expect(picks).toEqual(Object.keys(WORLD_FLOW_ANSWERS));
  });

  it('names every Script API version, member and event with its release, both ways', () => {
    expect(checkScriptApi(facts, sources)).toEqual([]);
  });

  it("says what Try it is by @msm/sim and the Try it view, and both targets' commands", () => {
    expect(checkTryIt(facts, sources)).toEqual([]);
  });

  it("names the app's places and buttons by the components' labels", () => {
    expect(checkAppMap(sources)).toEqual([]);
  });

  it("quotes the live world map's labels as the app shows them", () => {
    expect(checkWorldMapLabels(facts, sourceOfDirs(WORLD_MAP_SOURCE_DIRS))).toEqual([]);
  });

  it('states the Rules limits of @msm/plugin-rules', () => {
    expect(checkRulesLimits(sources)).toEqual([]);
  });

  it('lists the drawn recipes with their sizes and finishes', () => {
    expect(checkTextures(sources)).toEqual([]);
  });

  it("explains the context's View, Mod and Open lines as projectContextBlock writes them", () => {
    expect(checkSpeaking(facts, sources)).toEqual([]);
  });

  it('claims something missing only where a probe finds it missing', () => {
    expect(checkAbsences(facts, sources)).toEqual([]);
  });

  it('writes no count of kinds, flows, templates, recipes, triggers, steps or conditions that no constant produced', () => {
    expect(checkCounts(facts, sources)).toEqual([]);
  });

  it('names only target-dependent things both targets have', () => {
    // "newer targets also list minecraft:visual/has_sky_occluder"; GeckoLib's facts per target.
    const occluder = sources.targets.map((target) =>
      (target.worldgen.environmentAttributes ?? []).includes('minecraft:visual/has_sky_occluder'),
    );
    expect(occluder).toContain(true);
    expect(occluder).toContain(false);
    for (const target of sources.targets) {
      for (const attribute of ['sky_color', 'fog_color', 'sun_angle'].map(
        (id) => `minecraft:visual/${id}`,
      )) {
        expect(
          target.worldgen.environmentAttributes ?? [],
          `${target.mcVersion} ${attribute}`,
        ).toContain(attribute);
      }
      expect(target.worldgen.environmentAttributes ?? []).toContain('minecraft:gameplay/bed_rule');
      // "the runtime's own keys are fire (R), second fire (V), horn (H) and descend (Left Alt)".
      expect(target.controls?.runtimeKeys, target.mcVersion).toMatchObject({
        fire: 'key.keyboard.r',
        second: 'key.keyboard.v',
        horn: 'key.keyboard.h',
        descend: 'key.keyboard.left.alt',
      });
    }
  });
});

describe('every prompt constant is pinned by a test of the app', () => {
  it('finds each exported prompt constant named in an app test', () => {
    const tests = readdirSync(new URL('./', import.meta.url))
      .filter((name) => name.endsWith('.test.ts'))
      .map((name) => readFileSync(new URL(name, import.meta.url), 'utf8'))
      .join('\n');
    const constants = Object.keys(ai).filter((name) =>
      /^(?:(?!PROMPT_PREFIX_)[A-Z0-9_]*PROMPT[A-Z0-9_]*|APP_MAP_[A-Z]+|[A-Z_]+_FLOW_ANSWERS|NEW_FLOW_PROMPT_IDS|VANILLA_PACK_FLOWS|PLAN_FIRST_ABOVE)$/.test(
        name,
      ),
    );
    expect(constants.length).toBeGreaterThan(30);
    const unpinned = constants.filter(
      (name) => !new RegExp(`\\b${name}\\b`).test(tests) && !POLICY_CONSTANTS.has(name),
    );
    expect(unpinned).toEqual([]);
  });
});

/**
 * Prompt constants that state a rule of the helper's own, not a fact of the code: nothing in the
 * app has a number to check them against.
 */
const POLICY_CONSTANTS: ReadonlySet<string> = new Set([
  // "up to three main things" is answered directly, more is planned first (ADR 0125 D2).
  'PLAN_FIRST_ABOVE',
]);

describe('the checks bite: one fact changed in a copy of a source fails its case', () => {
  const facts = promptFacts();
  const sources = truthSources();
  const withSources = (change: Partial<TruthSources>): TruthSources => ({ ...sources, ...change });

  it('a template id renamed in the library', () => {
    const templates = sources.templates.map((template) =>
      template.id === 'msm_rules_lucky_block'
        ? { ...template, id: 'msm_rules_lucky_box' }
        : template,
    );
    expect(checkTemplates(facts, withSources({ templates }))).toEqual([
      'the prompt names the template msm_rules_lucky_block, which the library does not have',
    ]);
  });

  it('a flow parameter renamed in the library', () => {
    const starters = sources.starters.map((starter) =>
      starter.id === 'bed'
        ? {
            ...starter,
            parameters: (starter.parameters ?? []).map((parameter) =>
              parameter.id === 'bed_name' ? { ...parameter, id: 'bed_title' } : parameter,
            ),
          }
        : starter,
    );
    expect(checkFlows(facts, withSources({ starters }))).toContain(
      'the flow bed has no parameter bed_name',
    );
    // An answer the flow does not offer, in the text of a copy.
    const text = facts.text.replace('kind "bed" or "sleeping_bag"', 'kind "bed" or "sleeping_mat"');
    expect(checkFlows({ ...facts, text }, sources)).toEqual([
      'the flow bed has no answer "sleeping_mat"',
    ]);
    // The mob presets as B682 wrote them: cube_creature is the merchant's, no mob flow offers it.
    const presets = facts.text.replace(
      'fish, flyer or biped, as the flow offers',
      'fish, flyer, biped or cube_creature, as the flow offers',
    );
    expect(checkFlows({ ...facts, text: presets }, sources)).toHaveLength(1);
  });

  it('a Script API event renamed in the JSON', () => {
    const scriptApi = copy(sources.scriptApi) as ScriptApiJson & {
      events: Record<string, ScriptApiNode>;
    };
    scriptApi.events['block.placed'] = scriptApi.events['block.place'] as ScriptApiNode;
    delete scriptApi.events['block.place'];
    const problems = checkScriptApi(facts, withSources({ scriptApi }));
    expect(problems).toContain('Script API 1.6 names block.place, which is no event');
    expect(problems).toContain('the event block.placed is in no paragraph of the prompt');
  });

  it('an app label changed in a copy of a component', () => {
    const files = { ...sources.files };
    files[SOURCE_FILES.thingsToFix] = (files[SOURCE_FILES.thingsToFix] ?? '').replaceAll(
      'Show me',
      'Show it',
    );
    expect(checkAppMap(withSources({ files }))).toEqual([
      `"Show me" is not in ${SOURCE_FILES.thingsToFix}`,
    ]);
    const tiles = { ...sources.files };
    tiles[SOURCE_FILES.drawButton] = (tiles[SOURCE_FILES.drawButton] ?? '').replace(
      "DRAW = 'Draw…'",
      "DRAW = 'Draw a picture…'",
    );
    expect(checkAppMap(withSources({ files: tiles }))).toEqual([
      `"Draw…" is not DRAW of ${SOURCE_FILES.drawButton} (Draw a picture…)`,
    ]);
  });

  it('the restored "Boats ... are not available" sentence', () => {
    const sentence =
      "Boats of vanilla's kind are not available: propose the closest version and call note_missing_feature.";
    // Restored in the text alone: the scan finds a "not available" outside the list.
    const text = facts.text.replace(
      'Shelves are not available',
      `${sentence} Shelves are not available`,
    );
    expect(checkAbsences({ ...facts, text }, sources)).toEqual([
      `"${sentence}" is a "not available" outside PROMPT_NOT_AVAILABLE`,
    ]);
    // Restored as an entry of the list: its probe finds msm:boat.
    const absences = [
      ...facts.absences,
      { id: 'boats', things: ["boats of vanilla's kind"], sentence },
    ];
    expect(checkAbsences({ ...facts, text, absences }, sources)).toEqual([
      `boats: "boats of vanilla's kind" is said to be missing, but msm:boat exists`,
    ]);
  });

  it('the Try it sentence that run_function is only said, as before B613', () => {
    const now =
      "an event's run_function action, so also a plain rule's run_function step, runs the project's function as the event's player, else its mob";
    expect(facts.text).toContain(now);
    const text = facts.text.replace(
      now,
      "an event's run_function action, so also a rule's run_function step, is only said",
    );
    expect(checkTryIt({ ...facts, text }, sources)).toEqual([
      'the prompt says Try it only says the run_function action; it runs it (SIM_ACTIONS)',
    ]);
  });

  it('a count the text writes by hand', () => {
    const text = facts.text.replace('eight more tag kinds', 'nine more tag kinds');
    expect(checkCounts({ ...facts, text }, sources)).toEqual([
      '"nine more tag kinds" is a count no constant produced: add its source here',
    ]);
  });

  it('a kind dropped from the registry, a missing Rules limit and a Try it number', () => {
    expect(
      checkKinds(
        facts,
        withSources({ kinds: sources.kinds.filter((kind) => kind !== 'msm:fluid') }),
      ),
    ).toContain('the prompt names the kind msm:fluid, which has no plugin');
    expect(
      checkRulesLimits(withSources({ rulesLimits: { ...sources.rulesLimits, steps: 40 } })),
    ).toEqual(['the Rules limit steps is 50 in the prompt']);
    expect(checkTryIt(facts, withSources({ tryIt: { ...sources.tryIt, tickCap: 5000 } }))).toEqual([
      'the tick cap (TICK_COMMAND_CAP): the prompt says 10000, the code 5000',
    ]);
  });
});
