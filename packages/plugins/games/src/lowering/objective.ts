/**
 * Lowering of `msm:objective` (ADR 0113 D5): one load function,
 * `<ns>:msm_games/objective/<path>/load`, that makes the objective `<ns>.<path>` if it is missing
 * (`scoreboard objectives add` fails harmlessly when it exists, B547 Y10), then sets its display
 * name, render type, number format and display slot on every load. MSM never removes an
 * objective (limit M7).
 */
import type { Element, Json, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import {
  fillForm,
  isRecord,
  objectiveName,
  type SharedContribution,
  sharedFunctionFiles,
  splitId,
  str,
  textComponent,
} from './shared-functions';

/**
 * The number format words of `numberformat`: `blank`, `fixed <text>` or `styled <style>`; undefined
 * when the objective has none or it is malformed.
 */
export function numberFormatText(value: Json | undefined): string | undefined {
  if (!isRecord(value)) return undefined;
  switch (value.type) {
    case 'blank':
      return 'blank';
    case 'fixed':
      return `fixed ${textComponent(str(value.text, ''))}`;
    case 'styled': {
      const style: JsonObject = {};
      if (typeof value.colour === 'string') style.color = value.colour;
      if (typeof value.bold === 'boolean') style.bold = value.bold;
      if (typeof value.italic === 'boolean') style.italic = value.italic;
      return `styled ${JSON.stringify(style)}`;
    }
    default:
      return undefined;
  }
}

/** The commands that make and set up an objective. */
export function objectiveLoadLines(element: Element, target: TargetFacts): string[] {
  const data = isRecord(element.data) ? element.data : {};
  const objective = objectiveName(element.id);
  const name = textComponent(str(data.name, objective));
  const lines = [
    fillForm(target, 'objective_add', {
      objective,
      criterion: str(data.criterion, 'dummy'),
      display_name: name,
    }),
    fillForm(target, 'objective_display_name', { objective, text: name }),
    fillForm(target, 'objective_render_type', {
      objective,
      render_type: str(data.render, 'integer'),
    }),
  ];
  const format = numberFormatText(data.number_format);
  if (format !== undefined) {
    lines.push(fillForm(target, 'objective_number_format', { objective, number_format: format }));
  }
  const display = str(data.display, 'none');
  if (display !== 'none') {
    lines.push(fillForm(target, 'objective_display', { slot: display, objective }));
  }
  return lines;
}

/** Lowers an objective to its load function and the tag entries that run it. */
export function lowerObjective(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitId(element.id);
  const contributions: SharedContribution[] = [
    { phase: 'load', path: `objective/${path}/load`, lines: objectiveLoadLines(element, target) },
  ];
  return sharedFunctionFiles(target, namespace, contributions);
}
