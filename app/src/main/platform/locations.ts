/**
 * Game locations in the main process (ADR 0019): discovers the official launcher folder and
 * Prism Launcher, MultiMC and CurseForge instances with the folders from the settings, and
 * resolves the stored install target against them. Nothing is cached; every call reads the
 * disk again, so instances created or removed while the app runs are picked up.
 *
 * @packageDocumentation
 */

import { normalize } from 'node:path';
import {
  discoverGameLocations,
  findGameLocation,
  type GameLocation,
  type InstallEnv,
  type InstallFileSystem,
} from '@msm/interop';
import type {
  GameLocationList,
  GameLocationView,
  GameLocationWarningView,
} from '../../shared/platform';
import type { SettingsStore } from './settings';

/** The settings the resolver reads: the official folder, launcher folders and install target. */
export type LocationSettings = Pick<SettingsStore, 'get'>;

/** Every discovered location, the selected one and whether the stored target went missing. */
export interface ResolvedLocations {
  /** Discovered locations in discovery order (official first). */
  locations: GameLocation[];
  /**
   * The install target: the stored one when it still exists, otherwise the official location,
   * otherwise `null`.
   */
  selected: GameLocation | null;
  /** `true` when a stored install target was not found among the discovered locations. */
  targetMissing: boolean;
}

/** Resolves game locations for the Minecraft service. */
export interface LocationResolver {
  /** Discovers locations and resolves the install target. */
  resolve(): Promise<ResolvedLocations>;
  /** The selected location and whether the stored target went missing. */
  selected(): Promise<Pick<ResolvedLocations, 'selected' | 'targetMissing'>>;
  /** Discovered locations as views with warnings for `mcVersion`, plus the selected id. */
  list(mcVersion: string): Promise<GameLocationList>;
}

/** What the resolver needs from its host. */
export interface LocationResolverDeps {
  fs: InstallFileSystem;
  /** Host facts used to find the default launcher folders. */
  env: InstallEnv;
  settings: LocationSettings;
}

/**
 * The warnings for installing a project that targets `mcVersion` into `location`. They never
 * block an install: a version mismatch (`location.version-mismatch`).
 */
export function locationWarnings(
  location: GameLocation,
  mcVersion: string,
): GameLocationWarningView[] {
  if (location.mcVersion === null || location.mcVersion === mcVersion) return [];
  return [
    {
      code: 'location.version-mismatch',
      message: `This instance runs Minecraft ${location.mcVersion}; the project targets ${mcVersion}.`,
    },
  ];
}

/**
 * The warnings `status` reports for the selected location: {@link locationWarnings} plus a
 * missing Minecraft component, which leaves the instance's version unknown.
 */
export function targetWarnings(
  location: GameLocation | null,
  mcVersion: string,
): GameLocationWarningView[] {
  if (location === null) return [];
  const warnings = locationWarnings(location, mcVersion);
  for (const problem of location.problems) {
    if (problem.code === 'location.no-minecraft-component') {
      warnings.push({ code: problem.code, message: problem.message });
    }
  }
  return warnings;
}

/**
 * A location as plain JSON for the renderer: host-normalised paths, no `instanceDir`, and
 * the warnings for `mcVersion`.
 */
export function toLocationView(location: GameLocation, mcVersion: string): GameLocationView {
  const { ref } = location;
  return {
    ref:
      ref.instance === undefined
        ? { launcher: ref.launcher, root: normalize(ref.root) }
        : { launcher: ref.launcher, root: normalize(ref.root), instance: ref.instance },
    id: location.id,
    displayName: location.displayName,
    mcVersion: location.mcVersion,
    loader:
      location.loader === null
        ? null
        : { kind: location.loader.kind, version: location.loader.version },
    gameDir: normalize(location.gameDir),
    modsDir: location.modsDir === null ? null : normalize(location.modsDir),
    problems: location.problems.map((problem) => ({
      code: problem.code,
      message: problem.message,
    })),
    warnings: locationWarnings(location, mcVersion),
  };
}

/** Creates the location resolver. */
export function createLocationResolver(deps: LocationResolverDeps): LocationResolver {
  const resolve = async (): Promise<ResolvedLocations> => {
    const settings = await deps.settings.get();
    const launchers = settings.launchers ?? {
      prismDataDirs: [],
      multimcRoots: [],
      curseForgeRoots: [],
    };
    const locations = await discoverGameLocations(deps.fs, deps.env, {
      minecraftDir: settings.minecraftDir,
      prismDataDirs: launchers.prismDataDirs,
      multimcRoots: launchers.multimcRoots,
      curseForgeRoots: launchers.curseForgeRoots,
    });
    const official = locations.find((location) => location.ref.launcher === 'official') ?? null;
    const target = settings.installTarget ?? null;
    if (target === null) return { locations, selected: official, targetMissing: false };
    const found = findGameLocation(
      locations,
      target.instance === undefined
        ? { launcher: target.launcher, root: target.root }
        : { launcher: target.launcher, root: target.root, instance: target.instance },
    );
    return found === undefined
      ? { locations, selected: official, targetMissing: true }
      : { locations, selected: found, targetMissing: false };
  };

  return {
    resolve,
    async selected() {
      const { selected, targetMissing } = await resolve();
      return { selected, targetMissing };
    },
    async list(mcVersion) {
      const { locations, selected } = await resolve();
      return {
        locations: locations.map((location) => toLocationView(location, mcVersion)),
        selected: selected?.id ?? null,
      };
    },
  };
}
