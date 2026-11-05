/**
 * Saving a project to a {@link ProjectFileSystem}.
 *
 * @packageDocumentation
 */

import type { Element, Json, JsonObject, Project } from '@msm/plugin-api';
import { isProjectRelativePath, parentPath } from '../fs/paths';
import type { ProjectFileSystem } from '../fs/project-file-system';
import { ELEMENT_FORMAT_VERSION, PROJECT_FORMAT_VERSION } from '../model/project';
import type { ElementKindRegistry } from '../registry/element-kind-registry';
import { stableStringify, utf8 } from '../serialise/stable-json';
import {
  ASSETS_DIR,
  CONTENT_DIR,
  elementFilePath,
  PROJECT_FILE,
  unknownKindFolder,
} from './layout';

/**
 * The document written to `msm.project.json`. Elements are not inlined.
 *
 * @param project - The project.
 */
export function projectDocument(project: Project): JsonObject {
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    name: project.name,
    namespaces: project.namespaces.map((namespace) => namespace.name).sort(),
    plugins: [...project.plugins],
    settings: { ...project.settings },
    targets: [...project.targets],
  };
}

/**
 * The document written to an element's file.
 *
 * @param element - The element.
 */
export function elementDocument(element: Element): JsonObject {
  const meta: JsonObject = { createdAt: element.meta.createdAt };
  if (element.meta.notes !== undefined) meta.notes = element.meta.notes;
  if (element.meta.tags !== undefined) meta.tags = [...element.meta.tags];
  const creator = element.meta.creator;
  if (creator !== undefined) {
    meta.creator = {
      flowId: creator.flowId,
      generatedId: creator.generatedId,
      setId: creator.setId,
      values: Object.fromEntries(
        Object.entries(creator.values).map(([key, value]) => [
          key,
          Array.isArray(value) ? [...value] : value,
        ]),
      ),
    };
  }
  return {
    data: element.data as Json,
    formatVersion: ELEMENT_FORMAT_VERSION,
    id: element.id,
    kind: element.kind,
    meta,
  };
}

/**
 * The kind-folder an element is saved under: its registered kind's folder, or
 * `_unknown/<kind namespace>/<kind path>` for unregistered kinds so they stay lossless.
 *
 * @param registry - The kind registry.
 * @param kind - The element's kind id.
 */
export function folderForKind(registry: ElementKindRegistry, kind: string): string {
  return registry.folderFor(kind) ?? unknownKindFolder(kind);
}

/**
 * The element files a session knows it owns: the paths `loadProject` loaded, or the paths
 * the last `saveProject` wrote. Saving deletes only files listed here (ADR 0012).
 */
export interface SaveManifest {
  /** The manifest format version. */
  formatVersion: 1;
  /** Project-relative element file paths, sorted. */
  elementFiles: string[];
}

/** Options for {@link saveProject}. */
export interface SaveOptions {
  /**
   * The manifest from the last load or save. Element files listed in it that this save
   * does not write are deleted. Without a manifest nothing is deleted.
   */
  manifest?: SaveManifest;
}

/** The result of {@link saveProject}. */
export interface SaveResult {
  /** The new manifest: every element file this save wrote. Keep it for the next save. */
  manifest: SaveManifest;
  /** Every file written, sorted (`msm.project.json` and the element files). */
  written: string[];
  /** Every element file deleted, sorted. */
  removed: string[];
}

/**
 * Builds a manifest from element file paths, sorted and without duplicates.
 *
 * @param elementFiles - Project-relative element file paths.
 */
export function createSaveManifest(elementFiles: Iterable<string>): SaveManifest {
  return { formatVersion: 1, elementFiles: [...new Set(elementFiles)].sort(cmp) };
}

/** Whether a manifest entry is a path save may delete: a JSON file under `content/`. */
function isDeletableElementFile(path: string): boolean {
  return (
    isProjectRelativePath(path) && path.startsWith(`${CONTENT_DIR}/`) && path.endsWith('.json')
  );
}

/**
 * Removes the directories a deleted file leaves empty, walking up from its parent and
 * stopping below `content/`.
 */
async function removeEmptyParents(fs: ProjectFileSystem, file: string): Promise<void> {
  let directory = parentPath(file);
  while (directory.startsWith(`${CONTENT_DIR}/`)) {
    if (!(await fs.exists(directory))) {
      directory = parentPath(directory);
      continue;
    }
    if ((await fs.readDir(directory)).length > 0) return;
    await fs.remove(directory);
    directory = parentPath(directory);
  }
}

/**
 * Saves a project.
 *
 * Writes `msm.project.json` and one file per element under `content/`, and creates
 * `assets/<ns>/` for every namespace. Element files listed in `options.manifest` that are no
 * longer written (removed or moved elements) are deleted, together with the directories
 * those deletions leave empty. No other file is ever deleted: files that load skipped stay
 * on disk (ADR 0012). Asset bytes are owned by the host and are never written here; `.msm/`
 * is never touched. Output is deterministic.
 *
 * @param fs - The project file system.
 * @param project - The project to save.
 * @param registry - The kind registry, used for kind-folders.
 * @param options - The manifest from the last load or save.
 * @returns The new manifest and the files written and removed.
 * @throws Error If two elements map to the same file.
 */
export async function saveProject(
  fs: ProjectFileSystem,
  project: Project,
  registry: ElementKindRegistry,
  options: SaveOptions = {},
): Promise<SaveResult> {
  const planned = new Map<string, Uint8Array>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const path = elementFilePath(element, folderForKind(registry, element.kind));
      if (planned.has(path)) {
        throw new Error(`Two elements would be saved to ${JSON.stringify(path)}.`);
      }
      planned.set(path, utf8.encode(stableStringify(elementDocument(element))));
    }
  }
  const elementFiles = [...planned.keys()].sort(cmp);

  await fs.writeFile(PROJECT_FILE, utf8.encode(stableStringify(projectDocument(project))));
  for (const path of elementFiles) {
    await fs.writeFile(path, planned.get(path) as Uint8Array);
  }

  const removed: string[] = [];
  for (const path of createSaveManifest(options.manifest?.elementFiles ?? []).elementFiles) {
    if (planned.has(path) || !isDeletableElementFile(path)) continue;
    if (!(await fs.exists(path))) continue;
    await fs.remove(path);
    removed.push(path);
    await removeEmptyParents(fs, path);
  }

  for (const namespace of [...project.namespaces].sort((a, b) => cmp(a.name, b.name))) {
    await fs.mkdirp(`${ASSETS_DIR}/${namespace.name}`);
  }

  return {
    manifest: { formatVersion: 1, elementFiles },
    written: [PROJECT_FILE, ...elementFiles].sort(cmp),
    removed,
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
