/**
 * Modpacks when a mod moves to another Minecraft version (ADR 0136 D9, B821). A modpack lists
 * its member projects by folder and pins extra mods from Modrinth for one Minecraft version
 * (ADR 0046), so moving a member asks two things of each modpack holding it: whether each pinned
 * mod has a build for the new version (one batched Modrinth call, only on **Check my mods**),
 * and whether the pack moves with the mod or stays on the old version.
 *
 * Pure but for {@link modpacksWithProject} (local reads) and {@link replayModpackRepins} (the
 * writes, handed in). The pack's new file rides on the move's undo step as a
 * {@link MODPACK_REPIN_EFFECT} command effect (ADR 0045's mechanism): written on the move and on
 * redo, put back on undo. What is left for the user becomes part 3 items of the report, ticked by
 * hand in After moving. No sentence here names a version: versions come from the targets.
 *
 * @packageDocumentation
 */

import type {
  CommandEffect,
  CommandEvent,
  Modpack,
  ModpackMod,
  UpgradeReport,
  UpgradeTodoItem,
} from '@msm/core';
import type { ModpackView, ModrinthModUpdate, PlatformAdapter } from '../../../shared/platform';

/** The modpack service as the upgrade part uses it. */
export type ModpackUpgradeService = Pick<
  NonNullable<PlatformAdapter['modpacks']>,
  'list' | 'read' | 'checkMods' | 'write'
>;

/** Problem codes of the report items this module makes. */
export const ModpackUpgradeCodes = {
  /** A pinned mod has no build for the new version; the user chose to wait. */
  noBuild: 'modpack.mod-no-build',
  /** A pinned mod could not be checked (not asked yet, or Modrinth could not be reached). */
  notChecked: 'modpack.mod-not-checked',
  /** The pack stays on the old version, so the moved mod no longer fits it. */
  keptOnOld: 'modpack.kept-on-old',
} as const;

/** The command effect type of a modpack file written with the move (ADR 0045). */
export const MODPACK_REPIN_EFFECT = 'app.modpack-repin';

/** The `data` of a {@link MODPACK_REPIN_EFFECT} effect. */
export interface ModpackRepinData {
  /** The modpack folder (absolute, remembered in the Modpacks list). */
  root: string;
  /** The file as it was (written back on undo). */
  before: Modpack;
  /** The file after the move (written on the move and on redo). */
  after: Modpack;
}

/** A folder path compared without its separators' kind, a trailing slash or (on drives) case. */
function folderKey(path: string): string {
  const slashed = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[A-Za-z]:\//.test(slashed) ? slashed.toLowerCase() : slashed;
}

/** Whether two absolute folders are the same one. */
export function sameFolder(a: string, b: string): boolean {
  return folderKey(a) === folderKey(b);
}

/**
 * The remembered modpacks that list the project in `projectRoot` (local files only; no
 * network). A modpack that cannot be read is left out.
 */
export async function modpacksWithProject(
  modpacks: Pick<ModpackUpgradeService, 'list' | 'read'>,
  projectRoot: string,
): Promise<ModpackView[]> {
  const found: ModpackView[] = [];
  for (const entry of await modpacks.list()) {
    if (!entry.found) continue;
    try {
      const view = await modpacks.read(entry.root);
      if (view.members.some((member) => member.found && sameFolder(member.root, projectRoot))) {
        found.push(view);
      }
    } catch {
      // Unreadable since it was listed: not this mod's concern here.
    }
  }
  return found;
}

/** One pinned mod and what Modrinth said about it. */
export type ModRow =
  /** A build exists; `next` is its pin (the same as `mod` when the pinned build already fits). */
  | { status: 'build'; mod: ModpackMod; next: ModpackMod; versionNumber: string; same: boolean }
  /** No build for the new version. */
  | { status: 'none'; mod: ModpackMod }
  /** Not asked yet, or Modrinth could not be reached. */
  | { status: 'unchecked'; mod: ModpackMod };

