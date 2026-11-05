/**
 * Loading a project from a {@link ProjectFileSystem}.
 *
 * @packageDocumentation
 */

import type {
  Asset,
  Element,
  ElementCreatorMeta,
  ElementMeta,
  Json,
  JsonObject,
  Namespace,
  Problem,
  Project,
  ResourceLocation,
} from '@msm/plugin-api';
import type { ProjectFileSystem } from '../fs/project-file-system';
import { ELEMENT_FORMAT_VERSION, PROJECT_FORMAT_VERSION } from '../model/project';
import { isResourceLocation, isValidNamespace } from '../model/resource-location';
import { ProblemCodes } from '../problems/codes';
import type { ElementKindRegistry } from '../registry/element-kind-registry';
import { parseJson, utf8 } from '../serialise/stable-json';
import { ASSETS_DIR, CONTENT_DIR, elementFilePath, mediaTypeForPath, PROJECT_FILE } from './layout';
import { migrateDocument } from './migrate';
import { elementMigrators, projectMigrators } from './migrators';
import { createSaveManifest, folderForKind, type SaveManifest } from './save';
import { listDirectories, walkFiles } from './walk';

/** The result of {@link loadProject}. */
export interface LoadResult {
  /** The loaded project. */
  project: Project;
  /**
   * Everything that was wrong but recoverable, in discovery order. Problems about one file
   * carry its project-relative path in `file`.
   */
  problems: Problem[];
  /**
   * The element files actually loaded. Pass it to `saveProject` so that saving deletes only
   * files this load read; skipped files are not listed and stay on disk (ADR 0012).
   */
  manifest: SaveManifest;
}

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: Json | undefined): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Reads the project file, migrates it and checks its shape.
 */
