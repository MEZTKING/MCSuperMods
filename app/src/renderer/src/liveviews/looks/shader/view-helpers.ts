/**
 * Helpers shared by the shader and post effect views (B629): the 150 ms settle, the version a
 * project is for, and plain lines for missing files and stand-in values.
 */

import { useEffect, useState } from 'react';
import { LIVE_VIEW_DEBOUNCE_MS } from '../../frame/live-data';
import { STAND_IN_WORDS } from './program';
import type { PreparedStage } from './sources';

/** The value after it has stopped changing for 150 ms. */
export function useSettled<T>(value: T): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const timer = setTimeout(() => setSettled(value), LIVE_VIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, settled]);
  return settled;
}

/** A file that could not be read, in plain words. */
export function missingWords(
  stage: Extract<PreparedStage, { ok: false }>,
  version: string,
): string {
  if (stage.file.reason === 'not_set_up') {
    return `${stage.id} is one of Minecraft’s files; set up your Minecraft folder to check it.`;
  }
  return stage.id.startsWith('minecraft:')
    ? `There is no ${stage.file.path} in your project or in Minecraft ${version}’s files.`
    : `There is no ${stage.file.path} in your project.`;
}

/** The version a project is for: its first target id without `mc-`. */
export function versionOf(targets: readonly string[]): string {
  return (targets[0] ?? 'mc-?').replace(/^mc-/, '');
}

/** Plain lines for the stand-in values used. */
export function standInLines(names: readonly string[]): string[] {
  if (names.length === 0) return [];
  return [
    `Values the game fills while playing are MSM’s here: ${names
      .map((name) => `${name} ${STAND_IN_WORDS[name] ?? ''}`.trim())
      .join('; ')}.`,
  ];
}
