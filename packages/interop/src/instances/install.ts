/**
 * `ensureInstance`: makes or brings up to date the managed instance a recipe names, in a
 * Prism, MultiMC or PolyMC data folder (ADR 0133 D2, D5).
 *
 * Safety:
 * - MSM writes only inside an instance folder that holds its marker for this recipe
 *   (`placeInstance`), and only files it recorded there: mods in `mods/.msm-installed.json`
 *   (`fabric/mods-install.ts`, unchanged rules), resource packs in the marker's `files`, copied
 *   worlds in the marker's `worlds`. A file or world of the same name that MSM did not write
 *   stops the step (`instance.foreign-file`, `instance.foreign-world`).
 * - A new instance is built whole in `<instances>/.msm-staging/<id>/<name>/` and moved into
 *   place with one rename (`staging.ts`, B760 N1); a copied world is built the same way in
 *   `saves/.msm-staging/`. No half-made instance or world folder ever appears. A staging folder
 *   an earlier run left is removed first.
 * - Every path is checked: one safe segment per name, and (when the file system reports real
 *   paths) the instance folder and its game folder inside the instances folder.
 * - The launcher's own files (`instance.cfg` after it exists, accounts, its settings) are
 *   never read or written; nothing is downloaded here (`bytesOf` is the caller's).
 *
 * `ensureInstance` must not run twice at once on the same launcher folder; the app's main
 * process runs these one at a time.
 */

import { MANAGED_INSTANCE_MARKER } from '../fabric/instance';
import {
  ensureFabricApi,
  installContentJar,
  installExtraMod,
  removeUnlistedInstalls,
} from '../fabric/mods-install';
import {
  ONBOARD_ACCESSIBILITY_KEY,
  RESOURCE_PACKS_KEY,
  withDefaultOption,
  withResourcePack,
} from '../fabric/options-txt';
import { FabricTestError, type Sha512 } from '../fabric/types';
import { readMmcConfig } from '../launchers/mmc';
import { isAbsoluteInstallPath, isPathInside, isSafeSegment } from '../launchers/paths';
import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { INSTANCE_MARKER_FORMAT, type InstanceMarker, instanceMarkerText } from './marker';
import {
  assertLoaderSupported,
  placeInstance,
  recipeInstanceCfg,
  recipeMmcPack,
} from './mmc-writer';
import {
  InstanceError,
  isPackFileName,
  isWorldFolderName,
  type RecipeMod,
  type RecipePack,
  type RunRecipe,
} from './recipe';
import { buildStaged, clearStaleStaging, newStagingId, StagingTakenError } from './staging';

/** What {@link ensureInstance} needs. */
export interface EnsureInstanceDeps {
  /** The file system; `rename` is needed to make a new instance or copy a world. */
  fs: InstallFileSystem;
  sha512: Sha512;
  /**
   * The bytes of a mod or resource pack the recipe names (the content jar, Fabric API from the
   * download cache, a Modrinth file, a pack). Called only for what must be written.
   */
  bytesOf(item: RecipeMod | RecipePack): Promise<Uint8Array>;
  /** A fresh staging id (tests); defaults to a random UUID. */
  stagingId?: () => string;
}

