/**
 * Checks one MSM project folder as the app would open, upgrade and export it: the app's own
 * `ProjectSession` with the built-in plugins and targets runs over an in-memory copy of the
 * folder (nothing is written back), the project is moved to each requested target as Upgrade
 * project target does it, every validator runs, and the resource pack, data pack and Fabric
 * mod jar are exported. Error problems fail the check; warnings are reported and do not.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { createMemoryFileSystem, type Problem } from '@msm/core';
import type { OutputLayer } from '@msm/plugin-api';
import { builtInTargets, targetById } from '@msm/targets';
import { unzipSync } from 'fflate';
import { builtInPlugins } from '../../app/src/renderer/src/plugins/built-in.ts';
import { mcfunctionCheckerFromPlatform } from '../../app/src/renderer/src/session/mcfunction-problems.ts';
import { ProjectSession } from '../../app/src/renderer/src/session/project-session.ts';
import {
  COPIED_ENDINGS,
  type FileProblem,
  type FolderFile,
  fileProblems,
  PROJECT_FILE,
  projectFiles,
  readFolder,
} from './files.ts';
import { checkerPlatform } from './platform.ts';

/** The three exports the checker runs. */
export type ExportName = 'resource pack' | 'data pack' | 'Fabric mod jar';

/** What one export did on one target. */
export interface ExportCheck {
  name: ExportName;
  /** Whether the project's content needs this export to work in the game. */
  needed: boolean;
  /** Whether the export finished without an error problem. */
  ok: boolean;
  /** How many files the export wrote. */
  files: number;
}

/** One problem in plain words. */
export interface PlainProblem {
  severity: 'error' | 'warning';
  /** Where: an element id, a file, or the export it came from. */
  where: string;
  message: string;
}

/** The check of one project on one target. */
export interface TargetCheck {
  targetId: string;
  mcVersion: string;
  /** Whether the project was upgraded from its own target to this one. */
  upgraded: boolean;
  ok: boolean;
  errors: PlainProblem[];
  warnings: PlainProblem[];
  exports: ExportCheck[];
}

/** The check of one project folder. */
export interface ProjectCheck {
  folder: string;
  /** The project's name, when its project file could be read. */
  name?: string;
  /** The project's own target (its first listed target). */
  sourceTarget?: string;
  ok: boolean;
  /** Files refused before the project was opened (see `files.ts`). */
  fileProblems: FileProblem[];
  targets: TargetCheck[];
}

/** Options for {@link checkProject}. */
export interface CheckOptions {
  /** Target ids to check; defaults to every built-in target. */
  targets?: readonly string[];
}

const here = new URL('.', import.meta.url);

let appVersion: Promise<string> | null = null;

/** The app's version (`app/package.json`), written into export manifests as the app does. */
function msmVersion(): Promise<string> {
  appVersion ??= readFile(new URL('../../app/package.json', here), 'utf8').then(
    (text) => (JSON.parse(text) as { version: string }).version,
  );
  return appVersion;
}

/** Every built-in target id, newest first. */
export const ALL_TARGETS: readonly string[] = builtInTargets.map((bundle) => bundle.target.id);

function where(problem: Problem, fallback: string): string {
  return problem.elementId ?? problem.file ?? fallback;
}

function plain(problems: readonly Problem[], fallback: string): PlainProblem[] {
  const out: PlainProblem[] = [];
  for (const problem of problems) {
    if (problem.severity !== 'error' && problem.severity !== 'warning') continue;
    out.push({
      severity: problem.severity,
      where: where(problem, fallback),
      message: problem.message,
    });
  }
  return out;
}

