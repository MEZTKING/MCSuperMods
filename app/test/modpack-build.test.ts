import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryFileSystem, createModpack } from '@msm/core';
import { targetById } from '@msm/targets';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildModpackJars,
  ModpackProblemCodes,
  modpackMrpack,
} from '../src/renderer/src/modpacks/build';
import type { ModpackView, ProjectSnapshotFile } from '../src/shared/platform';
import { newSession } from './session-fixture';

const SAMPLE_MOD = join(import.meta.dirname, '..', '..', 'fixtures', 'sample-mod');
const runtime = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);

function snapshot(root: string): ProjectSnapshotFile[] {
  const files: ProjectSnapshotFile[] = [
    { path: 'msm.project.json', data: readFileSync(join(root, 'msm.project.json')) },
  ];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs, `${rel}/${name}`);
      else files.push({ path: `${rel}/${name}`, data: new Uint8Array(readFileSync(abs)) });
    }
  };
  for (const folder of ['content', 'assets']) {
    try {
      walk(join(root, folder), folder);
    } catch {
      // No such folder.
    }
  }
  return files;
}

function setup() {
  const { session, platform } = newSession(createMemoryFileSystem());
  platform.exports = { ...platform.exports, runtimeJar: async () => runtime };
  // The fake platform refuses function checks; scratch sessions then check none.
  delete (platform as { mcfunction?: unknown }).mcfunction;
  const reads: string[] = [];
  const modpacks = {
    readProject: async (_root: string, path: string) => {
      reads.push(path);
      return snapshot(SAMPLE_MOD);
    },
  } as unknown as NonNullable<Parameters<typeof buildModpackJars>[1]>;
  return { session, modpacks, reads };
}

function view(members: ModpackView['members']): ModpackView {
  return {
    root: '/packs/ruby',
    modpack: {
      ...createModpack('Ruby pack', 'mc-26.3'),
      projects: members.map(({ path }) => ({ path })),
    },
    members,
  };
}

const member = (path: string, overrides: Partial<ModpackView['members'][number]> = {}) => ({
  path,
  root: `/projects/${path}`,
  found: true,
  name: 'MSM Sample Mod',
  targetId: 'mc-26.3',
  ...overrides,
});

describe('modpack builds', () => {
  it('builds each member jar in a scratch session and writes an .mrpack', async () => {
    const { session, modpacks } = setup();
    const build = await buildModpackJars(session, modpacks, view([member('../sample-mod')]));
    expect(build.problems).toEqual([]);
    expect(build.ok).toBe(true);
    expect(build.jars.map((jar) => jar.modId)).toEqual(['msm_sample_mod']);
    // The open (here: no) project is untouched.
    expect(session.snapshot.project).toBeNull();
    const target = targetById('mc-26.3')?.target;
    if (target === undefined) throw new Error('no target');
    const mrpack = modpackMrpack(view([]).modpack, target, build.jars);
    expect(mrpack.fileName).toBe('Ruby pack-1.0.0.mrpack');
    const files = unzipSync(mrpack.data);
    expect(Object.keys(files).sort()).toEqual([
      'modrinth.index.json',
      'overrides/mods/msm_sample_mod.jar',
    ]);
    const index = JSON.parse(strFromU8(files['modrinth.index.json'] ?? new Uint8Array()));
    expect(index.dependencies).toEqual({
      'fabric-loader': target.fabric?.loader,
      minecraft: '26.3',
    });
    expect(index.files.map((file: { path: string }) => file.path)).toEqual([
      `mods/${target.fabric?.apiModrinth?.fileName}`,
    ]);
    const jar = unzipSync(files['overrides/mods/msm_sample_mod.jar'] ?? new Uint8Array());
    expect(jar['fabric.mod.json']).toBeDefined();
  });

  it('reports missing members, other Minecraft versions and clashing mod ids', async () => {
    const { session, modpacks, reads } = setup();
    const build = await buildModpackJars(
      session,
      modpacks,
      view([
        member('a'),
        member('b'),
        member('gone', { found: false, name: null, targetId: null }),
        member('old', { targetId: 'mc-26.4' }),
      ]),
    );
    expect(build.ok).toBe(false);
    expect(build.problems.map((problem) => problem.code).sort()).toEqual([
      ModpackProblemCodes.duplicateModId,
      ModpackProblemCodes.memberMissing,
      ModpackProblemCodes.targetMismatch,
    ]);
    expect(reads).toEqual(['a', 'b']);
  });

  it('refuses an empty modpack', async () => {
    const { session, modpacks } = setup();
    const build = await buildModpackJars(session, modpacks, view([]));
    expect(build.problems.map((problem) => problem.code)).toEqual([ModpackProblemCodes.empty]);
  });
});