/**
 * The rows of `mods` from Modrinth's answer; `null` (not asked, or the call failed) leaves
 * every mod unchecked.
 */
export function modRows(
  mods: readonly ModpackMod[],
  updates: readonly ModrinthModUpdate[] | null,
): ModRow[] {
  if (updates === null) return mods.map((mod) => ({ status: 'unchecked', mod }));
  const byHash = new Map(updates.map((update) => [update.from.toLowerCase(), update]));
  return mods.map((mod): ModRow => {
    const update = byHash.get(mod.sha1.toLowerCase());
    if (update === undefined) return { status: 'none', mod };
    const same = update.file.versionId === mod.versionId && update.file.sha1 === mod.sha1;
    return {
      status: 'build',
      mod,
      next: same ? mod : { ...update.file, title: mod.title },
      versionNumber: update.versionNumber,
      same,
    };
  });
}

/** The SHA-1s one check sends for `views`, each once. */
export function pinnedHashes(views: readonly ModpackView[]): string[] {
  return [
    ...new Set(views.flatMap((view) => view.modpack.mods.map((mod) => mod.sha1.toLowerCase()))),
  ];
}

/** What the user chose for one pack. */
export interface PackChoices {
  /** Keep the pack on the old version (it is not changed; the moved mod no longer fits it). */
  keepOnOld: boolean;
  /** Project ids of mods without a build to take out of the pack (the rest wait). */
  remove: ReadonlySet<string>;
}

/** The other members of `view` still made for `fromTargetId`. */
export function otherMembersOn(
  view: ModpackView,
  projectRoot: string,
  fromTargetId: string,
): string[] {
  return view.members
    .filter(
      (member) =>
        member.found && member.targetId === fromTargetId && !sameFolder(member.root, projectRoot),
    )
    .map((member) => member.name ?? member.path);
}

/**
 * The first choice for a pack: it moves with the mod unless other members are still made for
 * the old version (moving it would leave them out); nothing is removed.
 */
export function defaultPackChoices(
  view: ModpackView,
  projectRoot: string,
  fromTargetId: string,
): PackChoices {
  return {
    keepOnOld: otherMembersOn(view, projectRoot, fromTargetId).length > 0,
    remove: new Set(),
  };
}

/** What happens to one pack when the mod moves. */
export interface PackMove {
  root: string;
  name: string;
  /** The pack's file now. */
  before: Modpack;
  /** The pack's file after the move; `null` when the pack is not changed. */
  after: Modpack | null;
  /** Mods pinned to a new build. */
  repinned: ModpackMod[];
  /** Mods taken out (no build, the user chose to remove them). */
  removed: ModpackMod[];
  /** Mods with no build left in the pack to wait for one. */
  waiting: ModpackMod[];
  /** Mods not checked, left as they are. */
  unchecked: ModpackMod[];
  /** Whether the pack stays on the old version. */
  keptOnOld: boolean;
}

/** The pack `view` after a move to `toTargetId` with `rows` and `choices`. */
export function planPackMove(
  view: ModpackView,
  rows: readonly ModRow[],
  toTargetId: string,
  choices: PackChoices,
): PackMove {
  const base = {
    root: view.root,
    name: view.modpack.name,
    before: view.modpack,
  };
  if (choices.keepOnOld || view.modpack.targetId === toTargetId) {
    return {
      ...base,
      after: null,
      repinned: [],
      removed: [],
      waiting: [],
      unchecked: [],
      keptOnOld: choices.keepOnOld && view.modpack.targetId !== toTargetId,
    };
  }
  const mods: ModpackMod[] = [];
  const repinned: ModpackMod[] = [];
  const removed: ModpackMod[] = [];
  const waiting: ModpackMod[] = [];
  const unchecked: ModpackMod[] = [];
  for (const row of rows) {
    if (row.status === 'build') {
      mods.push(row.next);
      if (!row.same) repinned.push(row.next);
    } else if (row.status === 'none' && choices.remove.has(row.mod.projectId)) {
      removed.push(row.mod);
    } else {
      mods.push(row.mod);
      (row.status === 'none' ? waiting : unchecked).push(row.mod);
    }
  }
  return {
    ...base,
    after: { ...view.modpack, targetId: toTargetId, mods },
    repinned,
    removed,
    waiting,
    unchecked,
    keptOnOld: false,
  };
}