function dedupe(problems: readonly PlainProblem[]): PlainProblem[] {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const key = `${problem.severity}\u0000${problem.where}\u0000${problem.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Output files read as text when looking for the names of pictures and sounds. */
const TEXT_ENDINGS = ['.json', '.mcmeta', '.mcfunction', '.js', '.ts', '.txt', '.lang'];

const decoder = new TextDecoder();

/** The entries of a zip the session built (packs and the jar). */
function zipEntries(data: Uint8Array | undefined): Map<string, Uint8Array> {
  if (data === undefined) return new Map();
  return new Map(Object.entries(unzipSync(data)));
}

/** Pictures and sounds an export writes under Minecraft's own name. */
function vanillaNamedMedia(entries: ReadonlyMap<string, Uint8Array>): string[] {
  return [...entries.keys()].filter(
    (path) =>
      /^assets\/minecraft\/(textures|sounds)\//.test(path) &&
      COPIED_ENDINGS.some((ending) => path.toLowerCase().endsWith(ending)),
  );
}

/**
 * The pictures and sounds under `assets/` whose name `text` (the element files and every text
 * file the exports wrote) never mentions: neither the file's name without its ending (as a
 * texture, sound or asset id ends) nor its path below the namespace's first folder.
 */
export function unmentionedMedia(files: readonly FolderFile[], text: string): string[] {
  const out: string[] = [];
  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (!file.path.startsWith('assets/')) continue;
    if (!COPIED_ENDINGS.some((ending) => lower.endsWith(ending))) continue;
    const name = file.path.slice(file.path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    if (!text.includes(name)) out.push(file.path);
  }
  return out;
}

async function checkTarget(
  folder: string,
  files: readonly FolderFile[],
  sourceTarget: string,
  targetId: string,
): Promise<{ check: TargetCheck; outputText: string[] }> {
  const bundle = targetById(targetId);
  if (bundle === undefined) throw new Error(`Unknown target ${targetId}.`);
  const fs = createMemoryFileSystem(
    Object.fromEntries(projectFiles(files).map((file) => [file.path, file.bytes])),
  );
  const { platform, saved } = checkerPlatform(fs, await msmVersion());
  const session: ProjectSession = new ProjectSession(platform, {
    plugins: builtInPlugins,
    targets: builtInTargets,
    validationDelay: 0,
    mcfunction: mcfunctionCheckerFromPlatform(platform.mcfunction, () => session.target.id),
    scripting: platform.scripting,
  });
  const errors: PlainProblem[] = [];
  const warnings: PlainProblem[] = [];
  const exports: ExportCheck[] = [];
  const outputText: string[] = [];
  const add = (list: readonly PlainProblem[]): void => {
    for (const problem of list) (problem.severity === 'error' ? errors : warnings).push(problem);
  };
  const upgraded = sourceTarget !== targetId;
  const finish = (): { check: TargetCheck; outputText: string[] } => {
    session.dispose();
    const check: TargetCheck = {
      targetId,
      mcVersion: bundle.target.mcVersion,
      upgraded,
      ok: false,
      errors: dedupe(errors),
      warnings: dedupe(warnings),
      exports,
    };
    check.ok = check.errors.length === 0;
    return { check, outputText };
  };

  const opened = await session.loadSnapshot(folder);
  if (!opened.ok) {
    errors.push({
      severity: 'error',
      where: PROJECT_FILE,
      message: `MSM could not open this project: ${'reason' in opened ? opened.reason : 'cancelled'}`,
    });
    return finish();
  }
  if (upgraded) {
    const report = await session.upgradeTargetPreview(targetId);
    add(plain(report.problems, `Upgrade project target to ${targetId}`));
    await session.upgradeTarget(targetId, report);
  }
  await session.flushValidation();
  add(plain(session.snapshot.problems, 'project'));

  // Which exports the content needs: the layers its lowered files belong to.
  const layers = new Set<OutputLayer>();
  try {
    const lowered = await session.lowerExpandedProject();
    for (const file of lowered.files) layers.add(file.layer);
  } catch (error) {
    errors.push({
      severity: 'error',
      where: 'lowering',
      message: `The project could not be turned into game files: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  const project = session.snapshot.project;
  const hasAssets = project?.namespaces.some((namespace) => namespace.assets.length > 0) ?? false;

  const record = (
    name: ExportName,
    needed: boolean,
    report: { ok: boolean; problems: Problem[]; files: string[] },
    data: Uint8Array | undefined,
  ): void => {
    add(plain(report.problems, name));
    exports.push({ name, needed, ok: report.ok, files: report.files.length });
    if (!report.ok && !report.problems.some((problem) => problem.severity === 'error')) {
      errors.push({
        severity: 'error',
        where: name,
        message: `The ${name} export did not finish.`,
      });
    }
    const entries = zipEntries(data);
    for (const [path, bytes] of entries) {
      if (TEXT_ENDINGS.some((ending) => path.endsWith(ending)))
        outputText.push(decoder.decode(bytes));
    }
    for (const path of vanillaNamedMedia(entries)) {
      errors.push({
        severity: 'error',
        where: name,
        message: `The ${name} would ship ${path}, a picture or sound under Minecraft's own name. Mojang's pictures and sounds may not be shared; keep your own in your project's namespace.`,
      });
    }
  };

  const savedData = (before: number): Uint8Array | undefined => saved[before]?.data;
  let before = saved.length;
  const resource = await session.exportPack('resource', 'zip');
  record('resource pack', layers.has('resourcepack') || hasAssets, resource, savedData(before));
  before = saved.length;
  const data = await session.exportPack('data', 'zip');
  record('data pack', layers.has('datapack'), data, savedData(before));
  // The runtime and GeckoLib are installed beside the jar here: the checker has neither jar.
  const jar = await session.buildContentJar({ separateRuntime: true });
  record('Fabric mod jar', layers.has('msm'), jar.report, jar.data);
  return finish();
}

