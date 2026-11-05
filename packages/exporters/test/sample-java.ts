/**
 * Shared by `sample-mod.java.golden.test.ts` and `sample-mob.java.golden.test.ts`: loads a
 * committed sample project from `fixtures/`, exports it as a Java project into memory, hashes
 * the file list and contents, and writes the project to disk with the real Gradle wrapper
 * from `engine-mod/` (for CI's ejected builds, B139).
 */
import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type DirEntry,
  type ElementKindRegistry,
  loadProject,
  type ProjectFileSystem,
  utf8,
} from '@msm/core';
import type { Problem, Target } from '@msm/plugin-api';
import type { TargetBundle } from '@msm/targets';
import { createJavaProjectExporter, createMemorySink, type GradleWrapper, runExport } from '../src/index';
import { indexesFor } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '..', '..', '..');

/** A read-only project file system over a fixture folder. */
export function fixtureFs(root: string): ProjectFileSystem {
  const resolve = (path: string): string => join(root, ...path.split('/'));
  const readOnly = async (): Promise<never> => {
    throw new Error('The sample project is read-only in tests.');
  };
  return {
    readFile: async (path) => new Uint8Array(await readFile(resolve(path))),
    async readDir(path) {
      const entries = await readdir(resolve(path), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map(
          (entry): DirEntry => ({
            name: entry.name,
            kind: entry.isDirectory() ? 'directory' : 'file',
          }),
        );
    },
    async exists(path) {
      try {
        await stat(resolve(path));
        return true;
      } catch {
        return false;
      }
    },
    writeFile: readOnly,
    mkdirp: readOnly,
    remove: readOnly,
  };
}

/** The engine-mod Gradle wrapper, as the app serves it. */
export async function engineModWrapper(): Promise<GradleWrapper> {
  const engine = join(repoRoot, 'engine-mod');
  return {
    jar: new Uint8Array(await readFile(join(engine, 'gradle', 'wrapper', 'gradle-wrapper.jar'))),
    gradlew: await readFile(join(engine, 'gradlew'), 'utf8'),
    gradlewBat: await readFile(join(engine, 'gradlew.bat'), 'utf8'),
  };
}

/** A small stand-in wrapper, so the pinned hash does not follow the engine-mod wrapper. */
export const STUB_WRAPPER: GradleWrapper = {
  jar: utf8.encode('PK stub gradle-wrapper.jar'),
  gradlew: '#!/bin/sh\necho stub gradlew\n',
  gradlewBat: '@echo stub gradlew.bat\r\n',
};

/** Exports a fixture as a Java project; returns the files and problems. */
export async function exportJavaProject(input: {
  root: string;
  registry: ElementKindRegistry;
  bundle: TargetBundle;
  target?: Target;
  meta: { msmVersion: string; plugins: string[] };
  wrapper: GradleWrapper | undefined;
}): Promise<{ files: Map<string, Uint8Array>; problems: Problem[]; ok: boolean }> {
  const fs = fixtureFs(input.root);
  const { project, problems: loadProblems } = await loadProject(fs, input.registry);
  if (loadProblems.length > 0) throw new Error(JSON.stringify(loadProblems));
  const { schemaIndex, registries } = await indexesFor(input.bundle);
  const sink = createMemorySink();
  const report = await runExport({
    project,
    registry: input.registry,
    target: input.target ?? input.bundle.target,
    schemaIndex,
    registries,
    exporter: createJavaProjectExporter({ loadGradleWrapper: async () => input.wrapper }),
    sink,
    readAsset: (namespace, path) => fs.readFile(`assets/${namespace}/${path}`),
    meta: input.meta,
  });
  return { files: sink.files(), problems: report.problems, ok: report.ok };
}

/** SHA-256 over the sorted paths and contents: `<path>\0<length>\0<bytes>` per file. */
export function treeHash(files: Map<string, Uint8Array>): string {
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    const data = files.get(path) as Uint8Array;
    hash.update(`${path}\0${data.length}\0`);
    hash.update(data);
  }
  return hash.digest('hex');
}

/** Writes a project to `folder/<mod id>/` and makes `gradlew` executable. */
export async function writeTree(files: Map<string, Uint8Array>, folder: string): Promise<void> {
  for (const [path, data] of files) {
    const file = join(folder, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  if (files.has('gradlew')) await chmod(join(folder, 'gradlew'), 0o755);
}
