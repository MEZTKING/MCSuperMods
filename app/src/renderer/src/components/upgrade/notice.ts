/**
 * What the newer-Minecraft notice needs before any report (ADR 0136 D5, B817): which built-in
 * target a mod could move to, and the per-mod **Not now** memory in `.msm/upgrade-notice.json`.
 * Pure but for the memory's reads and writes; no DOM, no version named here (every version comes
 * from the targets' facts).
 *
 * - A target is newer than the mod's when following its `previous` reaches the mod's target.
 * - Only release targets are announced, unless the setting **Tell me about test versions of
 *   Minecraft** is on; then snapshot and pre-release targets are announced too.
 * - Of several newer targets, the one furthest along the chain is announced.
 *
 * @packageDocumentation
 */

import type { TargetFacts } from '@msm/plugin-api';

/** The file that remembers **Not now**, per target, for this mod. */
export const UPGRADE_NOTICE_FILE = '.msm/upgrade-notice.json';

/** A target's facts with the `previous` a built-in target carries (`Target.previous`). */
type ChainedFacts = TargetFacts & { readonly previous?: unknown };

/** Whether `target` is a test version of Minecraft (a snapshot or a pre-release). */
export function isTestVersion(target: TargetFacts): boolean {
  return target.channel !== 'release';
}

/**
 * How many steps of `previous` lead from `target` back to `fromId`, or `undefined` when they
 * never do (a loop or an unknown id ends the walk).
 */
export function stepsBack(
  target: TargetFacts,
  fromId: string,
  targets: readonly TargetFacts[],
): number | undefined {
  const byId = new Map(targets.map((entry) => [entry.id, entry as ChainedFacts]));
  const seen = new Set<string>([target.id]);
  let at: ChainedFacts | undefined = target as ChainedFacts;
  let steps = 0;
  while (at !== undefined) {
    const previous = at.previous;
    if (typeof previous !== 'string' || seen.has(previous)) return undefined;
    steps += 1;
    if (previous === fromId) return steps;
    seen.add(previous);
    at = byId.get(previous);
  }
  return undefined;
}

/**
 * The built-in target a mod made for `currentId` could move to and should be told about, or
 * `null`: a target whose `previous` chain reaches `currentId`, a release unless `testVersions`
 * is on, the furthest along the chain first (the list's order breaks a tie).
 */
export function newerTargetFor(
  currentId: string,
  targets: readonly TargetFacts[],
  testVersions: boolean,
): TargetFacts | null {
  let best: { target: TargetFacts; steps: number } | null = null;
  for (const target of targets) {
    if (target.id === currentId) continue;
    if (!testVersions && isTestVersion(target)) continue;
    const steps = stepsBack(target, currentId, targets);
    if (steps === undefined) continue;
    if (best === null || steps > best.steps) best = { target, steps };
  }
  return best?.target ?? null;
}

/** The part of a project file system the memory uses. */
export interface NoticeFileSystem {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  mkdirp(path: string): Promise<void>;
}

/** The target ids this mod said **Not now** to; empty when none or unreadable. */
export async function readNotNow(fs: NoticeFileSystem): Promise<string[]> {
  try {
    if (!(await fs.exists(UPGRADE_NOTICE_FILE))) return [];
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(await fs.readFile(UPGRADE_NOTICE_FILE)),
    );
    const list =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { notNow?: unknown }).notNow
        : undefined;
    return Array.isArray(list)
      ? list.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Remembers **Not now** for `targetId` in this mod (sorted, no repeats, 2-space JSON); returns
 * the whole list.
 */
export async function rememberNotNow(fs: NoticeFileSystem, targetId: string): Promise<string[]> {
  const list = [...new Set([...(await readNotNow(fs)), targetId])].sort();
  const dir = UPGRADE_NOTICE_FILE.slice(0, UPGRADE_NOTICE_FILE.lastIndexOf('/'));
  await fs.mkdirp(dir);
  await fs.writeFile(
    UPGRADE_NOTICE_FILE,
    new TextEncoder().encode(`${JSON.stringify({ notNow: list }, null, 2)}\n`),
  );
  return list;
}