async function readProjectFile(
  fs: ProjectFileSystem,
  problems: Problem[],
): Promise<{ header: Omit<Project, 'namespaces'>; listed: string[] }> {
  let raw: Json;
  try {
    raw = parseJson(utf8.decode(await fs.readFile(PROJECT_FILE)));
  } catch (error) {
    throw new Error(
      `Cannot read ${PROJECT_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isObject(raw)) throw new Error(`${PROJECT_FILE} must contain a JSON object.`);
  const document = migrateDocument(raw, projectMigrators, PROJECT_FORMAT_VERSION);

  const invalid = (field: string, expected: string): void => {
    problems.push({
      severity: 'warning',
      code: ProblemCodes.projectInvalidShape,
      file: PROJECT_FILE,
      message: `${PROJECT_FILE}: "${field}" must be ${expected}; a default was used.`,
    });
  };

  let name = '';
  if (typeof document.name === 'string') name = document.name;
  else invalid('name', 'a string');

  let targets: string[] = [];
  if (isStringArray(document.targets)) targets = [...document.targets];
  else invalid('targets', 'an array of strings');

  let plugins: string[] = [];
  if (isStringArray(document.plugins)) plugins = [...document.plugins];
  else invalid('plugins', 'an array of strings');

  let settings: Record<string, Json> = {};
  if (isObject(document.settings)) settings = { ...document.settings };
  else invalid('settings', 'an object');

  const listed: string[] = [];
  if (Array.isArray(document.namespaces)) {
    for (const entry of document.namespaces) {
      if (typeof entry === 'string' && isValidNamespace(entry)) {
        if (!listed.includes(entry)) listed.push(entry);
      } else {
        problems.push({
          severity: 'warning',
          code: ProblemCodes.projectInvalidShape,
          file: PROJECT_FILE,
          message: `${PROJECT_FILE}: namespace ${JSON.stringify(entry)} is not a valid namespace name and was ignored.`,
        });
      }
    }
  } else {
    invalid('namespaces', 'an array of namespace names');
  }

  return {
    header: { formatVersion: PROJECT_FORMAT_VERSION, name, plugins, settings, targets },
    listed,
  };
}

/** A Creator parameter value: a string, number, boolean or array of strings. */
function isCreatorValue(value: Json | undefined): value is string | number | boolean | string[] {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    isStringArray(value)
  );
}

/**
 * `meta.creator` (ADR 0043 D4), or `undefined` when it is absent or malformed. A malformed
 * value is dropped like an unknown field: it is bookkeeping, so the element still loads.
 */
function toCreatorMeta(value: Json | undefined): ElementCreatorMeta | undefined {
  if (!isObject(value)) return undefined;
  const { flowId, generatedId, setId, values } = value;
  if (typeof flowId !== 'string' || typeof setId !== 'string') return undefined;
  if (typeof generatedId !== 'string' || !isObject(values)) return undefined;
  const copied: Record<string, string | number | boolean | string[]> = {};
  for (const [key, entry] of Object.entries(values)) {
    if (!isCreatorValue(entry)) return undefined;
    copied[key] = Array.isArray(entry) ? [...entry] : entry;
  }
  return { flowId, generatedId, setId, values: copied };
}

/**
 * Checks a migrated element document and builds the element, or returns why it is invalid.
 */
function toElement(document: JsonObject): Element | string {
  const { data, id, kind, meta } = document;
  if (typeof id !== 'string' || !isResourceLocation(id)) return '"id" must be a resource location';
  if (typeof kind !== 'string' || kind === '') return '"kind" must be a non-empty string';
  if (data === undefined) return '"data" is missing';
  if (!isObject(meta)) return '"meta" must be an object';
  if (typeof meta.createdAt !== 'string') return '"meta.createdAt" must be a string';
  const elementMeta: ElementMeta = { createdAt: meta.createdAt };
  if (meta.notes !== undefined) {
    if (typeof meta.notes !== 'string') return '"meta.notes" must be a string';
    elementMeta.notes = meta.notes;
  }
  if (meta.tags !== undefined) {
    if (!isStringArray(meta.tags)) return '"meta.tags" must be an array of strings';
    elementMeta.tags = [...meta.tags];
  }
  const creator = toCreatorMeta(meta.creator);
  if (creator !== undefined) elementMeta.creator = creator;
  return {
    data,
    formatVersion: ELEMENT_FORMAT_VERSION,
    id: id as ResourceLocation,
    kind,
    meta: elementMeta,
  };
}

/**
 * Loads a project.
 *
 * Reads and migrates `msm.project.json`, then every `content/<ns>/**.json` element file and
 * every `assets/<ns>/**` file. Recoverable faults become problems; elements of unknown kinds
 * are still loaded so that saving keeps them. Namespaces, elements (by id) and assets (by
 * path) are sorted.
 *
 * @param fs - The project file system.
 * @param registry - The kind registry.
 * @returns The project, the problems found and the manifest of loaded element files.
 * @throws `UnsupportedFormatVersionError` If the project file or an element file has a
 *   `formatVersion` newer than this build supports, or no migration path exists.
 * @throws Error If `msm.project.json` is missing, unreadable or not a JSON object.
 */
export async function loadProject(
  fs: ProjectFileSystem,
  registry: ElementKindRegistry,
): Promise<LoadResult> {
  const problems: Problem[] = [];
  const { header, listed } = await readProjectFile(fs, problems);

  const names = new Set(listed);
  const onDisk = [
    ...(await listDirectories(fs, CONTENT_DIR)),
    ...(await listDirectories(fs, ASSETS_DIR)),
  ];
  for (const name of [...new Set(onDisk)].sort()) {
    if (names.has(name) || !isValidNamespace(name)) continue;
    names.add(name);
    problems.push({
      severity: 'warning',
      code: ProblemCodes.projectUnlistedNamespace,
      message: `Namespace "${name}" exists on disk but is not listed in ${PROJECT_FILE}; it was added.`,
    });
  }

  const seen = new Set<string>();
  const loaded: string[] = [];
  const namespaces: Namespace[] = [];
  for (const name of [...names].sort()) {
    const elements: Element[] = [];
    for (const path of await walkFiles(fs, `${CONTENT_DIR}/${name}`)) {
      if (!path.endsWith('.json')) continue;
      const element = await loadElement(fs, registry, name, path, problems);
      if (element === undefined) continue;
      if (seen.has(element.id)) {
        problems.push({
          severity: 'error',
          code: ProblemCodes.elementDuplicateId,
          elementId: element.id,
          file: path,
          message: `${path}: another file already declares id "${element.id}"; this file was skipped.`,
        });
        continue;
      }
      seen.add(element.id);
      elements.push(element);
      loaded.push(path);
    }
    elements.sort((a, b) => compare(a.id, b.id));

    const assetRoot = `${ASSETS_DIR}/${name}/`;
    const assets: Asset[] = (await walkFiles(fs, `${ASSETS_DIR}/${name}`)).map((path) => {
      const relative = path.slice(assetRoot.length);
      return { path: relative, mediaType: mediaTypeForPath(relative) };
    });
    assets.sort((a, b) => compare(a.path, b.path));

    namespaces.push({ name, elements, assets });
  }

  return { project: { ...header, namespaces }, problems, manifest: createSaveManifest(loaded) };
}

async function loadElement(
  fs: ProjectFileSystem,
  registry: ElementKindRegistry,
  namespace: string,
  path: string,
  problems: Problem[],
): Promise<Element | undefined> {
  let raw: Json;
  try {
    raw = parseJson(utf8.decode(await fs.readFile(path)));
  } catch (error) {
    problems.push({
      severity: 'error',
      code: ProblemCodes.elementInvalidJson,
      file: path,
      message: `${path}: not valid JSON (${error instanceof Error ? error.message : String(error)}); the file was skipped.`,
    });
    return undefined;
  }
  const invalidShape = (reason: string): undefined => {
    problems.push({
      severity: 'error',
      code: ProblemCodes.elementInvalidShape,
      file: path,
      message: `${path}: ${reason}; the file was skipped.`,
    });
    return undefined;
  };
  if (!isObject(raw)) return invalidShape('an element file must contain a JSON object');
  const version = raw.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return invalidShape('"formatVersion" must be a positive integer');
  }
  const element = toElement(migrateDocument(raw, elementMigrators, ELEMENT_FORMAT_VERSION));
  if (typeof element === 'string') return invalidShape(element);

  const idNamespace = element.id.slice(0, element.id.indexOf(':'));
  if (idNamespace !== namespace) {
    problems.push({
      severity: 'warning',
      code: ProblemCodes.elementIdMismatch,
      elementId: element.id,
      file: path,
      message: `${path}: id "${element.id}" is not in namespace "${namespace}", the directory it was found in.`,
    });
  }
  if (registry.get(element.kind) === undefined) {
    problems.push({
      severity: 'warning',
      code: ProblemCodes.elementUnknownKind,
      elementId: element.id,
      file: path,
      message: `${path}: kind "${element.kind}" is not registered; the element is kept unchanged.`,
    });
  } else if (idNamespace === namespace) {
    const expected = elementFilePath(element, folderForKind(registry, element.kind));
    if (expected !== path) {
      problems.push({
        severity: 'warning',
        code: ProblemCodes.elementFolderMismatch,
        elementId: element.id,
        file: path,
        message: `${path}: an element of kind "${element.kind}" with this id belongs at ${expected}; it moves there on save.`,
      });
    }
  }
  return element;
}
