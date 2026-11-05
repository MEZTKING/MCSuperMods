import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommandStack, commands, createMemoryFileSystem, type Project } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { newSession, nodeMcfunctionChecker } from './session-fixture';

const SAMPLE_MOD = fileURLToPath(new URL('../../fixtures/sample-mod/', import.meta.url));

async function readTree(root: string): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files[relative(root, path).split('\\').join('/')] = new Uint8Array(await readFile(path));
    }
  };
  await walk(root);
  return files;
}

async function openSampleMod(withChecker = false) {
  const fs = createMemoryFileSystem(await readTree(SAMPLE_MOD));
  const { session } = newSession(
    fs,
    { directory: '/projects/sample-mod' },
    withChecker ? { mcfunction: await nodeMcfunctionChecker() } : {},
  );
  const opened = await session.openProject();
  expect(opened).toEqual({ ok: true });
  await session.flushValidation();
  return session;
}

describe('ProjectSession.checkProject (ADR 0041 D4)', () => {
  it('returns the same problems as the live pass for fixtures/sample-mod', async () => {
    const session = await openSampleMod(true);
    const project = session.snapshot.project as Project;
    const before = session.snapshot;
    const problems = await session.checkProject(project);
    expect(problems).toEqual(session.snapshot.problems);
    // No state change.
    expect(session.snapshot).toBe(before);
  }, 60_000);

  it('finds an injected error in a scratch project and leaves the live project alone', async () => {
    const session = await openSampleMod();
    const project = session.snapshot.project as Project;
    const live = await session.checkProject(project);
    const stack = new CommandStack(project);
    stack.execute(
      commands.setElementValue('msm_sample_mod:ruby_ore', '/components/msm:breakable/hardness', 'very hard'),
    );
    const scratch = stack.state;
    const problems = await session.checkProject(scratch);
    const injected = problems.filter(
      (problem) => problem.elementId === 'msm_sample_mod:ruby_ore' && problem.severity === 'error',
    );
    expect(injected.length).toBeGreaterThan(0);
    expect(injected.some((problem) => problem.path === '/components/msm:breakable/hardness')).toBe(true);
    expect(live.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(session.problemsFor('msm_sample_mod:ruby_ore').filter((p) => p.severity === 'error')).toEqual(
      [],
    );
  }, 60_000);

  it('validates element data against a given project (schema pass only)', async () => {
    const session = await openSampleMod();
    const project = session.snapshot.project as Project;
    const problems = await session.validateElementData(
      'msm:block',
      'msm_sample_mod:extra',
      { hardness: 'soft' },
      project,
    );
    expect(problems.some((problem) => problem.severity === 'error')).toBe(true);
    expect(problems.every((problem) => problem.elementId === 'msm_sample_mod:extra')).toBe(true);
    await expect(
      session.validateElementData('nope:kind', 'msm_sample_mod:extra', {}, project),
    ).rejects.toThrow(/Unknown element kind/);
  }, 60_000);
});
