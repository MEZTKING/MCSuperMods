/**
 * Shared fixtures for the local server tests: an in-memory file system that can rename and
 * checks after every change that no server folder is visible without its marker, fake
 * launcher jars, an injected downloader that records every address, and server recipes on
 * both made-up targets.
 */

import {
  type RecipeMod,
  type RecipeProjectFacts,
  type RunRecipe,
  recipeFor,
  type ServerLauncherJar,
  webCryptoSha256,
} from '../../src/index';
import { bytes, RELEASE, StagingMemoryFs, sha512 } from '../instances/helpers';

export { bytes, RELEASE, SNAPSHOT, sha512, text } from '../instances/helpers';

export const sha256 = webCryptoSha256;

export const HOME = '/home/alex/.msm';
export const SERVERS = '/home/alex/.msm/servers';
export const CACHE = '/home/alex/.msm/downloads';

/** A jar's bytes: a zip's first four bytes, then `body`. */
export function jar(body: string): Uint8Array {
  const tail = bytes(body);
  const out = new Uint8Array(4 + tail.length);
  out.set([0x50, 0x4b, 0x03, 0x04]);
  out.set(tail, 4);
  return out;
}

/**
 * {@link StagingMemoryFs} without the instance checks, plus one of its own: each visible
 * folder directly in {@link SERVERS} holds `.msm-server.json`, unless it was there before.
 */
export class ServerMemoryFs extends StagingMemoryFs {
  readonly serverViolations: string[] = [];
  readonly foreignServers = new Set<string>();

  constructor() {
    super();
    this.watched = [];
  }

  /** Records the current children of {@link SERVERS} as foreign. */
  markForeignServers(): this {
    for (const dir of this.dirs) {
      if (dir.startsWith(`${SERVERS}/`) && !dir.slice(SERVERS.length + 1).includes('/')) {
        this.foreignServers.add(dir);
      }
    }
    return this;
  }

  private checkServers(op: string): void {
    for (const dir of this.dirs) {
      if (!dir.startsWith(`${SERVERS}/`)) continue;
      const name = dir.slice(SERVERS.length + 1);
      if (name.includes('/') || name.startsWith('.') || this.foreignServers.has(dir)) continue;
      if (!this.files.has(`${dir}/.msm-server.json`)) {
        this.serverViolations.push(`${op}: ${dir} visible without its marker`);
      }
    }
  }

  override async writeFile(absPath: string, data: Uint8Array): Promise<void> {
    await super.writeFile(absPath, data);
    this.checkServers(`write ${absPath}`);
  }

  override async mkdirp(absPath: string): Promise<void> {
    await super.mkdirp(absPath);
    this.checkServers(`mkdirp ${absPath}`);
  }

  override async rename(fromAbsPath: string, toAbsPath: string): Promise<void> {
    await super.rename(fromAbsPath, toAbsPath);
    this.checkServers(`rename ${toAbsPath}`);
  }
}

/** An injected downloader: answers from `routes`, records every address, never the network. */
export function fakeDownloader(routes: Map<string, Uint8Array | Error>): {
  download: (url: string) => Promise<Uint8Array>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    download: async (url) => {
      calls.push(url);
      const answer = routes.get(url);
      if (answer === undefined) throw new Error(`HTTP 404 for ${url}`);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

/** A project that needs its mod, and one that plays without mods. */
export const MOD_PROJECT: RecipeProjectFacts = {
  namespace: 'gem_hunt',
  modId: 'gem_hunt',
  playsWithoutMods: false,
};
export const PLAIN_PROJECT: RecipeProjectFacts = { ...MOD_PROJECT, playsWithoutMods: true };

/** The server recipe for a project on a target. */
export function serverRecipe(
  project: RecipeProjectFacts = MOD_PROJECT,
  target = RELEASE,
  world?: { folder: string; source: string; replace?: boolean },
): RunRecipe {
  return recipeFor(
    world === undefined ? { kind: 'server' } : { kind: 'server', world },
    project,
    target,
  );
}

/** A verified launcher jar for a recipe, as `cachedServerLauncher` would give it. */
export async function launcherFor(
  recipe: RunRecipe,
  body = 'launcher',
): Promise<ServerLauncherJar> {
  const data = jar(`${body} ${recipe.mcVersion} ${recipe.loader.version}`);
  return {
    mcVersion: recipe.mcVersion,
    loader: recipe.loader.version as string,
    installer: '1.1.2',
    bytes: data,
    sha256: await sha256(data),
    cached: true,
    firstSeen: false,
  };
}

/** The bytes handed back for each mod. */
export async function modBytes(mod: RecipeMod): Promise<Uint8Array> {
  if (mod.role === 'content') return bytes(`content jar ${mod.modId}`);
  if (mod.role === 'fabric-api') return bytes(`fabric api ${mod.version}`);
  return bytes(`extra ${mod.projectId}`);
}

/** Deps for `ensureServer` over `fs` for `recipe`. */
export function serverDeps(
  fs: ServerMemoryFs,
  recipe: RunRecipe,
  launcherCalls: { n: number } = { n: 0 },
) {
  let id = 0;
  return {
    fs,
    sha512,
    sha256,
    bytesOf: modBytes,
    launcher: async () => {
      launcherCalls.n++;
      return launcherFor(recipe);
    },
    stagingId: () => `stage-${++id}`,
  };
}
