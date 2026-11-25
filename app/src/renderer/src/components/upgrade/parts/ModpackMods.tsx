/**
 * The upgrade report's part **Mods in this pack** (ADR 0136 D9, brief B821). When the mod is in
 * one of the remembered modpacks, the part lists each pack's mods from Modrinth and, only when
 * the user presses **Check my mods**, asks Modrinth once (one batched call for every pack)
 * whether each has a build for the version moved to: a row per mod says it has one, has none or
 * could not be checked. The user chooses whether each pack moves with the mod or stays on the
 * old version, and, for a mod without a build, whether it waits in the pack or comes out.
 *
 * Presentational over `modpacks/upgrade.ts`: the host gives the modpack service, the project's
 * folder and the two ends of the move, and receives the packs' moves through `onMovesChange`
 * to apply with the move (`modpackRepinEffects`, one undo step) and to add part 3's items
 * (`withModpackItems`). Reading the Modpacks list is local; nothing reaches the network before
 * the click. Plain words first; ids under More options. No sentence names a version: versions
 * come from the targets.
 *
 * @packageDocumentation
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ModpackView, ModrinthModUpdate } from '../../../../../shared/platform';
import {
  defaultPackChoices,
  type ModpackUpgradeService,
  type ModRow,
  modpacksWithProject,
  modRows,
  otherMembersOn,
  type PackChoices,
  type PackMove,
  pinnedHashes,
  planPackMove,
} from '../../../modpacks/upgrade';
import { Button } from '../../ui/Button';
import { linkClass, Part, Raw, useReport } from './shared';

/** One end of the move. */
export interface ModpackMoveEnd {
  targetId: string;
  mcVersion: string;
}

/** Props of {@link ModpackMods}. */
export interface ModpackModsProps {
  /** The platform's modpack service (`platform.modpacks`); without it the part shows nothing. */
  modpacks: Pick<ModpackUpgradeService, 'list' | 'read' | 'checkMods'> | undefined;
  /** The open project's folder; `null` (not saved yet) shows nothing. */
  projectRoot: string | null;
  /** The target the mod moves from. */
  from: ModpackMoveEnd;
  /** The target the mod moves to. */
  to: ModpackMoveEnd;
  /** Called with each pack's move whenever the packs, the answer or a choice change. */
  onMovesChange?: ((moves: readonly PackMove[]) => void) | undefined;
}

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; updates: readonly ModrinthModUpdate[] }
  | { status: 'failed'; message: string };

/** "1 mod" or "3 mods". */
function mods(count: number): string {
  return count === 1 ? '1 mod' : `${count} mods`;
}

/** The plain sentence of one row. */
export function modRowText(
  row: ModRow,
  to: string,
  checked: CheckState['status'],
  packMoves: boolean,
): string {
  const title = row.mod.title;
  switch (row.status) {
    case 'build':
      if (row.same) return `${title} already works with Minecraft ${to}.`;
      return packMoves
        ? `${title} has a build for Minecraft ${to}. It is updated when you move.`
        : `${title} has a build for Minecraft ${to}.`;
    case 'none':
      return `${title} has no build for Minecraft ${to} yet.`;
    default:
      return checked === 'failed'
        ? `${title} could not be checked.`
        : `${title} is not checked yet.`;
  }
}

/** The line on what the move does to a pack. */
export function packMoveSentence(move: PackMove, to: string, from: string): string {
  if (move.keptOnOld) {
    return `${move.name} stays on Minecraft ${from} and is not changed. This mod will no longer fit in it until the pack moves too.`;
  }
  const parts: string[] = [];
  if (move.repinned.length > 0) {
    parts.push(
      `${mods(move.repinned.length)} ${move.repinned.length === 1 ? 'is' : 'are'} updated to the build for Minecraft ${to} in the same step as the move, and Undo puts ${move.repinned.length === 1 ? 'it' : 'them'} back.`,
    );
  }
  if (move.removed.length > 0) {
    parts.push(`${mods(move.removed.length)} will be taken out of the pack.`);
  }
  const left = move.waiting.length + move.unchecked.length;
  if (left > 0) {
    parts.push(`${mods(left)} ${left === 1 ? 'is' : 'are'} listed under What you need to change.`);
  }
  return [`${move.name} moves to Minecraft ${to} with this mod.`, ...parts].join(' ');
}

