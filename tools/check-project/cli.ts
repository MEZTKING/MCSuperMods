/**
 * The command line of the project checker: arguments, the plain-words report and the exit
 * code (0 when every project passed on every target, 1 when one failed, 2 for bad arguments).
 *
 * @packageDocumentation
 */

import { resolve } from 'node:path';
import { ALL_TARGETS, checkProject, type ProjectCheck } from './check.ts';
import {
  formatUpgradeReports,
  type ProjectUpgradeReports,
  upgradeReports,
} from './upgrade-report.ts';

/** Parsed command-line arguments. */
export interface CliArgs {
  folders: string[];
  targets: string[];
  json: boolean;
  /** Print the upgrade report for each newer target instead of checking. */
  upgradeReport: boolean;
  /** Whether `--target` was given (the report then covers only those targets). */
  targetsGiven: boolean;
}

const USAGE =
  'Usage: node tools/check-project/index.ts <project folder>... [--target <target id>|all] [--json] [--upgrade-report]';

/**
 * Parses the arguments. `--target` may be given more than once; `all` (the default) means
 * every built-in target.
 *
 * @throws Error With the usage line for an unknown option, a missing value or no folder.
 */
export function parseArgs(argv: readonly string[]): CliArgs {
  const folders: string[] = [];
  const targets: string[] = [];
  let json = false;
  let upgradeReport = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === '--json') json = true;
    else if (arg === '--upgrade-report') upgradeReport = true;
    else if (arg === '--target' || arg.startsWith('--target=')) {
      if (arg === '--target') index += 1;
      const value = arg === '--target' ? argv[index] : arg.slice('--target='.length);
      if (value === undefined || value === '') throw new Error(`--target needs a value.\n${USAGE}`);
      for (const part of value.split(',')) {
        if (part === 'all') targets.push(...ALL_TARGETS);
        else if (ALL_TARGETS.includes(part)) targets.push(part);
        else {
          throw new Error(`Unknown target ${part}; use one of ${ALL_TARGETS.join(', ')} or all.`);
        }
      }
    } else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}.\n${USAGE}`);
    else folders.push(arg);
  }
  if (folders.length === 0) throw new Error(`Name at least one project folder.\n${USAGE}`);
  return {
    folders,
    targets: [...new Set(targets.length === 0 ? ALL_TARGETS : targets)],
    json,
    upgradeReport,
    targetsGiven: targets.length > 0,
  };
}

/** The plain-words report of one project. */
export function formatCheck(check: ProjectCheck): string {
  const lines: string[] = [];
  const title = check.name === undefined ? check.folder : `${check.folder} (${check.name})`;
  lines.push(`${check.ok ? 'PASS' : 'FAIL'} ${title}`);
  for (const problem of check.fileProblems)
    lines.push(`  error: ${problem.path}: ${problem.message}`);
  let previous: { targetId: string; warnings: string } | undefined;
  for (const target of check.targets) {
    const how = target.upgraded ? `, upgraded from ${check.sourceTarget}` : '';
    lines.push(
      `  ${target.ok ? 'pass' : 'FAIL'} on ${target.targetId} (Minecraft ${target.mcVersion}${how})`,
    );
    const needed = target.exports.filter((entry) => entry.needed).map((entry) => entry.name);
    lines.push(
      `    needs: ${needed.length === 0 ? 'nothing (the project is empty)' : needed.join(', ')}`,
    );
    for (const entry of target.exports) {
      const state = entry.ok ? `ok, ${entry.files} file${entry.files === 1 ? '' : 's'}` : 'blocked';
      lines.push(`    ${entry.name}: ${state}${entry.needed ? '' : ' (not needed)'}`);
    }
    for (const problem of target.errors)
      lines.push(`    error: ${problem.where}: ${problem.message}`);
    const warnings = JSON.stringify(target.warnings);
    if (target.warnings.length > 0 && previous?.warnings === warnings) {
      lines.push(`    the same ${target.warnings.length} warning(s) as on ${previous.targetId}`);
    } else {
      for (const problem of target.warnings) {
        lines.push(`    warning: ${problem.where}: ${problem.message}`);
      }
    }
    previous = { targetId: target.targetId, warnings };
  }
  return lines.join('\n');
}

/** Runs the checker and returns the exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (args.upgradeReport) return reportMain(args);
  const results: ProjectCheck[] = [];
  for (const folder of args.folders) {
    const result = await checkProject(resolve(folder), { targets: args.targets }).catch(
      (error: unknown): ProjectCheck => ({
        folder: resolve(folder),
        ok: false,
        fileProblems: [
          {
            path: '.',
            message: `The checker could not read this folder: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        targets: [],
      }),
    );
    result.folder = folder;
    results.push(result);
    if (!args.json) console.log(formatCheck(result));
  }
  const failed = results.filter((result) => !result.ok).length;
  if (args.json)
    console.log(JSON.stringify({ passed: results.length - failed, failed, results }, null, 2));
  else {
    console.log(
      `\n${results.length - failed} of ${results.length} project${results.length === 1 ? '' : 's'} passed on ${args.targets.join(', ')}.`,
    );
  }
  return failed === 0 ? 0 : 1;
}

/**
 * `--upgrade-report`: the report for each project and each newer target, in plain words or JSON.
 * The exit code is 0 when every report was made and none has a thing the user must change, 1
 * otherwise.
 */
async function reportMain(args: CliArgs): Promise<number> {
  const results: ProjectUpgradeReports[] = [];
  for (const folder of args.folders) {
    const result = await upgradeReports(resolve(folder), {
      ...(args.targetsGiven ? { targets: args.targets } : {}),
    }).catch(
      (error: unknown): ProjectUpgradeReports => ({
        folder: resolve(folder),
        fileProblems: [],
        moves: [],
        error: `The checker could not read this folder: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    result.folder = folder;
    results.push(result);
    if (!args.json) console.log(formatUpgradeReports(result));
  }
  const needing = results.filter(
    (result) =>
      result.error !== undefined ||
      result.fileProblems.length > 0 ||
      result.moves.some((move) => move.needsYou > 0),
  ).length;
  if (args.json) {
    const summary = results.map((result) => ({
      ...result,
      moves: result.moves.map(({ plain, ...rest }) => ({ ...rest, plain })),
    }));
    console.log(JSON.stringify({ needingYou: needing, results: summary }, null, 2));
  } else {
    console.log(
      `\n${results.length - needing} of ${results.length} project${results.length === 1 ? '' : 's'} need nothing from you on a newer Minecraft.`,
    );
  }
  return needing === 0 ? 0 : 1;
}
