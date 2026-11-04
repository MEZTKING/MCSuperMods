/**
 * The export pipeline: lower → add assets → merge → validate → package.
 *
 * @packageDocumentation
 */

import { type ElementKindRegistry, lowerProject, utf8 } from '@msm/core';
import {
  type Exporter,
  isProjectRelativePath,
  type Json,
  type OutputFile,
  type OutputSink,
  type Problem,
  type Project,
  type Target,
} from '@msm/plugin-api';
import { type RegistryIndex, type SchemaIndex, type SchemaNode, validateJson } from '@msm/schemas';
import { assetOutputFiles } from './assets';
import { ExportProblemCodes } from './problem-codes';
import { comparePaths } from './zip';

/** Everything one export run needs. */
export interface ExportRequest {
  project: Project;
  registry: ElementKindRegistry;
  target: Target;
  /** Schema index for `target`, used by the validation gate. */
  schemaIndex: SchemaIndex;
  /** When given, `#[id]` strings are checked against it (warnings only). */
  registries?: RegistryIndex;
  exporter: Exporter;
  sink: OutputSink;
  /**
   * Checks one output file that carries a `language` (such as `mcfunction`) and returns its
   * problems. The host injects it (the renderer passes an IPC-backed checker; tests pass the
   * Node service), so the exporters never import a language service. Error problems block
   * the export; warnings and infos pass through. When absent, such files are reported with
   * one `export.language-unchecked` info per language.
   */
  validateText?: (file: OutputFile) => Promise<Problem[]>;
  /** Reads one project asset's bytes, given its namespace and asset path. */
  readAsset(namespace: string, path: string): Promise<Uint8Array>;
  meta: { msmVersion: string; plugins: string[] };
}

/** The outcome of one export run. */
export interface ExportReport {
  /** `true` when no error problem was found and the exporter finished. */
  ok: boolean;
  /** Every problem, in pipeline order: lowering, assets, merge, validation, exporter. */
  problems: Problem[];
  /** Paths written to the sink, in write order; empty when the export was blocked. */
  files: string[];
}

/** A file's merge key: layer and path. */
function fileKey(file: OutputFile): string {
  return `${file.layer}\u0000${file.path}`;
}

