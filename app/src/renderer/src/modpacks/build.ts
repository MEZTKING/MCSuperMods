/**
 * Modpack builds in the renderer (ADR 0046 D3, D4): each member project is loaded from its
 * read-only snapshot into a scratch session over a memory file system and built into a
 * content jar; the jars then go to the `.mrpack` writer or to Test in Minecraft.
 *
 * @packageDocumentation
 */

import { createMemoryFileSystem, type Modpack } from '@msm/core';
import { createMrpack, mrpackFileName } from '@msm/exporters';
import type { Problem, TargetFacts } from '@msm/plugin-api';
import type { ModpackView, PlatformAdapter } from '../../../shared/platform';
import type { ProjectSession } from '../session/project-session';

/** Problem codes of modpack builds. */
export const ModpackProblemCodes = {
  memberMissing: 'modpack.member-missing',
  targetMismatch: 'modpack.target-mismatch',
  memberErrors: 'modpack.member-errors',
  duplicateModId: 'modpack.duplicate-mod-id',
  empty: 'modpack.empty',
  noFabricApiFile: 'modpack.no-fabric-api-file',
} as const;

/** One built member. */
export interface ModpackJar {
  /** The member path, as listed in the modpack. */
  path: string;
  /** The project's name. */
  name: string;
  modId: string;
  data: Uint8Array;
}

/** The outcome of {@link buildModpackJars}. */
export interface ModpackBuild {
  /** `true` when every member built and nothing blocks. */
  ok: boolean;
  /** Problems, each naming its member in the message. */
  problems: Problem[];
  jars: ModpackJar[];
}

const error = (code: string, message: string): Problem => ({ severity: 'error', code, message });

/**
 * Builds every member's content jar. Members are built one at a time, each in its own scratch
 * session that is disposed afterwards.
 *
 * @param onProgress - Called with the member being built.
 */
export async function buildModpackJars(
  session: ProjectSession,
  modpacks: NonNullable<PlatformAdapter['modpacks']>,
  view: ModpackView,
  onProgress?: (member: string, index: number, total: number) => void,
): Promise<ModpackBuild> {
  const problems: Problem[] = [];
  const jars: ModpackJar[] = [];
  const { modpack } = view;
  if (modpack.projects.length === 0) {
    return {
      ok: false,
      problems: [
        error(ModpackProblemCodes.empty, 'The modpack has no projects yet: add one first.'),
      ],
      jars,
    };
  }
  const total = view.members.length;
  for (const [index, member] of view.members.entries()) {
    const label = member.name ?? member.path;
    onProgress?.(label, index, total);
    if (!member.found) {
      problems.push(
        error(
          ModpackProblemCodes.memberMissing,
          `${member.path}: the project folder was not found.`,
        ),
      );
      continue;
    }
    if (member.targetId !== modpack.targetId) {
      problems.push(
        error(
          ModpackProblemCodes.targetMismatch,
          `${label} is made for ${member.targetId ?? 'an unknown Minecraft version'}, but the modpack is for ${modpack.targetId}. Open it and use Upgrade Project Target, or change the modpack's Minecraft version.`,
        ),
      );
      continue;
    }
    const files = await modpacks.readProject(view.root, member.path);
    const fs = createMemoryFileSystem(
      Object.fromEntries(files.map((file) => [file.path, file.data])),
    );
    const scratch = session.createScratch(fs);
    try {
      const loaded = await scratch.loadSnapshot(member.path);
      if (!loaded.ok) {
        problems.push(
          error(
            ModpackProblemCodes.memberErrors,
            `${label} could not be loaded${'reason' in loaded ? `: ${loaded.reason}` : '.'}`,
          ),
        );
        continue;
      }
      const built = await scratch.buildContentJar();
      if (built.data === undefined) {
        const errors = built.report.problems.filter((problem) => problem.severity === 'error');
        const first = errors[0]?.message.replace(/\.$/, '');
        problems.push(
          error(
            ModpackProblemCodes.memberErrors,
            `${label} has ${errors.length} error(s)${first === undefined ? '' : `, for example: ${first}`}. Open it and fix them first.`,
          ),
        );
        continue;
      }
      jars.push({ path: member.path, name: label, modId: built.modId, data: built.data });
    } finally {
      scratch.dispose();
    }
  }
  const byModId = new Map<string, string>();
  for (const jar of jars) {
    const other = byModId.get(jar.modId);
    if (other !== undefined) {
      problems.push(
        error(
          ModpackProblemCodes.duplicateModId,
          `${other} and ${jar.name} both use the mod id ${jar.modId}. Change one in its Mod element.`,
        ),
      );
    }
    byModId.set(jar.modId, jar.name);
  }
  return { ok: problems.length === 0, problems, jars };
}

/**
 * The `.mrpack` bytes and file name for built jars (ADR 0046 D4).
 *
 * @throws Error With `modpack.no-fabric-api-file` in the message when the target has no
 *   Modrinth Fabric API facts.
 */
export function modpackMrpack(
  modpack: Modpack,
  target: TargetFacts,
  jars: readonly ModpackJar[],
): { fileName: string; data: Uint8Array } {
  const fabric = target.fabric;
  const api = fabric?.apiModrinth;
  if (fabric === undefined || api === undefined) {
    throw new Error(
      `Minecraft ${target.mcVersion} has no Fabric API download on record, so a .mrpack cannot be written (${ModpackProblemCodes.noFabricApiFile}).`,
    );
  }
  const data = createMrpack({
    name: modpack.name,
    version: modpack.version,
    ...(modpack.summary === undefined ? {} : { summary: modpack.summary }),
    minecraft: target.mcVersion,
    fabricLoader: fabric.loader,
    downloads: [
      { fileName: api.fileName, url: api.url, sha1: api.sha1, sha512: api.sha512, size: api.size },
      ...modpack.mods.map((mod) => ({
        fileName: mod.fileName,
        url: mod.url,
        sha1: mod.sha1,
        sha512: mod.sha512,
        size: mod.size,
      })),
    ],
    jars: jars.map((jar) => ({ fileName: `${jar.modId}.jar`, data: jar.data })),
  });
  return { fileName: mrpackFileName(modpack.name, modpack.version), data };
}
