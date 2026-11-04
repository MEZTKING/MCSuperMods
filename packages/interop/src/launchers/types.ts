/**
 * Game locations (ADR 0019): places MSM can install packs into and read a client jar from.
 * A location is the official launcher's `.minecraft` folder, a Prism Launcher, MultiMC or
 * PolyMC instance, or a CurseForge app instance.
 */

/** The launcher a location belongs to. `multimc` also covers PolyMC (same instance format). */
export type LauncherKind = 'official' | 'prism' | 'multimc' | 'curseforge';

/** Serialisable identity of a location; stored in settings. */
export interface GameLocationRef {
  launcher: LauncherKind;
  /**
   * Launcher root: the `.minecraft` folder (official), the Prism/MultiMC data folder, or the
   * CurseForge modding folder. Absolute.
   */
  root: string;
  /** Instance folder name under the launcher's instances folder; absent for `official`. */
  instance?: string;
}

/** The mod loader an instance runs, when it has one. */
export type LoaderKind = 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'liteloader' | 'unknown';

/** A problem found while reading a location. */
export interface GameLocationProblem {
  code:
    | 'location.no-minecraft-component'
    | 'location.unreadable-metadata'
    | 'location.game-dir-missing'
    | 'location.unsupported-instance-type';
  message: string;
}

/** One place MSM can install packs into and read a client jar for. */
export interface GameLocation {
  ref: GameLocationRef;
  /** DOM-safe id: `<launcher>:<instance|default>` in `[A-Za-z0-9_.:-]`, suffixed `-2`, `-3` on collision. */
  id: string;
  /**
   * "Official launcher", or the instance's `name` (Prism `instance.cfg`, CurseForge `name`),
   * falling back to the folder name.
   */
  displayName: string;
  /**
   * `net.minecraft` component version, or `gameVersion`; `null` for the official launcher
   * (any installed version) or when unknown.
   */
  mcVersion: string | null;
  loader: { kind: LoaderKind; version: string | null } | null;
  /** Where `resourcepacks/` and `saves/` live. Absolute. */
  gameDir: string;
  /** `<gameDir>/mods` for instances with a loader; recorded for Phase 4 (content-jar install), unused now. */
  modsDir: string | null;
  /**
   * The absolute instance folder (`<instancesDir>/<instance>`), or `null` for the official
   * launcher. The main process checks that `gameDir` resolves inside it before writing, and
   * that it resolves inside its parent (the instances folder). Not part of the settings ref.
   */
  instanceDir: string | null;
  /** Problems found while reading the location. */
  problems: GameLocationProblem[];
}

/** Manual launcher roots and the official folder override, from the app settings. */
export interface LauncherOverrides {
  /** Official `.minecraft`, or null to use the platform default when it exists. */
  minecraftDir: string | null;
  /** Prism Launcher data folders added by hand, absolute. */
  prismDataDirs: string[];
  /** MultiMC and PolyMC folders added by hand, absolute. */
  multimcRoots: string[];
  /** CurseForge modding folders added by hand, absolute. */
  curseForgeRoots: string[];
}