/** The command effects that write the changed packs with the move (one undo step). */
export function modpackRepinEffects(moves: readonly PackMove[]): CommandEffect[] {
  return moves.flatMap((move): CommandEffect[] =>
    move.after === null
      ? []
      : [
          {
            type: MODPACK_REPIN_EFFECT,
            data: { root: move.root, before: move.before, after: move.after },
          },
        ],
  );
}

function isRepin(effect: CommandEffect): effect is CommandEffect & { data: ModpackRepinData } {
  return (
    effect.type === MODPACK_REPIN_EFFECT && typeof effect.data === 'object' && effect.data !== null
  );
}

/**
 * Performs the {@link MODPACK_REPIN_EFFECT} effects of a command event: on execute and redo
 * each pack's new file is written, in order; on undo, in reverse order, the old one goes back.
 *
 * @returns A plain sentence for each pack that could not be written (empty when all were).
 */
export async function replayModpackRepins(
  event: Pick<CommandEvent, 'type' | 'effects'>,
  write: (root: string, modpack: Modpack) => Promise<unknown>,
): Promise<string[]> {
  const repins = event.effects.filter(isRepin);
  if (repins.length === 0 || event.type === 'reset') return [];
  const undo = event.type === 'undo';
  const failures: string[] = [];
  for (const { data } of undo ? [...repins].reverse() : repins) {
    const modpack = undo ? data.before : data.after;
    try {
      await write(data.root, modpack);
    } catch (error) {
      failures.push(
        `The modpack ${modpack.name} could not be ${undo ? 'put back' : 'updated'}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return failures;
}

function item(
  move: PackMove,
  code: string,
  key: string,
  message: string,
  hint: string,
): UpgradeTodoItem {
  return {
    id: `${code}:${move.root}:${key}`,
    source: 'export',
    problem: { severity: 'warning', code, message },
    hint,
    check: 'manual',
  };
}

/**
 * Part 3's items for the packs (ticked by hand in After moving): each mod without a build left
 * to wait, each mod not checked, and each pack kept on the old version.
 *
 * @param fromVersion - The Minecraft version moved from; `toVersion` the one moved to.
 */
export function modpackTodoItems(
  moves: readonly PackMove[],
  fromVersion: string,
  toVersion: string,
): UpgradeTodoItem[] {
  return moves.flatMap((move) => [
    ...move.waiting.map((mod) =>
      item(
        move,
        ModpackUpgradeCodes.noBuild,
        mod.projectId,
        `${mod.title} in the modpack ${move.name} has no build for Minecraft ${toVersion} yet.`,
        `wait for one and press Check my mods again, take it out of the pack, or keep the pack on Minecraft ${fromVersion}`,
      ),
    ),
    ...move.unchecked.map((mod) =>
      item(
        move,
        ModpackUpgradeCodes.notChecked,
        mod.projectId,
        `${mod.title} in the modpack ${move.name} was not checked for Minecraft ${toVersion}.`,
        'press Check my mods while you are online',
      ),
    ),
    ...(move.keptOnOld
      ? [
          item(
            move,
            ModpackUpgradeCodes.keptOnOld,
            'pack',
            `The modpack ${move.name} stays on Minecraft ${fromVersion}, so this mod no longer fits in it.`,
            `move the modpack to Minecraft ${toVersion} in Modpacks once its mods are ready`,
          ),
        ]
      : []),
  ]);
}

/** `report` with the packs' items added to part 3 (for the view and for the saved report). */
export function withModpackItems(report: UpgradeReport, moves: readonly PackMove[]): UpgradeReport {
  const items = modpackTodoItems(moves, report.from.mcVersion, report.to.mcVersion);
  return items.length === 0 ? report : { ...report, todo: [...report.todo, ...items] };
}
