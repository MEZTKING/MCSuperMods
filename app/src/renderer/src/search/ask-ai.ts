/**
 * The Ask the AI helper row (ADR 0124 D12; B669): the user's words go to the helper as a message
 * waiting in its input, with a hints block of at most five lines, and nothing is sent until the
 * user presses Send.
 *
 * - **A mod open:** the helper's panel opens with the words as the message and the hints as its
 *   context block (`AiController.prefillMessage`).
 * - **No mod open:** New project with the AI helper, with the words as its description and the
 *   hints beside them (the host's `newProjectWithAi`; the App wires it, B667).
 * - **No key, or no helper:** nothing opens; the outcome carries the one quiet line the panel
 *   shows (D12: without a key nothing about the helper is shown but that line).
 *
 * AI helper 2 (ADR 0125 D2) removed the Chat and Build modes: the run's size is chosen when the
 * user sends, so there is no "Build mode" to open the helper in.
 *
 * **The hints** are the library ids of the top results (flows, starters, templates, examples,
 * kinds, Rules parts and vanilla ids) and the answers the search understood from the words.
 * Never a title (a vanilla title may be a name read from the user's jar), never a thing of the
 * open mod (its elements, rules or Things to fix), never an answer naming one of the mod's ids.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import type { SearchHit } from '@msm/search';
import type { AiKeyStatus } from '../../../shared/platform';
import type { SearchActionDescriptor } from './sources/shared';

/** A context block waiting in the helper's input (the shape of the controller's `AiContextDraft`). */
export interface AskAiContext {
  /** The chip's label. */
  label: string;
  /** The block sent with the message. */
  block: string;
}

/** The helper's input as `askAi` fills it (the shape of the controller's `AiDraft`). */
export interface AskAiDraft {
  text: string;
  context: AskAiContext | null;
}

/** The most lines of the hints block, its lead line included (D12). */
export const MAX_HINT_LINES = 5;

/** The most characters of one hint line. */
export const MAX_HINT_LINE_CHARS = 240;

/** The lead line of the hints block. */
export const HINTS_LEAD =
  "The app's search matched these, best first (library ids and the answers it read from the words):";

/** The chip above the hints block (plain words: it is shown in every view mode). */
export const HINTS_CHIP = 'What the search found';

/** The one quiet line when the helper has no key (D12). */
export const NO_KEY_LINE = 'The AI helper can answer this once it has a key: add one in Settings.';

/** The line when this app has no AI helper at all. */
export const NO_HELPER_LINE = 'The AI helper is not available here.';

/** What of the AI controller `askAi` uses (the real `AiController`, or a fake in tests). */
export interface AskAiController {
  /** The open mod's root, or `null`. */
  readonly root: string | null;
  /** Reads the key status (`null` when main has no helper). */
  refreshKey(): Promise<AiKeyStatus | null>;
  /** Opens the panel with the message and the context block waiting; sends nothing. */
  prefillMessage(text: string, context: AskAiContext | null): boolean;
}

/** What `askAi` needs of the app. */
export interface AskAiHost {
  /** The AI helper's controller, or `null` when the app has none. */
  readonly controller: AskAiController | null;
  /**
   * With no mod open: New project with the AI helper, its description filled with the words and
   * the hints kept for the first message; nothing is made or sent until the user says so.
   */
  newProjectWithAi(draft: AskAiDraft): void;
}

/** What asking did. */
export type AskAiOutcome =
  /** The helper's panel waits with the words (`panel`), or New project with the AI helper (`new-project`). */
  | { readonly status: 'opened'; readonly where: 'panel' | 'new-project' }
  /** Nothing opened; the panel shows `line`, quietly. */
  | {
      readonly status: 'unavailable';
      readonly reason: 'no-key' | 'no-helper';
      readonly line: string;
    };

/** Sources whose ids are the library's or the game's, never the mod's. */
const HINT_SOURCES: ReadonlySet<string> = new Set([
  'flow',
  'starter',
  'template',
  'example',
  'kind',
  'rule',
  'vanilla',
  'tile',
]);

