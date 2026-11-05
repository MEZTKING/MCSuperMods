/**
 * Fabric game locations for Test in Minecraft (ADR 0026 D5): whether a location can run the
 * project's content jar, and the managed Prism instance `MCSuperMods Test (<mc version>)`.
 *
 * The managed instance holds `instance.cfg` (`InstanceType=OneSix`, Prism `InstanceList.cpp`),
 * an `mmc-pack.json` (`formatVersion` 1, Prism `PackProfile.cpp`) naming `net.minecraft`
 * (`important`) and `net.fabricmc.fabric-loader` at the target's versions, a `minecraft/mods/`
 * folder and a `.msm-managed.json` marker. Prism adds missing dependencies itself when it
 * loads the profile (`ComponentUpdateTask.cpp`): its meta for Fabric Loader requires
 * `net.fabricmc.intermediary`, which it adds as a dependency-only component, as it does LWJGL.
 */

import { isSafeSegment } from '../launchers/paths';
import type { GameLocation } from '../launchers/types';
import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import {
  assertSafeVersion,
  compareDottedVersions,
  FabricTestError,
  type FabricTestFacts,
  stableJson,
} from './types';

/** The marker file the app writes into an instance it created. */
export const MANAGED_INSTANCE_MARKER = '.msm-managed.json';

/** Prism's Minecraft component uid. */
export const MINECRAFT_COMPONENT_UID = 'net.minecraft';

/** Prism's Fabric Loader component uid (`MMC_LOADER_UIDS`). */
export const FABRIC_LOADER_COMPONENT_UID = 'net.fabricmc.fabric-loader';

/** The managed instance's name and folder name for a Minecraft version. */
export function managedInstanceName(mcVersion: string): string {
  assertSafeVersion(mcVersion, 'Minecraft');
  return `MCSuperMods Test (${mcVersion})`;
}

/** The `mmc-pack.json` text of the managed instance. */
export function managedMmcPack(facts: FabricTestFacts): string {
  assertSafeVersion(facts.mcVersion, 'Minecraft');
  assertSafeVersion(facts.loader, 'Fabric Loader');
  return stableJson({
    components: [
      { important: true, uid: MINECRAFT_COMPONENT_UID, version: facts.mcVersion },
      { uid: FABRIC_LOADER_COMPONENT_UID, version: facts.loader },
    ],
    formatVersion: 1,
  });
}

/** The `instance.cfg` text of the managed instance (Qt INI, `[General]` section). */
export function managedInstanceCfg(name: string): string {
  return `[General]\nInstanceType=OneSix\nname=${name}\n`;
}

/** The outcome of {@link createManagedInstance}. */
export interface ManagedInstance {
  /** The instance folder name (the Prism instance id). */
  folder: string;
  /** The absolute instance folder. */
  instanceDir: string;
  /** `true` when the folder was created now. */
  created: boolean;
  /** `true` when an existing managed instance's versions were rewritten. */
  updated: boolean;
}

interface MarkerFile {
  formatVersion: 1;
  generator: 'MCSuperMods';
  minecraft: string;
  loader: string;
}

/**
 * Creates the managed instance in `instancesDir` (a Prism instances folder), or brings an
 * existing one up to the target's versions. A folder of that name without the app's marker is
 * never touched: `fabric.instance-not-managed`.
 */
export async function createManagedInstance(
  fs: InstallFileSystem,
  instancesDir: string,
  facts: FabricTestFacts,
): Promise<ManagedInstance> {
  const folder = managedInstanceName(facts.mcVersion);
  if (!isSafeSegment(folder)) {
    throw new FabricTestError('fabric.bad-version', `${folder} is not a valid folder name.`);
  }
  const instanceDir = joinInstallPath(instancesDir, folder);
  const markerPath = joinInstallPath(instanceDir, MANAGED_INSTANCE_MARKER);
  const marker: MarkerFile = {
    formatVersion: 1,
    generator: 'MCSuperMods',
    minecraft: facts.mcVersion,
    loader: facts.loader,
  };
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

  if (await fs.exists(instanceDir)) {
    if (!(await fs.exists(markerPath))) {
      throw new FabricTestError(
        'fabric.instance-not-managed',
        `The launcher already has an instance folder named "${folder}" that MCSuperMods did not create. Rename it, or choose it in Settings if it runs Fabric.`,
      );
    }
    let current: Partial<MarkerFile> = {};
    try {
      current = JSON.parse(
        new TextDecoder().decode(await fs.readFile(markerPath)),
      ) as Partial<MarkerFile>;
    } catch {
      // Rewrite below.
    }
    const updated = current.minecraft !== facts.mcVersion || current.loader !== facts.loader;
    if (updated || !(await fs.exists(joinInstallPath(instanceDir, 'mmc-pack.json')))) {
      await fs.writeFile(
        joinInstallPath(instanceDir, 'mmc-pack.json'),
        encode(managedMmcPack(facts)),
      );
      await fs.writeFile(markerPath, encode(stableJson(marker)));
    }
    await fs.mkdirp(joinInstallPath(instanceDir, 'minecraft', 'mods'));
    return { folder, instanceDir, created: false, updated };
  }

  await fs.mkdirp(joinInstallPath(instanceDir, 'minecraft', 'mods'));
  await fs.writeFile(
    joinInstallPath(instanceDir, 'instance.cfg'),
    encode(managedInstanceCfg(folder)),
  );
  await fs.writeFile(joinInstallPath(instanceDir, 'mmc-pack.json'), encode(managedMmcPack(facts)));
  await fs.writeFile(markerPath, encode(stableJson(marker)));
  return { folder, instanceDir, created: true, updated: false };
}

