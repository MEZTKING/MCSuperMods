/**
 * `--upgrade-report`: the report the app's **See what changes** dialog shows (ADR 0136 D4),
 * for each project and each target newer than the project's own. It runs the app's own dry run
 * (`ProjectSession.upgradeReport`) over an in-memory copy and applies nothing. The plain-words
 * form uses the app's `components/upgrade/sentences.ts`, which is pure (no React), so the words
 * are the app's.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { createMemoryFileSystem, type Project, type UpgradeReport } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import * as sentences from '../../app/src/renderer/src/components/upgrade/sentences.ts';
import { builtInPlugins } from '../../app/src/renderer/src/plugins/built-in.ts';
import { mcfunctionCheckerFromPlatform } from '../../app/src/renderer/src/session/mcfunction-problems.ts';
import { ProjectSession } from '../../app/src/renderer/src/session/project-session.ts';
import { ALL_TARGETS } from './check.ts';
import { type FileProblem, fileProblems, PROJECT_FILE, projectFiles, readFolder } from './files.ts';
import { checkerPlatform } from './platform.ts';

/** The app's report sentences (`components/upgrade/sentences.ts`, pure: no React). */
type Sentences = typeof sentences;

/** The report of one move. */
export interface UpgradeMoveReport {
  /** The target moved to. */
  targetId: string;
  /** Its Minecraft version. */
  mcVersion: string;
  /** How many things need the user (part 3 of the report). */
  needsYou: number;
  /** The report the app would show. */
  report: UpgradeReport;
  /** The plain-words form, one line each. */
  plain: string[];
}

/** The upgrade reports of one project folder. */
export interface ProjectUpgradeReports {
  folder: string;
  name?: string;
  sourceTarget?: string;
  /** Files refused before the project was opened. */
  fileProblems: FileProblem[];
  /** One report per newer target, newest last. */
  moves: UpgradeMoveReport[];
  /** Why no report could be made, when none could. */
  error?: string;
}

/** The target ids newer than `sourceTarget` (the built-in list is newest first), oldest first. */
export function newerTargets(sourceTarget: string): string[] {
  const index = ALL_TARGETS.indexOf(sourceTarget);
  return (index < 0 ? [] : ALL_TARGETS.slice(0, index)).reverse();
}

/** The report in plain words, in the app's sentences. */
export function plainReport(
  w: Sentences,
  report: UpgradeReport,
  project: Project | null,
  sourceName: string,
): string[] {
  const to = report.to.mcVersion;
  const lines: string[] = [];
  lines.push(
    `Moving ${sourceName} from Minecraft ${report.from.mcVersion} to ${to}: ${w.moveSummary(report)}`,
  );
  const touched = report.changed.length + report.done.length + report.todo.length;
  if (touched === 0) lines.push(`  ${w.nothingTouchesSentence(report.untouched.total, to)}`);
  if (report.changed.length > 0) {
    lines.push('  What changed in Minecraft for this mod:');
    for (const item of report.changed) {
      const versionOf = (id: string): string =>
        id === report.to.targetId
          ? to
          : (builtInTargets.find((b) => b.target.id === id)?.target.mcVersion ?? to);
      lines.push(`    - ${w.changeSentence(item.change, versionOf(item.targetId))}`);
    }
  }
  const done = report.done.filter((item) => item.kind !== 'note');
  if (done.length > 0) {
    lines.push('  What MCSuperMods changes for you:');
    for (const item of done) {
      const sentences =
        item.details.length > 0
          ? item.details.map((detail) => w.detailSentence(detail, to))
          : [
              item.kind === 'remove'
                ? 'It is taken out of your mod.'
                : w.plainText(item.description),
            ];
      lines.push(`    - ${item.elementId}: ${[...new Set(sentences)].join(' ')}`);
    }
  }
  if (report.todo.length > 0) {
    lines.push(`  What you need to change (${w.count(report.todo.length, 'thing', 'things')}):`);
    let previous: (typeof report.todo)[number] | undefined;
    for (const item of report.todo) {
      lines.push(`    - ${w.todoItemText(item, project, to)}`);
      const hint = w.todoItemHint(item, previous);
      if (hint !== null) lines.push(`      ${hint}`);
      previous = item;
    }
  }
  const changedRows = report.players.rows.filter((row) => row.changed);
  if (changedRows.length > 0) {
    lines.push('  What your players need:');
    for (const row of changedRows) {
      lines.push(
        `    - ${w.PLAYER_FACT_LABELS[row.fact]}: ${w.playerValue(row.fact, row.before)} becomes ${w.playerValue(row.fact, row.after)}`,
      );
    }
  }
  if (report.added.total > 0) lines.push(`  ${w.additionsSentence(report.added, to)}`);
  if (report.untouched.total > 0 && touched > 0)
    lines.push(`  ${w.untouchedSentence(report.untouched.total, to)}`);
  return lines;
}

