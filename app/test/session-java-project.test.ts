import { createMemoryFileSystem } from '@msm/core';
import { ExportProblemCodes } from '@msm/exporters';
import { SCRIPT_KIND } from '@msm/plugin-scripting';
import { describe, expect, it } from 'vitest';
import type { ExportTreeFile, GradleWrapperFiles, WriteTreeResult } from '../src/shared/platform';
import { newSession } from './session-fixture';

const wrapper: GradleWrapperFiles = {
  jar: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  gradlew: '#!/bin/sh\n',
  gradlewBat: '@echo off\r\n',
};

async function openSession(
  options: {
    pick?: string | null;
    writeResult?: (folder: string, files: ExportTreeFile[]) => WriteTreeResult;
    gradle?: GradleWrapperFiles | null;
  } = {},
) {
  const fs = createMemoryFileSystem();
  const { session, platform } = newSession(fs);
  const picks: string[] = [];
  const trees: { folder: string; files: ExportTreeFile[] }[] = [];
  let wrapperReads = 0;
  platform.exports = {
    ...platform.exports,
    pickFolder: async (title) => {
      picks.push(title);
      return options.pick === undefined ? '/exports/java' : options.pick;
    },
    writeTree: async (folder, files) => {
      trees.push({ folder, files });
      if (options.writeResult !== undefined) return options.writeResult(folder, files);
      const root = files[0]?.path.split('/')[0] ?? '';
      return { ok: true, root: `${folder}/${root}`, count: files.length };
    },
    gradleWrapper: async () => {
      wrapperReads += 1;
      return options.gradle === undefined ? wrapper : options.gradle;
    },
  };
  await session.newProject();
  session.addElement({ id: 'demo:ruby_block', kind: 'msm:block' });
  return { session, picks, trees, wrapperReads: () => wrapperReads };
}

const decode = (bytes: Uint8Array | undefined) =>
  bytes === undefined ? undefined : new TextDecoder().decode(bytes);

describe('ProjectSession.exportJavaProject (ADR 0033)', () => {
  it('writes <folder>/<mod id>/ with the Gradle wrapper and reports the root', async () => {
    const { session, picks, trees, wrapperReads } = await openSession();
    const result = await session.exportJavaProject();
    expect(result.ok, JSON.stringify(result.problems)).toBe(true);
    expect(picks).toEqual(['Export Java project: choose a folder']);
    expect(wrapperReads()).toBe(1);
    expect(trees).toHaveLength(1);
    const tree = trees[0];
    if (tree === undefined) throw new Error('unreachable');
    expect(tree.folder).toBe('/exports/java');
    const paths = tree.files.map((file) => file.path);
    const root = paths[0]?.split('/')[0] ?? '';
    expect(root).toMatch(/^[a-z][a-z0-9_]+$/);
    expect(paths.every((path) => path.startsWith(`${root}/`))).toBe(true);
    for (const expected of [
      'build.gradle.kts',
      'settings.gradle.kts',
      'gradle.properties',
      'README.md',
      'gradlew',
      'gradlew.bat',
      'gradle/wrapper/gradle-wrapper.jar',
      'src/main/resources/fabric.mod.json',
    ]) {
      expect(paths).toContain(`${root}/${expected}`);
    }
    const modJson = JSON.parse(
      decode(
        tree.files.find((file) => file.path === `${root}/src/main/resources/fabric.mod.json`)?.data,
      ) ?? '{}',
    ) as { id?: string; depends?: Record<string, string> };
    expect(modJson.id).toBe(root);
    expect(modJson.depends?.msm_runtime).toBeUndefined();
    expect(paths.some((path) => path.startsWith(`${root}/src/main/java/`))).toBe(true);
    expect(result.location).toBe(`/exports/java/${root}`);
  });

  it('writes into a given folder without asking', async () => {
    const { session, picks, trees } = await openSession();
    const result = await session.exportJavaProject('/exports/picked');
    expect(result.ok).toBe(true);
    expect(picks).toEqual([]);
    expect(trees[0]?.folder).toBe('/exports/picked');
  });

  it('reports a cancelled folder pick and writes nothing', async () => {
    const { session, trees } = await openSession({ pick: null });
    const result = await session.exportJavaProject();
    expect(result.ok).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.location).toBeUndefined();
    expect(trees).toEqual([]);
  });

  it('turns a non-empty root folder into the blocking export.folder-not-empty', async () => {
    const { session } = await openSession({
      writeResult: (folder, files) => ({
        ok: false,
        reason: 'folder-not-empty',
        root: `${folder}/${files[0]?.path.split('/')[0]}`,
      }),
    });
    const result = await session.exportJavaProject();
    expect(result.ok).toBe(false);
    const problem = result.problems[0];
    expect(problem?.code).toBe('export.folder-not-empty');
    expect(problem?.severity).toBe('error');
    expect(problem?.message).toMatch(
      /^The folder \/exports\/java\/\w+ already exists and is not empty\.$/,
    );
    expect(result.location).toBeUndefined();
  });

  it('blocks on errors without asking for a folder', async () => {
    const { session, picks, trees } = await openSession();
    session.addElement({
      id: 'demo:broken',
      kind: 'msm:block',
      data: { format: 1, properties: { hardness: 'very' } },
    });
    const result = await session.exportJavaProject();
    expect(result.ok).toBe(false);
    expect(result.problems.some((problem) => problem.severity === 'error')).toBe(true);
    expect(picks).toEqual([]);
    expect(trees).toEqual([]);
  });

  it('writes without the wrapper when main has none, with an info', async () => {
    const { session, trees } = await openSession({ gradle: null });
    const result = await session.exportJavaProject();
    expect(result.ok).toBe(true);
    expect(result.problems.map((problem) => problem.code)).toContain(
      ExportProblemCodes.gradleWrapperMissing,
    );
    expect(trees[0]?.files.some((file) => file.path.endsWith('/gradlew'))).toBe(false);
  });

  it('leaves scripts out with a warning', async () => {
    const { session, trees } = await openSession();
    session.addElement({
      id: 'demo:glow',
      kind: SCRIPT_KIND,
      data: { lines: ['msm.log.info("x");'] },
    });
    const result = await session.exportJavaProject();
    expect(result.ok).toBe(true);
    expect(result.problems.map((problem) => problem.code)).toContain(
      ExportProblemCodes.scriptsNotEjected,
    );
    expect(trees[0]?.files.some((file) => file.path.includes('/script/'))).toBe(false);
  });
});