/** What {@link ensureInstance} found or did. */
export interface EnsuredInstance {
  /** The launcher data folder. */
  root: string;
  /** The instances folder. */
  instancesDir: string;
  /** The instance folder name (the launcher's instance id). */
  folder: string;
  instanceDir: string;
  /** The game folder (`minecraft/`, or `.minecraft/` when the instance has one). */
  gameDir: string;
  /** `true` when the instance was made now. */
  created: boolean;
  /** `true` when an existing instance's versions were rewritten. */
  updated: boolean;
  /** Mod files MSM wrote or kept (sorted), and those it removed (its own, unlisted). */
  mods: { files: string[]; removed: string[] };
  /** Resource pack files written now. */
  resourcePacksWritten: string[];
  /** The recipe's world, and whether it was copied now. */
  world: { folder: string; copied: boolean } | null;
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function checkRecipe(recipe: RunRecipe): void {
  if (recipe.place.kind !== 'instance') {
    throw new InstanceError(
      'instance.server-recipe',
      'This recipe is for a server, not a launcher instance.',
    );
  }
  assertLoaderSupported(recipe.loader);
  if (recipe.loader.kind === 'none' && recipe.mods.length > 0) {
    throw new InstanceError(
      'recipe.bad-input',
      'An instance without a mod loader cannot hold mods.',
    );
  }
  for (const mod of recipe.mods) {
    if (!isSafeSegment(mod.fileName) || !mod.fileName.endsWith('.jar')) {
      throw new InstanceError(
        'recipe.bad-input',
        `${JSON.stringify(mod.fileName)} is not a jar file name.`,
      );
    }
  }
  for (const pack of recipe.resourcePacks) {
    if (!isPackFileName(pack.fileName)) {
      throw new InstanceError(
        'recipe.bad-input',
        `${JSON.stringify(pack.fileName)} is not a resource pack file name.`,
      );
    }
  }
  if (recipe.world !== null && !isWorldFolderName(recipe.world.folder)) {
    throw new InstanceError(
      'recipe.bad-input',
      `${JSON.stringify(recipe.world.folder)} is not a world folder name.`,
    );
  }
}

async function realOrSelf(fs: InstallFileSystem, path: string): Promise<string | null> {
  if (fs.realpath === undefined) return path;
  try {
    return await fs.realpath(path);
  } catch {
    return null;
  }
}

/** Throws `instance.outside-root` unless `child` resolves strictly inside `parent`. */
async function assertInside(fs: InstallFileSystem, parent: string, child: string): Promise<void> {
  const outside = (): InstanceError =>
    new InstanceError(
      'instance.outside-root',
      "The instance folder leads outside the launcher's instances folder, so MCSuperMods leaves it alone.",
    );
  if (!isPathInside(parent, child)) throw outside();
  const realParent = await realOrSelf(fs, parent);
  const realChild = await realOrSelf(fs, child);
  if (realParent === null || realChild === null || !isPathInside(realParent, realChild)) {
    throw outside();
  }
}

/** The new marker for a recipe. */
function freshMarker(recipe: RunRecipe): InstanceMarker {
  if (recipe.place.kind !== 'instance') throw new Error('unreachable');
  return {
    formatVersion: INSTANCE_MARKER_FORMAT,
    role: recipe.place.role,
    owner: recipe.place.owner,
    loaderKind: recipe.loader.kind,
    loader: recipe.loader.version,
    minecraft: recipe.mcVersion,
    files: {},
    worlds: [],
  };
}

/** Wraps the mods installer's foreign-file error in this module's error. */
async function mods<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof FabricTestError && error.code === 'fabric.foreign-file') {
      throw new InstanceError('instance.foreign-file', error.message);
    }
    throw error;
  }
}

/**
 * Makes the instance `recipe` names in the Prism, MultiMC or PolyMC data folder `root`, or
 * brings MSM's existing one up to date: versions, mods, resource packs, `options.txt` and the
 * copied world. See the module comment for what is and is not touched.
 *
 * @throws {InstanceError} With a code and a message for the user.
 */