/**
 * The upgrade reports of the project in `folder` for each target of `options.targets` newer
 * than the project's own (default: all of them). Nothing is written.
 */
export async function upgradeReports(
  folder: string,
  options: { targets?: readonly string[] } = {},
): Promise<ProjectUpgradeReports> {
  const files = await readFolder(folder);
  const result: ProjectUpgradeReports = {
    folder,
    fileProblems: fileProblems(files),
    moves: [],
  };
  const projectFile = files.find((file) => file.path === PROJECT_FILE);
  if (projectFile === undefined) return result;
  let header: { name?: unknown; targets?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(projectFile.bytes)) as typeof header;
  } catch (error) {
    result.error = `This is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
    return result;
  }
  if (typeof header.name === 'string') result.name = header.name;
  const listed = Array.isArray(header.targets) ? header.targets[0] : undefined;
  const source = typeof listed === 'string' ? listed : (ALL_TARGETS[0] as string);
  result.sourceTarget = source;
  const wanted = newerTargets(source).filter(
    (id) => options.targets === undefined || options.targets.includes(id),
  );
  if (wanted.length === 0) return result;
  const version = (
    JSON.parse(await readFile(new URL('../../app/package.json', import.meta.url), 'utf8')) as {
      version: string;
    }
  ).version;
  const fs = createMemoryFileSystem(
    Object.fromEntries(projectFiles(files).map((file) => [file.path, file.bytes])),
  );
  const { platform } = checkerPlatform(fs, version);
  const session: ProjectSession = new ProjectSession(platform, {
    plugins: builtInPlugins,
    targets: builtInTargets,
    validationDelay: 0,
    mcfunction: mcfunctionCheckerFromPlatform(platform.mcfunction, () => session.target.id),
    scripting: platform.scripting,
  });
  try {
    const opened = await session.loadSnapshot(folder);
    if (!opened.ok) {
      result.error = `MSM could not open this project: ${'reason' in opened ? opened.reason : 'cancelled'}`;
      return result;
    }
    const sourceName = result.name ?? folder;
    for (const targetId of wanted) {
      const dry = await session.upgradeReport(targetId);
      result.moves.push({
        targetId,
        mcVersion: dry.report.to.mcVersion,
        needsYou: dry.report.todo.length,
        report: dry.report,
        plain: plainReport(sentences, dry.report, session.snapshot.project, sourceName),
      });
    }
  } catch (error) {
    result.error = `The report could not be made: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    session.dispose();
  }
  return result;
}

/** The plain-words form of one project's reports. */
export function formatUpgradeReports(result: ProjectUpgradeReports): string {
  const title = result.name === undefined ? result.folder : `${result.folder} (${result.name})`;
  const lines = [title];
  for (const problem of result.fileProblems)
    lines.push(`  error: ${problem.path}: ${problem.message}`);
  if (result.error !== undefined) lines.push(`  error: ${result.error}`);
  if (result.error === undefined && result.moves.length === 0) {
    lines.push(`  No newer Minecraft than ${result.sourceTarget ?? 'its own'} to move to.`);
  }
  for (const move of result.moves) lines.push(...move.plain.map((line) => `  ${line}`));
  return lines.join('\n');
}
