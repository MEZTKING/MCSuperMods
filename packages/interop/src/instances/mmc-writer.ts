/**
 * The MultiMC-format instance writer (Prism Launcher, MultiMC, PolyMC; ADR 0133 D2, D4):
 * `instance.cfg` (`[General]`, `InstanceType=OneSix`, `name=`), `mmc-pack.json` from the
 * component table, and the taken-name rule over an instances folder.
 *
 * Facts (B760 N2, N5): a pack with only `net.minecraft` is a vanilla instance (Prism adds
 * LWJGL itself as a dependency-only component); Fabric Loader brings `net.fabricmc.intermediary`
 * the same way. MultiMC needs `InstanceType=OneSix` (a missing type is a Legacy instance there),
 * so it is always written. The launcher writes into `instance.cfg` itself (`lastLaunchTime`,
 * `totalTimePlayed`), so MSM writes it only when it is missing and never compares it; the
 * marker is MSM's record. Prism's `ManagedPack*` keys are never used (they mean a modpack
 * platform's instance).
 */

import {
  FABRIC_LOADER_COMPONENT_UID,
  MINECRAFT_COMPONENT_UID,
  managedInstanceCfg,
} from '../fabric/instance';
import { SAFE_VERSION, stableJson } from '../fabric/types';
import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { type InstanceMarker, readInstanceMarker } from './marker';
import { candidateName, candidateSuffix, isMadeName, MAX_NAME_SUFFIX } from './names';
import { InstanceError, type RecipeLoader, type RecipeLoaderKind, type RunRecipe } from './recipe';

/** One row of the component table. */
export interface LoaderComponent {
  /** The `mmc-pack.json` uid, or `null` for no loader. */
  uid: string | null;
  /** The loader's name in plain words. */
  name: string;
  /** Whether MSM makes instances with it now; the others wait for their plans. */
  supported: boolean;
}

/**
 * The loaders' components (Prism's metadata index; the same uids as `MMC_LOADER_UIDS`).
 * Quilt, NeoForge and Forge are known and refused until their plans exist.
 */
export const LOADER_COMPONENTS: Readonly<Record<RecipeLoaderKind, LoaderComponent>> = {
  none: { uid: null, name: 'no mod loader', supported: true },
  fabric: { uid: FABRIC_LOADER_COMPONENT_UID, name: 'Fabric Loader', supported: true },
  quilt: { uid: 'org.quiltmc.quilt-loader', name: 'Quilt Loader', supported: false },
  neoforge: { uid: 'net.neoforged', name: 'NeoForge', supported: false },
  forge: { uid: 'net.minecraftforge', name: 'Forge', supported: false },
};

/** Throws `instance.loader-not-supported` for a loader MSM does not make instances with yet. */
export function assertLoaderSupported(loader: RecipeLoader): void {
  const row = LOADER_COMPONENTS[loader.kind];
  if (!row.supported) {
    throw new InstanceError(
      'instance.loader-not-supported',
      `MCSuperMods cannot make instances with ${row.name} yet.`,
    );
  }
  if (loader.kind === 'none' ? loader.version !== null : !SAFE_VERSION.test(loader.version ?? '')) {
    throw new InstanceError('recipe.bad-input', `The ${row.name} version is not valid.`);
  }
}

/** The `mmc-pack.json` text for a Minecraft version and loader. */
export function recipeMmcPack(mcVersion: string, loader: RecipeLoader): string {
  assertLoaderSupported(loader);
  const components: Record<string, unknown>[] = [
    { important: true, uid: MINECRAFT_COMPONENT_UID, version: mcVersion },
  ];
  const uid = LOADER_COMPONENTS[loader.kind].uid;
  if (uid !== null && loader.version !== null) components.push({ uid, version: loader.version });
  return stableJson({ components, formatVersion: 1 });
}

/** The `instance.cfg` text of a managed instance (Qt INI, `[General]` section). */
export function recipeInstanceCfg(name: string): string {
  return managedInstanceCfg(name);
}

/** Whether an existing marker is the instance `recipe` wants. */
export function markerMatches(marker: InstanceMarker, recipe: RunRecipe): boolean {
  if (recipe.place.kind !== 'instance') return false;
  return (
    marker.role === recipe.place.role &&
    marker.owner === recipe.place.owner &&
    marker.minecraft === recipe.mcVersion &&
    marker.loaderKind === recipe.loader.kind
  );
}

/** Where {@link placeInstance} puts a recipe's instance. */
export type InstancePlacement =
  /** MSM's existing instance for this recipe. */
  | { kind: 'existing'; folder: string; instanceDir: string; marker: InstanceMarker }
  /** A free name to make it under. */
  | { kind: 'new'; folder: string; instanceDir: string };

/**
 * Finds the recipe's instance in `instancesDir`, or the name to make it under: the first of
 * the base name, `-2`, `-3`… that holds MSM's marker for this recipe is used; otherwise the
 * first that is free. A folder without the marker, with an unreadable one, or with MSM's
 * marker for something else is never used. Read-only.
 */
export async function placeInstance(
  fs: InstallFileSystem,
  instancesDir: string,
  recipe: RunRecipe,
): Promise<InstancePlacement> {
  if (recipe.place.kind !== 'instance') {
    throw new InstanceError('instance.server-recipe', 'A server recipe makes no instance.');
  }
  const base = recipe.place.name;
  if (!isMadeName(base)) {
    throw new InstanceError('recipe.bad-input', `${JSON.stringify(base)} is not a folder name.`);
  }
  // The highest suffix present, compared without case, bounds the search for MSM's own folder.
  let highest = 0;
  for (const entry of await fs.readDir(instancesDir)) {
    const n = candidateSuffix(base, entry.name);
    if (n !== null) highest = Math.max(highest, n);
  }
  let free: string | null = null;
  for (let n = 1; n <= MAX_NAME_SUFFIX; n++) {
    if (n > highest && free !== null) break;
    const folder = candidateName(base, n);
    const instanceDir = joinInstallPath(instancesDir, folder);
    if (!(await fs.exists(instanceDir))) {
      free ??= folder;
      continue;
    }
    const marker = await readInstanceMarker(fs, instanceDir);
    if (marker !== 'absent' && marker !== 'unreadable' && markerMatches(marker, recipe)) {
      return { kind: 'existing', folder, instanceDir, marker };
    }
  }
  if (free === null) {
    throw new InstanceError(
      'instance.no-free-name',
      `Every name from "${base}" to "${candidateName(base, MAX_NAME_SUFFIX)}" is taken in the launcher. Rename or remove some of those instances, then try again.`,
    );
  }
  return { kind: 'new', folder: free, instanceDir: joinInstallPath(instancesDir, free) };
}