/** The JSON value to validate, or a problem when bytes are not UTF-8 JSON. */
function jsonContents(file: OutputFile): { value: Json } | { problem: Problem } {
  if (!(file.contents instanceof Uint8Array)) return { value: file.contents };
  try {
    return { value: JSON.parse(utf8.decode(file.contents)) as Json };
  } catch (error) {
    return {
      problem: {
        severity: 'error',
        code: ExportProblemCodes.invalidJson,
        file: file.path,
        message: `${file.path} is validated against ${file.schema} but is not UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/** Validates one file against its schema; files without `schema` pass unchecked. */
function validateFile(
  file: OutputFile,
  schemaIndex: SchemaIndex,
  registries: RegistryIndex | undefined,
): Problem[] {
  if (file.schema === undefined) return [];
  let node: SchemaNode;
  try {
    node = schemaIndex.resolveSchemaRef(file.schema);
  } catch {
    return [
      {
        severity: 'error',
        code: ExportProblemCodes.unknownSchema,
        file: file.path,
        message: `${file.path} names schema ${file.schema}, which the schema index does not know.`,
      },
    ];
  }
  const contents = jsonContents(file);
  if ('problem' in contents) return [contents.problem];
  const options = registries === undefined ? {} : { registries };
  return validateJson(contents.value, node, options).map((schemaProblem) => {
    const problem: Problem = {
      severity: schemaProblem.severity,
      code: schemaProblem.code,
      file: file.path,
      message: `${file.path}: ${schemaProblem.message}`,
    };
    if (schemaProblem.path !== '') problem.path = schemaProblem.path;
    return problem;
  });
}

/**
 * Checks every file with a `language` through `validateText`, one file at a time in the
 * given (sorted) order. Problems without a `file` are attributed to the checked file; a
 * throw becomes `export.text-validation-failed`.
 */
async function validateTextFiles(
  files: readonly OutputFile[],
  validateText: ExportRequest['validateText'],
): Promise<Problem[]> {
  const problems: Problem[] = [];
  const unchecked = new Map<string, number>();
  for (const file of files) {
    if (file.language === undefined) continue;
    if (validateText === undefined) {
      unchecked.set(file.language, (unchecked.get(file.language) ?? 0) + 1);
      continue;
    }
    try {
      for (const problem of await validateText(file)) {
        problems.push(problem.file === undefined ? { ...problem, file: file.path } : problem);
      }
    } catch (error) {
      problems.push({
        severity: 'error',
        code: ExportProblemCodes.textValidationFailed,
        file: file.path,
        message: `${file.path} could not be checked as ${file.language}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  for (const [language, count] of [...unchecked].sort((a, b) => comparePaths(a[0], b[0]))) {
    problems.push({
      severity: 'info',
      code: ExportProblemCodes.languageUnchecked,
      message: `${count} ${language} file(s) were exported without being checked: no ${language} checker is available.`,
    });
  }
  return problems;
}

/**
 * Runs one export.
 *
 * 1. Lowers the project with `lowerProject` (unknown kinds, thrown lowering and lowering
 *    conflicts are errors).
 * 2. Adds the project's assets (`assetOutputFiles`).
 * 3. Keeps only files of the exporter's layers (an `export.layer-skipped` info per skipped
 *    layer), rejects unsafe paths (`export.unsafe-path`) and merges: an asset at a path a
 *    lowered file already uses is an `export.conflict` error.
 * 4. Validates every file that names a `schema` against the schema index. Schema errors
 *    block; warnings pass through.
 *    4b. Checks every file with a `language` through `request.validateText`; its error
 *    problems block, warnings pass through. Without a checker, one
 *    `export.language-unchecked` info per language; a throwing checker is
 *    `export.text-validation-failed`.
 * 5. When any error was found, returns `ok: false` without writing anything. Otherwise runs
 *    the exporter, which writes to the sink; an exporter error problem or a throw makes the
 *    report not ok.
 *
 * @param request - The project, target, exporter, sink and host facts.
 * @returns The report: whether the export succeeded, its problems and the files written.
 */
export async function runExport(request: ExportRequest): Promise<ExportReport> {
  const { project, registry, target, schemaIndex, registries, exporter } = request;
  const problems: Problem[] = [];

  const lowered = lowerProject(project, registry, target);
  problems.push(...lowered.problems);
  const assets = await assetOutputFiles(project, request.readAsset);
  problems.push(...assets.problems);

  const layers = new Set(exporter.layers);
  const skipped = new Map<string, number>();
  const merged = new Map<string, OutputFile>();
  for (const file of [...lowered.files, ...assets.files]) {
    if (!layers.has(file.layer)) {
      skipped.set(file.layer, (skipped.get(file.layer) ?? 0) + 1);
      continue;
    }
    if (!isProjectRelativePath(file.path)) {
      problems.push({
        severity: 'error',
        code: ExportProblemCodes.unsafePath,
        file: file.path,
        message: `Output path ${JSON.stringify(file.path)} is not a safe relative path; it must not be absolute or contain backslashes, empty, "." or ".." segments.`,
      });
      continue;
    }
    const key = fileKey(file);
    if (merged.has(key)) {
      problems.push({
        severity: 'error',
        code: ExportProblemCodes.conflict,
        file: file.path,
        message: `More than one output file has the ${file.layer} path ${file.path}.`,
      });
      continue;
    }
    merged.set(key, file);
  }
  for (const [layer, count] of [...skipped].sort((a, b) => comparePaths(a[0], b[0]))) {
    problems.push({
      severity: 'info',
      code: ExportProblemCodes.layerSkipped,
      message: `${count} ${layer} file(s) are not packaged by ${exporter.displayName} and were left out.`,
    });
  }

  const files = [...merged.values()].sort(
    (a, b) => comparePaths(a.layer, b.layer) || comparePaths(a.path, b.path),
  );
  for (const file of files) problems.push(...validateFile(file, schemaIndex, registries));
  problems.push(...(await validateTextFiles(files, request.validateText)));

  const hasError = (): boolean => problems.some((problem) => problem.severity === 'error');
  if (hasError()) return { ok: false, problems, files: [] };

  const written: string[] = [];
  const sink: OutputSink = {
    async writeFile(path, contents) {
      if (!isProjectRelativePath(path)) {
        throw new Error(`Exporter wrote to unsafe path ${JSON.stringify(path)}.`);
      }
      await request.sink.writeFile(path, contents);
      written.push(path);
    },
  };
  try {
    await exporter.run({
      projectName: project.name,
      target,
      files,
      sink,
      problems: { report: (problem) => problems.push(problem) },
      meta: request.meta,
    });
  } catch (error) {
    problems.push({
      severity: 'error',
      code: ExportProblemCodes.failed,
      message: `${exporter.displayName} failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  return { ok: !hasError(), problems, files: written };
}