export async function ensureInstance(
  deps: EnsureInstanceDeps,
  root: string,
  recipe: RunRecipe,
): Promise<EnsuredInstance> {
  const { fs } = deps;
  checkRecipe(recipe);
  if (!isAbsoluteInstallPath(root) || !(await fs.exists(root))) {
    throw new InstanceError(
      'instance.no-launcher',
      "The launcher's folder was not found. Start the launcher once, then try again.",
    );
  }
  const [instancesDir] = (await readMmcConfig(fs, root)).instanceDirs;
  if (instancesDir === undefined) {
    throw new InstanceError('instance.no-launcher', 'The launcher has no instances folder.');
  }
  await fs.mkdirp(instancesDir);
  if (fs.rename !== undefined) await clearStaleStaging(fs, instancesDir);
  const stagingId = deps.stagingId ?? newStagingId;
  const placement = await placeInstance(fs, instancesDir, recipe);

  if (placement.kind === 'existing') {
    await assertInside(fs, instancesDir, placement.instanceDir);
    const instanceDir = placement.instanceDir;
    const dotGame = joinInstallPath(instanceDir, '.minecraft');
    const gameDir = (await fs.exists(dotGame))
      ? dotGame
      : joinInstallPath(instanceDir, 'minecraft');
    await fs.mkdirp(gameDir);
    await assertInside(fs, instanceDir, gameDir);

    const marker = placement.marker;
    const markerPath = joinInstallPath(instanceDir, MANAGED_INSTANCE_MARKER);
    let markerText = instanceMarkerText(marker);
    const saveMarker = async (): Promise<void> => {
      const next = instanceMarkerText(marker);
      if (next === markerText) return;
      await fs.writeFile(markerPath, encode(next));
      markerText = next;
    };
    const updated = marker.loader !== recipe.loader.version;
    const packPath = joinInstallPath(instanceDir, 'mmc-pack.json');
    if (updated || !(await fs.exists(packPath))) {
      // Rewritten only when the versions change: the launcher adds its own dependency-only
      // components, and MSM leaves them alone otherwise.
      await fs.writeFile(packPath, encode(recipeMmcPack(recipe.mcVersion, recipe.loader)));
      marker.loader = recipe.loader.version;
    }
    const cfgPath = joinInstallPath(instanceDir, 'instance.cfg');
    if (!(await fs.exists(cfgPath)))
      await fs.writeFile(cfgPath, encode(recipeInstanceCfg(placement.folder)));
    await saveMarker();

    const result = await fillGame(
      deps,
      instanceDir,
      gameDir,
      recipe,
      marker,
      saveMarker,
      stagingId,
      false,
    );
    return {
      root,
      instancesDir,
      folder: placement.folder,
      instanceDir,
      gameDir,
      created: false,
      updated,
      ...result,
    };
  }

  if (fs.rename === undefined) {
    throw new InstanceError(
      'instance.cannot-stage',
      'MCSuperMods cannot make an instance here: the folder cannot be moved into place in one step.',
    );
  }
  let result: Awaited<ReturnType<typeof fillGame>> | undefined;
  try {
    await buildStaged(
      fs,
      instancesDir,
      placement.folder,
      async (staged) => {
        const gameDir = joinInstallPath(staged, 'minecraft');
        await fs.mkdirp(gameDir);
        await fs.writeFile(
          joinInstallPath(staged, 'instance.cfg'),
          encode(recipeInstanceCfg(placement.folder)),
        );
        await fs.writeFile(
          joinInstallPath(staged, 'mmc-pack.json'),
          encode(recipeMmcPack(recipe.mcVersion, recipe.loader)),
        );
        const marker = freshMarker(recipe);
        const save = async (): Promise<void> => {
          await fs.writeFile(
            joinInstallPath(staged, MANAGED_INSTANCE_MARKER),
            encode(instanceMarkerText(marker)),
          );
        };
        await save();
        // The whole instance is staged, so its world is copied straight into `saves/`.
        result = await fillGame(deps, staged, gameDir, recipe, marker, save, stagingId, true);
      },
      stagingId(),
    );
  } catch (error) {
    if (error instanceof StagingTakenError) {
      throw new InstanceError(
        'instance.taken',
        `A folder named "${placement.folder}" appeared in the launcher while MCSuperMods was making it. Try again.`,
      );
    }
    throw error;
  }
  if (result === undefined) throw new Error('unreachable');
  return {
    root,
    instancesDir,
    folder: placement.folder,
    instanceDir: placement.instanceDir,
    gameDir: joinInstallPath(placement.instanceDir, 'minecraft'),
    created: true,
    updated: false,
    ...result,
  };
}