/** The part. */
export function ModpackMods(props: ModpackModsProps) {
  const { modpacks, projectRoot, from, to, onMovesChange } = props;
  const report = useReport();
  const [packs, setPacks] = useState<readonly ModpackView[] | null>(null);
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const [choices, setChoices] = useState<ReadonlyMap<string, PackChoices>>(new Map());
  const baseId = useId();

  useEffect(() => {
    let live = true;
    setPacks(null);
    setCheck({ status: 'idle' });
    setChoices(new Map());
    if (modpacks === undefined || projectRoot === null) return;
    modpacksWithProject(modpacks, projectRoot)
      .then((found) => {
        if (live) setPacks(found);
      })
      .catch(() => {
        if (live) setPacks([]);
      });
    return () => {
      live = false;
    };
  }, [modpacks, projectRoot]);

  const updates = check.status === 'done' ? check.updates : null;
  const choicesOf = (view: ModpackView): PackChoices =>
    choices.get(view.root) ?? defaultPackChoices(view, projectRoot ?? '', from.targetId);

  const planned = useMemo(
    () =>
      (packs ?? []).map((view) => {
        const rows = modRows(view.modpack.mods, updates);
        const choice =
          choices.get(view.root) ?? defaultPackChoices(view, projectRoot ?? '', from.targetId);
        return { view, rows, choice, move: planPackMove(view, rows, to.targetId, choice) };
      }),
    [packs, updates, choices, projectRoot, from.targetId, to.targetId],
  );

  // The latest callback, so a host passing a new function each render does not loop.
  const onMoves = useRef(onMovesChange);
  onMoves.current = onMovesChange;
  useEffect(() => {
    onMoves.current?.(planned.map((entry) => entry.move));
  }, [planned]);

  const setChoice = (view: ModpackView, next: Partial<PackChoices>): void => {
    setChoices((current) => {
      const map = new Map(current);
      map.set(view.root, { ...choicesOf(view), ...next });
      return map;
    });
  };

  const checkMods = async (): Promise<void> => {
    if (modpacks === undefined || packs === null) return;
    setCheck({ status: 'checking' });
    try {
      const answer = await modpacks.checkMods(pinnedHashes(packs), to.mcVersion);
      setCheck({ status: 'done', updates: answer });
    } catch (error) {
      setCheck({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (report.made || packs === null || packs.length === 0 || from.targetId === to.targetId) {
    return null;
  }
  const totalMods = packs.reduce((sum, view) => sum + view.modpack.mods.length, 0);
  return (
    <Part id="modpack" title={packs.length === 1 ? 'Mods in this pack' : 'Mods in your modpacks'}>
      <p className="text-sm" data-testid="upgrade-modpack-intro">
        {packs.length === 1
          ? `This mod is in the modpack ${packs[0]?.modpack.name}.`
          : `This mod is in ${packs.length} modpacks.`}{' '}
        {totalMods === 0
          ? 'No mods from Modrinth are in it, so there is nothing to check.'
          : `Mods from Modrinth are made for one Minecraft version at a time. MCSuperMods asks Modrinth whether each has a build for Minecraft ${to.mcVersion} only when you press Check my mods.`}
      </p>
      {totalMods > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-testid="upgrade-modpack-check"
            disabled={check.status === 'checking'}
            onClick={() => void checkMods()}
          >
            {check.status === 'checking'
              ? 'Checking…'
              : check.status === 'idle'
                ? 'Check my mods'
                : 'Check my mods again'}
          </Button>
        </div>
      )}
      {check.status === 'failed' && (
        <div className="flex flex-col gap-0.5" role="alert" data-testid="upgrade-modpack-offline">
          <p className="text-sm">
            MCSuperMods could not reach Modrinth, so your mods were not checked. Make sure you are
            online and press Check my mods again.
          </p>
          <Raw>{check.message}</Raw>
        </div>
      )}
      {planned.map(({ view, rows, choice, move }, packIndex) => {
        const packId = `upgrade-modpack-${packIndex}`;
        const others = otherMembersOn(view, projectRoot ?? '', from.targetId);
        const packMoves = !choice.keepOnOld;
        return (
          <div key={view.root} className="flex flex-col gap-1 pl-1" data-testid={packId}>
            {packs.length > 1 && (
              <h4 className="font-medium text-sm" data-testid={`${packId}-name`}>
                {view.modpack.name}
              </h4>
            )}
            {rows.length > 0 && (
              <ul className="flex flex-col gap-1" data-testid={`${packId}-mods`}>
                {rows.map((row, rowIndex) => {
                  const rowId = `${packId}-mod-${rowIndex}`;
                  const removing = choice.remove.has(row.mod.projectId);
                  return (
                    <li
                      key={row.mod.projectId}
                      className="flex flex-col gap-0.5"
                      data-testid={rowId}
                      data-status={row.status}
                    >
                      <span className="text-sm" data-testid={`${rowId}-text`}>
                        {modRowText(row, to.mcVersion, check.status, packMoves)}
                      </span>
                      {row.status === 'none' && packMoves && (
                        <span className="flex flex-wrap gap-2 pl-2">
                          <button
                            type="button"
                            className={linkClass}
                            aria-pressed={!removing}
                            data-testid={`${rowId}-wait`}
                            onClick={() => {
                              const remove = new Set(choice.remove);
                              remove.delete(row.mod.projectId);
                              setChoice(view, { remove });
                            }}
                          >
                            Keep it and wait for a build
                          </button>
                          <button
                            type="button"
                            className={linkClass}
                            aria-pressed={removing}
                            data-testid={`${rowId}-remove`}
                            onClick={() => {
                              const remove = new Set(choice.remove);
                              remove.add(row.mod.projectId);
                              setChoice(view, { remove });
                            }}
                          >
                            Take it out of the pack
                          </button>
                        </span>
                      )}
                      <Raw testId={`${rowId}-raw`}>
                        {`${row.mod.projectId} ${row.mod.versionId} ${row.mod.fileName}${
                          row.status === 'build' && !row.same
                            ? ` becomes ${row.next.versionId} ${row.next.fileName} (${row.versionNumber})`
                            : ''
                        }`}
                      </Raw>
                    </li>
                  );
                })}
              </ul>
            )}
            <fieldset className="flex flex-col gap-1" aria-labelledby={`${baseId}-${packIndex}`}>
              <legend id={`${baseId}-${packIndex}`} className="text-sm">
                When this mod moves, the modpack {view.modpack.name}
              </legend>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name={`${baseId}-${packIndex}-pack`}
                    data-testid={`${packId}-moves`}
                    checked={packMoves}
                    onChange={() => setChoice(view, { keepOnOld: false })}
                  />
                  moves to Minecraft {to.mcVersion} too
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name={`${baseId}-${packIndex}-pack`}
                    data-testid={`${packId}-stays`}
                    checked={!packMoves}
                    onChange={() => setChoice(view, { keepOnOld: true })}
                  />
                  stays on Minecraft {from.mcVersion}
                </label>
              </div>
            </fieldset>
            {others.length > 0 && (
              <p className="text-muted text-sm" data-testid={`${packId}-others`}>
                {others.length === 1
                  ? `1 other mod in it, ${others[0]}, is still made for Minecraft ${from.mcVersion}. Moving the pack means moving it too.`
                  : `${others.length} other mods in it are still made for Minecraft ${from.mcVersion}. Moving the pack means moving them too.`}
              </p>
            )}
            <p className="text-sm" data-testid={`${packId}-summary`}>
              {packMoveSentence(move, to.mcVersion, from.mcVersion)}
            </p>
            <Raw testId={`${packId}-raw`}>{view.root}</Raw>
          </div>
        );
      })}
      <p className="text-muted text-sm" data-testid="upgrade-modpack-play">
        The next time you press Play, MCSuperMods makes a new instance for Minecraft {to.mcVersion}{' '}
        and leaves the one for Minecraft {from.mcVersion} as it is.
      </p>
    </Part>
  );
}
