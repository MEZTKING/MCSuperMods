/**
 * The line reader of the Function editor's gutter (B613): `@msm/sim`'s `lineSupport` and
 * `compileLine`, which read a line without running it. Loaded on demand by `use-line-marks.ts`,
 * so the simulation's command reader stays out of the first-paint bundle.
 *
 * @packageDocumentation
 */

import { compileLine, lineSupport } from '@msm/sim';
import { type LineMark, type LineReader, lineMarks } from './line-marks';

/** `@msm/sim`'s reading of a line. */
export const SIM_LINE_READER: LineReader = {
  support: lineSupport,
  kind(line) {
    const compiled = compileLine(line);
    return compiled.ok ? null : compiled.kind;
  },
};

/** The marks of a function's lines, as Try it reads them. */
export function markLines(lines: readonly string[]): LineMark[] {
  return lineMarks(lines, SIM_LINE_READER);
}