/**
 * Checks the project in `folder` on each target of `options.targets` (default: every built-in
 * target). The folder is read once; each target gets a fresh session over its own copy.
 */
export async function checkProject(
  folder: string,
  options: CheckOptions = {},
): Promise<ProjectCheck> {
  const files = await readFolder(folder);
  const refused = fileProblems(files);
  const result: ProjectCheck = { folder, ok: false, fileProblems: refused, targets: [] };
  const projectFile = files.find((file) => file.path === PROJECT_FILE);
  if (projectFile === undefined) return result;
  let header: { name?: unknown; targets?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(projectFile.bytes)) as typeof header;
  } catch (error) {
    result.fileProblems.push({
      path: PROJECT_FILE,
      message: `This is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
    return result;
  }
  if (typeof header.name === 'string') result.name = header.name;
  const listed = Array.isArray(header.targets) ? header.targets[0] : undefined;
  const sourceTarget = typeof listed === 'string' ? listed : (ALL_TARGETS[0] as string);
  result.sourceTarget = sourceTarget;
  const text: string[] = projectFiles(files)
    .filter((file) => file.path.startsWith('content/'))
    .map((file) => decoder.decode(file.bytes));
  for (const targetId of options.targets ?? ALL_TARGETS) {
    const { check, outputText } = await checkTarget(folder, files, sourceTarget, targetId);
    result.targets.push(check);
    text.push(...outputText);
  }
  // A picture or sound whose name nothing in the project or its exports mentions is not part
  // of the project's content: it may be a file copied from the game. Checked only when every
  // export ran, so a blocked export does not make every picture look unused.
  const exported = result.targets.every((target) => target.exports.every((entry) => entry.ok));
  if (exported && result.targets.length > 0) {
    const all = text.join('\n');
    for (const file of unmentionedMedia(projectFiles(files), all)) {
      if (refused.some((problem) => problem.path === file)) continue;
      result.fileProblems.push({
        path: file,
        message:
          'Nothing in the project uses this picture or sound: no element or exported file names it. Remove it, or use it from an element (a model, a sound or a texture setting). Files copied from the game may not be shared.',
      });
    }
  }
  result.ok = result.fileProblems.length === 0 && result.targets.every((target) => target.ok);
  return result;
}
