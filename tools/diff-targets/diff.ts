/**
 * Reads two target folders' vendored data and builds the generated change set (ADR 0136 D2,
 * D11). Pure and offline: only `vendor/mcmeta/` and `vendor/vanilla-mcdoc/` of the two
 * folders are read, and nothing is written.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type VanillaMcdocSymbols,
} from '../../packages/schemas/src/index.ts';
import { compareCodePoints, parseJsonStrict, stringifySorted } from '../shared/download.ts';
import { type BlockStates, diffBlocks } from './blocks.ts';
import { attachRenameCandidates } from './candidates.ts';
import { sortChanges } from './change.ts';
import { type CommandReportFormat, type CommandReportNode, diffCommands } from './commands.ts';
import { diffMcdoc, type McdocSide } from './mcdoc.ts';
import { diffPacks, type VersionFile } from './packs.ts';
import { diffRegistries, type Registries } from './registries.ts';
import type { TargetAddition, TargetChangeSet } from './types.ts';

/** One target folder's vendored data. */
export interface TargetData {
  /** `mc-` plus the version up to its first `-` (`26.4-snapshot-7` gives `mc-26.4`). */
  id: string;
  /** The Minecraft version (`version.json` `id`). */
  version: string;
  mcdocRef: string;
  mcmetaRef: string;
  registries: Registries;
  commands: CommandReportNode;
  blocks: BlockStates;
  versionFile: VersionFile;
  symbols: VanillaMcdocSymbols;
}

async function readJson(path: string): Promise<unknown> {
  return parseJsonStrict(await readFile(path, 'utf8'), path);
}

/** The release line of a version: up to its first `-` (`26.4-pre-1` is on `26.4`). */
export function releaseLine(version: string): string {
  return version.split('-')[0] as string;
}

/** Reads a target folder (`packages/targets/mc-<version>`). */
export async function readTarget(folder: string): Promise<TargetData> {
  const mcmeta = join(folder, 'vendor', 'mcmeta');
  const mcdoc = join(folder, 'vendor', 'vanilla-mcdoc');
  const versionFile = (await readJson(join(mcmeta, 'version.json'))) as VersionFile;
  const mcmetaSource = (await readJson(join(mcmeta, 'SOURCE.json'))) as {
    refs?: { summary?: string };
  };
  const mcdocSource = (await readJson(join(mcdoc, 'SOURCE.json'))) as { ref?: string };
  const summary = mcmetaSource.refs?.summary;
  if (summary === undefined || !summary.endsWith('-summary')) {
    throw new Error(`${mcmeta}/SOURCE.json: no refs.summary tag`);
  }
  if (typeof mcdocSource.ref !== 'string') throw new Error(`${mcdoc}/SOURCE.json: no ref`);
  return {
    id: `mc-${releaseLine(versionFile.id)}`,
    version: versionFile.id,
    mcdocRef: mcdocSource.ref,
    mcmetaRef: summary.slice(0, -'-summary'.length),
    registries: (await readJson(join(mcmeta, 'registries.json'))) as Registries,
    commands: (await readJson(join(mcmeta, 'commands.json'))) as CommandReportNode,
    blocks: (await readJson(join(mcmeta, 'blocks.json'))) as BlockStates,
    versionFile,
    symbols: parseVanillaMcdocSymbols(await readJson(join(mcdoc, 'symbols.json'))),
  };
}

/**
 * How the formats are compared: `gated` resolves the newer export at both versions (a step
 * between release lines), `refs` each export at its own version (a re-pin within one line).
 */
export type McdocMode = 'gated' | 'refs';

/** The mode for two versions: `gated` across release lines, `refs` within one. */
export function defaultMcdocMode(from: string, to: string): McdocMode {
  return releaseLine(from) === releaseLine(to) ? 'refs' : 'gated';
}

/** What a diff gives: the change set, the additions' list and how it was made. */
export interface TargetDiff {
  changeSet: TargetChangeSet;
  additions: TargetAddition[];
  mcdocMode: McdocMode;
  commandFormats: { before: CommandReportFormat; after: CommandReportFormat };
}

/** Diffs two targets' data. */
export function diffTargets(
  before: TargetData,
  after: TargetData,
  options: { mcdoc?: McdocMode } = {},
): TargetDiff {
  const mode = options.mcdoc ?? defaultMcdocMode(before.version, after.version);
  const registries = diffRegistries(before.registries, after.registries);
  const renames = new Map(
    registries.pairs.filter((p) => p.from !== p.to).map((p) => [p.from, p.to] as const),
  );
  const mcdocBefore: McdocSide = {
    symbols: mode === 'gated' ? after.symbols : before.symbols,
    index: createSchemaIndex(mode === 'gated' ? after.symbols : before.symbols, {
      mcVersion: before.version,
    }),
  };
  const mcdocAfter: McdocSide = {
    symbols: after.symbols,
    index: createSchemaIndex(after.symbols, { mcVersion: after.version }),
  };
  const changes = [...registries.changes];
  attachRenameCandidates(changes, registries, mcdocBefore, mcdocAfter);
  changes.push(...diffMcdoc(mcdocBefore, mcdocAfter, renames));
  const commands = diffCommands(before.commands, after.commands);
  changes.push(...commands.changes);
  changes.push(...diffBlocks(before.blocks, after.blocks));
  changes.push(...diffPacks(before.versionFile, after.versionFile));

  const additions = [...registries.additions, ...commands.additions].sort((a, b) =>
    compareCodePoints(a.id, b.id),
  );
  const counts: Record<string, number> = {};
  for (const a of additions) {
    const key =
      a.what === 'member-added'
        ? `ids:${a.registry}`
        : a.what === 'registry-added'
          ? 'ids:(registries)'
          : 'commands:(paths)';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return {
    changeSet: {
      from: before.id,
      to: after.id,
      refs: {
        from: { mcdoc: before.mcdocRef, mcmeta: before.mcmetaRef },
        to: { mcdoc: after.mcdocRef, mcmeta: after.mcmetaRef },
      },
      changes: sortChanges(changes),
      additions: counts,
    },
    additions,
    mcdocMode: mode,
    commandFormats: commands.formats,
  };
}

/** The change set file's text: sorted keys, 2-space indent, trailing newline. */
export function changeSetText(diff: TargetDiff): string {
  return stringifySorted(diff.changeSet);
}

/** The additions file's text (written beside the change set). */
export function additionsText(diff: TargetDiff): string {
  return stringifySorted({
    from: diff.changeSet.from,
    to: diff.changeSet.to,
    additions: diff.additions,
  });
}