/**
 * Mods, resource packs, `options.txt` and the world, inside the game folder of an instance
 * that is MSM's (or being staged). `staged` says the whole instance is in a staging folder.
 */
async function fillGame(
  deps: EnsureInstanceDeps,
  instanceDir: string,
  gameDir: string,
  recipe: RunRecipe,
  marker: InstanceMarker,
  saveMarker: () => Promise<void>,
  stagingId: () => string,
  staged: boolean,
): Promise<Pick<EnsuredInstance, 'mods' | 'resourcePacksWritten' | 'world'>> {
  const { fs } = deps;
  /** A folder of the game folder, made when missing and checked to stay inside it. */
  const sub = async (name: string): Promise<string> => {
    const dir = joinInstallPath(gameDir, name);
    await fs.mkdirp(dir);
    await assertInside(fs, gameDir, dir);
    return dir;
  };

  // Mods, recorded in `mods/.msm-installed.json` by the existing installer.
  const modFiles: string[] = [];
  let removed: string[] = [];
  if (recipe.loader.kind !== 'none') {
    const modsDir = await sub('mods');
    const installDeps = { fs, sha512: deps.sha512 };
    const keep = new Set<string>();
    for (const mod of recipe.mods) {
      if (mod.role === 'fabric-api') {
        const api = await mods(() =>
          ensureFabricApi(installDeps, modsDir, mod.version, async () => {
            const bytes = await deps.bytesOf(mod);
            return { bytes, sha512: await deps.sha512(bytes) };
          }),
        );
        modFiles.push(api.file);
        keep.add(api.file);
      } else if (mod.role === 'content') {
        const bytes = await deps.bytesOf(mod);
        await mods(() => installContentJar(installDeps, modsDir, mod.modId, bytes));
        modFiles.push(mod.fileName);
        keep.add(mod.fileName);
      } else {
        const bytes = await deps.bytesOf(mod);
        await mods(() => installExtraMod(installDeps, modsDir, mod.fileName, mod.projectId, bytes));
        modFiles.push(mod.fileName);
        keep.add(mod.fileName);
      }
    }
    // MSM's own mods the recipe no longer names go (only recorded, unchanged files).
    removed = await removeUnlistedInstalls(installDeps, modsDir, keep);
  }

  // Resource packs, recorded in the marker.
  const packsWritten: string[] = [];
  if (recipe.resourcePacks.length > 0) {
    const packsDir = await sub('resourcepacks');
    for (const pack of recipe.resourcePacks) {
      const key = `resourcepacks/${pack.fileName}`;
      const path = joinInstallPath(packsDir, pack.fileName);
      const recorded = marker.files[key];
      if (await fs.exists(path)) {
        const current = await deps.sha512(await fs.readFile(path));
        if (recorded === undefined || recorded.sha512 !== current) {
          throw new InstanceError(
            'instance.foreign-file',
            `The instance already has a resource pack named ${pack.fileName} that MCSuperMods did not put there. Remove or rename it, then try again.`,
          );
        }
      }
      const bytes = await deps.bytesOf(pack);
      const sha512 = await deps.sha512(bytes);
      if (recorded?.sha512 === sha512 && (await fs.exists(path))) continue;
      if (await fs.exists(path)) await fs.remove(path);
      await fs.writeFile(path, bytes);
      marker.files[key] = { sha512 };
      if (marker.formatVersion === 1) marker.formatVersion = 2;
      await saveMarker();
      packsWritten.push(pack.fileName);
    }
  }

  // `options.txt`: the first start reaches the title screen; the recipe's packs are enabled.
  const optionsPath = joinInstallPath(gameDir, 'options.txt');
  const before = (await fs.exists(optionsPath)) ? decode(await fs.readFile(optionsPath)) : null;
  let options = withDefaultOption(before, ONBOARD_ACCESSIBILITY_KEY, 'false');
  // Without a loader there is no `fabric` pack to list before the recipe's packs.
  if (recipe.loader.kind === 'none' && recipe.resourcePacks.length > 0) {
    options = withDefaultOption(options, RESOURCE_PACKS_KEY, '["vanilla"]');
  }
  for (const pack of recipe.resourcePacks)
    options = withResourcePack(options, `file/${pack.fileName}`);
  if (options !== before) await fs.writeFile(optionsPath, encode(options));

  // The world.
  let world: EnsuredInstance['world'] = null;
  if (recipe.world !== null) {
    const { folder, source, replace } = recipe.world;
    const savesDir = source === null ? joinInstallPath(gameDir, 'saves') : await sub('saves');
    const target = joinInstallPath(savesDir, folder);
    let copied = false;
    if (source !== null) {
      if (!isAbsoluteInstallPath(source) || !(await fs.exists(source))) {
        throw new InstanceError('recipe.bad-input', `The world "${folder}" to copy was not found.`);
      }
      if (isPathInside(gameDir, source) || isPathInside(source, gameDir)) {
        throw new InstanceError(
          'recipe.bad-input',
          `The world "${folder}" cannot be copied into its own instance.`,
        );
      }
      const exists = await fs.exists(target);
      const ours = marker.worlds.includes(folder);
      if (exists && !ours) {
        throw new InstanceError(
          'instance.foreign-world',
          `The instance already has a world named "${folder}" that MCSuperMods did not put there. Rename it in the game, then try again.`,
        );
      }
      if (!exists || replace) {
        if (staged) {
          if (exists) await fs.remove(target);
          await copyTree(fs, source, target, 0);
        } else {
          await copyWorldStaged(fs, instanceDir, savesDir, folder, source, exists, stagingId());
        }
        copied = true;
        if (!ours) {
          marker.worlds = [...marker.worlds, folder].sort();
          if (marker.formatVersion === 1) marker.formatVersion = 2;
          await saveMarker();
        }
      }
    }
    world = { folder, copied };
  }
  return {
    mods: { files: [...modFiles].sort(), removed },
    resourcePacksWritten: packsWritten,
    world,
  };
}

