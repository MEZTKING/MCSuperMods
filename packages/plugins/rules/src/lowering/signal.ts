/**
 * The function bridge's files (ADR 0115 D5), lowered by the one rule book the expander chose
 * (`generated_signal` on its expanded copy):
 *
 * - the signal command `msm/<ns>/command/msm_signal.json` (layer `msm`): `/msm_signal_<ns>`,
 *   permission 2, one `word` argument `signal`, no function and no event (its Script API
 *   `command` event fires the rules);
 * - for each signal, the function `<subject ns>:msm_rules/signal/<kind>/<path>/<hook>[/<phase>]`
 *   (layer `datapack`) whose one line sends the signal's word (for one phase of a one block,
 *   only `execute if score` it is in that phase), and the games kind's hook tag
 *   `#<subject ns>:msm_games/<kind>/<path>/<hook>` holding it as an optional entry
 *   (`merge: 'tag'`, schema `tag:function`), merged with the empty hook tag B552 writes.
 *
 * In a vanilla pack the game skips the function (it runs a command only the jar adds), and the
 * optional entry keeps the games kind's tag loading.
 */
import type { Json, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import type { SignalName } from '../catalogue';
import {
  commandForm,
  fillForm,
  oneBlockObjective,
  oneBlockPhaseHolder,
  piecesText,
  SIGNAL_ARGUMENT,
  SIGNAL_COMMAND_PATH,
  SIGNAL_PERMISSION,
  type Signal,
  signalFunctionId,
  signalLiteral,
  signalTagId,
  signalWord,
} from '../compile/games';

/**
 * The field of an expanded rule book's copy that holds the function bridge: written by the
 * expander only on one book, never saved, hidden in the editor.
 */
export const RULES_SIGNAL_FIELD = 'generated_signal';

/** The schema of function tag files, shared with the games kinds' empty tags. */
export const FUNCTION_TAG_SCHEMA = 'tag:function';

const SIGNAL_NAMES: ReadonlySet<string> = new Set<SignalName>(['enter', 'leave', 'end', 'break']);

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The bridge on an expanded book's copy, or undefined. */
export function generatedSignals(data: Json): { namespace: string; signals: Signal[] } | undefined {
  if (!isObject(data)) return undefined;
  const field = data[RULES_SIGNAL_FIELD];
  if (!isObject(field) || typeof field.namespace !== 'string') return undefined;
  const signals: Signal[] = [];
  for (const entry of Array.isArray(field.signals) ? field.signals : []) {
    if (!isObject(entry) || typeof entry.subject !== 'string') continue;
    if (typeof entry.on !== 'string' || !SIGNAL_NAMES.has(entry.on)) continue;
    const phase = typeof entry.phase === 'number' ? entry.phase : undefined;
    signals.push({
      subject: entry.subject,
      on: entry.on as SignalName,
      ...(phase === undefined ? {} : { phase }),
    });
  }
  return { namespace: field.namespace, signals };
}

/**
 * What the bridge on an expanded book's copy adds to the project (B557 follow-up): the functions
 * it lowers (`function`, for the registry view, as the games kinds' hook tags name them) and the
 * signal command's literal (`command`, for the mcfunction checker, which knows only vanilla's
 * commands). Read from the expander's own output, so the host keeps no list of its own; empty
 * lists for a book without the bridge. Sorted, without duplicates.
 */
export function rulesGeneratedIds(data: Json): { function: string[]; command: string[] } {
  const bridge = generatedSignals(data);
  if (bridge === undefined || bridge.signals.length === 0) return { function: [], command: [] };
  return {
    function: [...new Set(bridge.signals.map(signalFunctionId))].sort(),
    command: [signalLiteral(bridge.namespace)],
  };
}

const split = (id: string): { namespace: string; path: string } => {
  const colon = id.indexOf(':');
  return { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
};

/** The bridge's files for one book's copy; none without `generated_signal`. */
export function lowerSignals(data: Json, target: TargetFacts): OutputFile[] {
  const bridge = generatedSignals(data);
  if (bridge === undefined || bridge.signals.length === 0) return [];
  const literal = signalLiteral(bridge.namespace);
  const files: OutputFile[] = [
    {
      path: `msm/${bridge.namespace}/command/${SIGNAL_COMMAND_PATH}.json`,
      contents: {
        arguments: [{ name: SIGNAL_ARGUMENT, type: 'word' }],
        format: 1,
        name: literal,
        permission: SIGNAL_PERMISSION,
      },
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.commandDefinition,
    },
  ];
  const { function: functionFolder, tags } = target.folders.data;
  for (const signal of bridge.signals) {
    const fn = split(signalFunctionId(signal));
    const tag = split(signalTagId(signal));
    let line = `${literal} ${signalWord(signal)}`;
    if (signal.phase !== undefined) {
      // One phase of a one block: its phase holder counts from 0 (B552).
      const form = commandForm(target, 'if_score_run');
      const pieces =
        form === undefined
          ? undefined
          : fillForm(form, {
              holder: { text: oneBlockPhaseHolder(signal.subject) },
              objective: { text: oneBlockObjective(signal.subject) },
              range: { text: String(signal.phase - 1) },
              command: { text: line },
            });
      const text = pieces === undefined ? undefined : piecesText(pieces);
      if (text === undefined) continue;
      line = text;
    }
    files.push(
      {
        path: `data/${fn.namespace}/${functionFolder}/${fn.path}.mcfunction`,
        contents: new TextEncoder().encode(`${line}\n`),
        layer: 'datapack',
        language: 'mcfunction',
      },
      {
        path: `data/${tag.namespace}/${tags}/${functionFolder}/${tag.path}.json`,
        contents: { values: [{ id: signalFunctionId(signal), required: false }] },
        layer: 'datapack',
        schema: FUNCTION_TAG_SCHEMA,
        merge: 'tag',
      },
    );
  }
  return files;
}