const RESOURCE_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/** An answer value as hint text, or `null` when it may name a thing of the mod. */
function hintValue(value: Json): string | null {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    // An id outside the game's namespace is a thing of the mod: left out.
    if (RESOURCE_ID.test(value) && !value.startsWith('minecraft:')) return null;
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const parts = value.map(hintValue);
    return parts.every((part) => part !== null) ? `[${parts.join(', ')}]` : null;
  }
  return null;
}

/** The answers of a hit as `question value` pairs (the ones that may be shown). */
function answerText(answers: Readonly<Record<string, Json>> | undefined): string {
  if (answers === undefined) return '';
  const out: string[] = [];
  for (const question of Object.keys(answers).sort()) {
    const value = hintValue(answers[question] as Json);
    if (value !== null) out.push(`${question} ${value}`);
  }
  return out.join(', ');
}

/** One hit's line, or `null` when it is not a library or game thing. */
function hintLine(hit: SearchHit): string | null {
  const { entry } = hit;
  if (!HINT_SOURCES.has(entry.source)) return null;
  const action = entry.action as SearchActionDescriptor;
  let line: string;
  switch (action.type) {
    case 'flow':
    case 'starter': {
      const answers = answerText({ ...(action.values ?? {}), ...(hit.answers ?? {}) });
      line = `- ${action.type} ${action.starter} (add_starter)${answers === '' ? '' : `: ${answers}`}`;
      break;
    }
    case 'flows':
      line = `- flows ${[...action.flows, ...(action.starters ?? [])].join(', ')}`;
      break;
    case 'template':
      line = `- template ${action.template} (${action.kind})`;
      break;
    case 'example':
      line = `- example ${action.example}`;
      break;
    case 'kind':
      line = `- kind ${action.kind}`;
      break;
    case 'rule-part':
      line = `- rule ${action.part} ${action.id}`;
      break;
    case 'vanilla':
      line = `- vanilla ${action.sort} ${action.id}`;
      break;
    default:
      return null;
  }
  return line.length > MAX_HINT_LINE_CHARS ? `${line.slice(0, MAX_HINT_LINE_CHARS - 1)}…` : line;
}

/**
 * The hints block of the top hits: a lead line and at most four lines of library ids and
 * understood answers, one per distinct thing; `null` when no hit is a library or game thing.
 */
export function askAiHints(hits: readonly SearchHit[]): string | null {
  const lines: string[] = [];
  for (const hit of hits) {
    if (lines.length >= MAX_HINT_LINES - 1) break;
    const line = hintLine(hit);
    if (line !== null && !lines.includes(line)) lines.push(line);
  }
  return lines.length === 0 ? null : [HINTS_LEAD, ...lines].join('\n');
}

/**
 * **Ask the AI helper** with the words of a search and its hits (ADR 0124 D12). Opens the helper
 * with the words waiting as the message and the hints beside them, or New project with the AI
 * helper when no mod is open; never sends. Without a key (or a helper) nothing opens and the
 * outcome carries the quiet line to show.
 */
export async function askAi(
  query: string,
  hits: readonly SearchHit[],
  host: AskAiHost,
): Promise<AskAiOutcome> {
  const controller = host.controller;
  if (controller === null) {
    return { status: 'unavailable', reason: 'no-helper', line: NO_HELPER_LINE };
  }
  let key: AiKeyStatus | null = null;
  try {
    key = await controller.refreshKey();
  } catch {
    key = null;
  }
  if (key === null) return { status: 'unavailable', reason: 'no-helper', line: NO_HELPER_LINE };
  if (!key.set) return { status: 'unavailable', reason: 'no-key', line: NO_KEY_LINE };
  const text = query.trim();
  const hints = askAiHints(hits);
  const context: AskAiContext | null = hints === null ? null : { label: HINTS_CHIP, block: hints };
  if (controller.root !== null && controller.prefillMessage(text, context)) {
    return { status: 'opened', where: 'panel' };
  }
  host.newProjectWithAi({ text, context });
  return { status: 'opened', where: 'new-project' };
}