/**
 * Copies a world into `saves/<folder>` of an existing instance through a staging folder in the
 * instance folder; MSM's earlier copy (when `replace`) is removed only once the new one is whole.
 */
async function copyWorldStaged(
  fs: InstallFileSystem,
  instanceDir: string,
  savesDir: string,
  folder: string,
  source: string,
  replace: boolean,
  stagingId: string,
): Promise<void> {
  if (fs.rename === undefined) {
    throw new InstanceError(
      'instance.cannot-stage',
      'MCSuperMods cannot copy the world here: the folder cannot be moved into place in one step.',
    );
  }
  // Staged in the instance folder (same volume), outside the game's world list.
  await clearStaleStaging(fs, instanceDir);
  const target = joinInstallPath(savesDir, folder);
  // Build the copy whole first; only then does MSM's earlier copy go.
  await buildStaged(
    fs,
    savesDir,
    folder,
    async (staged) => {
      await copyTree(fs, source, staged, 0);
      if (replace) await fs.remove(target);
    },
    stagingId,
    instanceDir,
  );
}

/** The deepest folder a world copy follows. */
const MAX_COPY_DEPTH = 32;

async function copyTree(
  fs: InstallFileSystem,
  from: string,
  to: string,
  depth: number,
): Promise<void> {
  if (depth > MAX_COPY_DEPTH) return;
  await fs.mkdirp(to);
  for (const entry of await fs.readDir(from)) {
    if (!isSafeSegment(entry.name)) continue;
    // The game's lock file belongs to a running game, never to a copy.
    if (depth === 0 && entry.name === 'session.lock') continue;
    const src = joinInstallPath(from, entry.name);
    const dst = joinInstallPath(to, entry.name);
    if (entry.kind === 'directory') await copyTree(fs, src, dst, depth + 1);
    else await fs.writeFile(dst, await fs.readFile(src));
  }
}
