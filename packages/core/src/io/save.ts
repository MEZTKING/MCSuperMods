/**
 * Saving a project to a {@link ProjectFileSystem}.
 *
 * @packageDocumentation
 */

import type { Element, Json, JsonObject, Project } from '@msm/plugin-api';
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
import { walkFiles } from './walk';

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

async function removeEmptyDirectories(fs: ProjectFileSystem, directory: string): Promise<boolean> {
  const entries = await fs.readDir(directory);
  let empty = true;
  for (const entry of entries) {
    if (entry.kind === 'directory') {
      if (!(await removeEmptyDirectories(fs, `${directory}/${entry.name}`))) empty = false;
    } else {
      empty = false;
    }
  }
  if (empty) await fs.remove(directory);
  return empty;
}

/**
 * Saves a project.
 *
 * Writes `msm.project.json` and one file per element under `content/`, deletes any other
 * `*.json` file under `content/` (stale elements) and the directories that leaves empty,
 * and creates `assets/<ns>/` for every namespace. Asset bytes are owned by the host and are
 * never written here; `.msm/` is never touched. Output is deterministic.
 *
 * @param fs - The project file system.
 * @param project - The project to save.
 * @param registry - The kind registry, used for kind-folders.
 * @throws Error If two elements map to the same file.
 */
export async function saveProject(
  fs: ProjectFileSystem,
  project: Project,
  registry: ElementKindRegistry,
): Promise<void> {
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

  await fs.writeFile(PROJECT_FILE, utf8.encode(stableStringify(projectDocument(project))));
  for (const path of [...planned.keys()].sort()) {
    await fs.writeFile(path, planned.get(path) as Uint8Array);
  }

  for (const path of await walkFiles(fs, CONTENT_DIR)) {
    if (path.endsWith('.json') && !planned.has(path)) await fs.remove(path);
  }
  if (await fs.exists(CONTENT_DIR)) {
    for (const entry of await fs.readDir(CONTENT_DIR)) {
      if (entry.kind === 'directory') {
        await removeEmptyDirectories(fs, `${CONTENT_DIR}/${entry.name}`);
      }
    }
  }

  for (const namespace of [...project.namespaces].sort((a, b) => cmp(a.name, b.name))) {
    await fs.mkdirp(`${ASSETS_DIR}/${namespace.name}`);
  }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