/** Whether `location` is the app's managed instance (its folder holds the marker). */
export async function isManagedInstance(
  fs: InstallFileSystem,
  location: GameLocation,
): Promise<boolean> {
  if (location.instanceDir === null) return false;
  return fs.exists(joinInstallPath(location.instanceDir, MANAGED_INSTANCE_MARKER));
}

/** How Test in Minecraft can use a location. */
export type FabricReadiness =
  /** A Prism or MultiMC Fabric instance for the target: install, then launch. */
  | { mode: 'launch'; modsDir: string }
  /** Official launcher or CurseForge: install only; `note` says how to start the game. */
  | { mode: 'install-only'; modsDir: string; note: string }
  /** Not usable; `reason` says why. */
  | { mode: 'blocked'; reason: string };

/**
 * Whether Test in Minecraft can use `location` for a project with `facts`. A Prism or
 * MultiMC instance must run Fabric Loader (at least the target's version, when the instance
 * names one) on the target's Minecraft version and have a game folder. CurseForge instances
 * with Fabric on that version and the official launcher are install-only.
 */
export function fabricReadiness(
  location: GameLocation | null,
  facts: FabricTestFacts,
): FabricReadiness {
  if (location === null) {
    return {
      mode: 'blocked',
      reason:
        'No game location was found. Choose a Fabric instance in Settings, or create the test instance.',
    };
  }
  const name = location.displayName;
  const unreadable = location.problems.find(
    (problem) =>
      problem.code === 'location.unsupported-instance-type' ||
      problem.code === 'location.unreadable-metadata',
  );
  if (unreadable !== undefined) return { mode: 'blocked', reason: unreadable.message };
  if (location.problems.some((problem) => problem.code === 'location.game-dir-missing')) {
    return {
      mode: 'blocked',
      reason: `The game folder of "${name}" does not exist yet. Start it once from its launcher.`,
    };
  }
  const modsDir = location.modsDir ?? joinInstallPath(location.gameDir, 'mods');

  if (location.ref.launcher === 'official') {
    return {
      mode: 'install-only',
      modsDir,
      note: `Install Fabric Loader ${facts.loader} for Minecraft ${facts.mcVersion} with the Fabric installer, then start the Fabric profile from the Minecraft Launcher.`,
    };
  }

  if (location.loader?.kind !== 'fabric') {
    return {
      mode: 'blocked',
      reason: `"${name}" does not run Fabric Loader. Choose a Fabric instance for Minecraft ${facts.mcVersion} in Settings, or create the test instance.`,
    };
  }
  if (location.mcVersion !== facts.mcVersion) {
    return {
      mode: 'blocked',
      reason: `"${name}" runs Minecraft ${location.mcVersion ?? '(unknown)'}; the project targets ${facts.mcVersion}.`,
    };
  }
  const loaderVersion = location.loader.version;
  if (loaderVersion !== null && compareDottedVersions(loaderVersion, facts.loader) < 0) {
    return {
      mode: 'blocked',
      reason: `"${name}" runs Fabric Loader ${loaderVersion}; the mod needs ${facts.loader} or newer. Update the loader in the launcher.`,
    };
  }
  if (location.ref.launcher === 'curseforge') {
    return {
      mode: 'install-only',
      modsDir,
      note: `Start "${name}" from the CurseForge app.`,
    };
  }
  return { mode: 'launch', modsDir };
}
