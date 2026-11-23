/**
 * Names of the instances and servers MSM makes (ADR 0133 D2).
 *
 * - `MCSuperMods Test (<mc>)`: the test instance, unchanged (`managedInstanceName`);
 * - `MCSuperMods Plain (<mc>)`: no loader, for games and maps that play without mods;
 * - `MCSuperMods Pack <name> (<mc>)`: one per modpack;
 * - `MCSuperMods Map <name> (<mc>)`: one per map that needs its mod;
 * - `MCSuperMods Server <namespace> (<mc>)`: a local server folder (B762).
 *
 * The taken-name rule: when a folder of that name is not the one the recipe wants (a folder
 * without MSM's marker, or MSM's folder for something else), the name gets `-2`, `-3` and so
 * on, up to {@link MAX_NAME_SUFFIX}.
 */

import { managedInstanceName } from '../fabric/instance';
import { isSafeSegment } from '../launchers/paths';
import type { InstanceRole } from './recipe';

/** The highest suffix the taken-name rule tries. */
export const MAX_NAME_SUFFIX = 99;

/** The longest owner label kept in a folder name. */
export const MAX_OWNER_LABEL = 48;

/** Whether an owner (a modpack's or map's name, a namespace) can be named at all. */
export function isSafeOwner(owner: string): boolean {
  return ownerLabel(owner) !== '' && owner.length <= 256;
}

/**
 * An owner's name as it may stand in a folder name on every system: control characters and
 * `<>:"/\|?*` become `-`, runs of spaces and dashes are kept short, leading and trailing dots,
 * dashes and spaces go, and the result is cut to {@link MAX_OWNER_LABEL} characters. An owner made of
 * nothing usable gives `''`.
 */
export function ownerLabel(owner: string): string {
  return (
    owner
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is removed
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-{2,}/g, '-')
      .replace(/^[\s.-]+|[\s.-]+$/g, '')
      .slice(0, MAX_OWNER_LABEL)
      .replace(/[\s.-]+$/g, '')
  );
}

/** The base folder name of a managed instance before the taken-name rule. */
export function instanceBaseName(
  role: InstanceRole,
  mcVersion: string,
  owner: string | null,
): string {
  // `managedInstanceName` checks the version for every role.
  const test = managedInstanceName(mcVersion);
  switch (role) {
    case 'test':
      return test;
    case 'plain':
      return `MCSuperMods Plain (${mcVersion})`;
    case 'pack':
    case 'map': {
      const label = ownerLabel(owner ?? '');
      if (label === '') throw new Error('A modpack or map instance needs a name.');
      return `MCSuperMods ${role === 'pack' ? 'Pack' : 'Map'} ${label} (${mcVersion})`;
    }
  }
}

/** The base folder name of a local server before the taken-name rule. */
export function serverBaseName(owner: string, mcVersion: string): string {
  managedInstanceName(mcVersion);
  const label = ownerLabel(owner);
  if (label === '') throw new Error('A server needs a name.');
  return `MCSuperMods Server ${label} (${mcVersion})`;
}

/** The `n`th candidate for `base`: `base` itself for 1, then `base-2`, `base-3`… */
export function candidateName(base: string, n: number): string {
  return n <= 1 ? base : `${base}-${n}`;
}

/**
 * The suffix of `name` as a candidate for `base` (1 for `base` itself), compared without
 * case (Windows folders), or `null` when it is not one.
 */
export function candidateSuffix(base: string, name: string): number | null {
  const lowerBase = base.toLowerCase();
  const lower = name.toLowerCase();
  if (lower === lowerBase) return 1;
  if (!lower.startsWith(`${lowerBase}-`)) return null;
  const rest = lower.slice(lowerBase.length + 1);
  if (!/^[1-9][0-9]?$/.test(rest)) return null;
  const n = Number(rest);
  return n >= 2 && n <= MAX_NAME_SUFFIX ? n : null;
}

/** Whether `name` is a folder name MSM may make. */
export function isMadeName(name: string): boolean {
  return isSafeSegment(name) && !name.startsWith('.') && !/[\s.]$/.test(name);
}
