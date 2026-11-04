/**
 * Install targets (game locations, ADR 0019) as the renderer's components see them. The
 * type is deliberately independent of the IPC contract: the host maps the main process's
 * location views onto {@link InstallTargetOption}, so the components stay presentational.
 *
 * @packageDocumentation
 */

/** The launchers MSM knows how to find game locations for. */
export type InstallTargetLauncher = 'official' | 'prism' | 'multimc' | 'curseforge';

/** Launchers whose folders the user can add by hand in Settings. */
export type ManualLauncher = Exclude<InstallTargetLauncher, 'official'>;

/** One place packs can be installed into, ready for display. */
export interface InstallTargetOption {
  /** DOM-safe location id, such as `prism:My-Instance`. */
  id: string;
  launcher: InstallTargetLauncher;
  /** "Official launcher", or the instance's own name. */
  displayName: string;
  /** The instance's Minecraft version, or `null` for the official launcher or when unknown. */
  mcVersion: string | null;
  loader: { kind: string; version: string | null } | null;
  /** The folder that holds `resourcepacks/` and `saves/`. */
  gameDir: string;
  /** Messages that never block install (such as a version mismatch). */
  warnings: string[];
  /** Problems found while reading the location. */
  problems: string[];
  /** `false` when a problem blocks install into this location. */
  installable: boolean;
}

/** A launcher folder the user added in Settings. */
export interface ManualLauncherRoot {
  kind: ManualLauncher;
  path: string;
  /** How many locations were found under this folder; `0` makes Settings say so. */
  found?: number;
}

const LAUNCHER_LABELS: Record<InstallTargetLauncher, string> = {
  official: 'Official launcher',
  prism: 'Prism Launcher',
  multimc: 'MultiMC',
  curseforge: 'CurseForge',
};

const LOADER_LABELS: Record<string, string> = {
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge',
  liteloader: 'LiteLoader',
  unknown: 'Unknown loader',
};

/** The launcher's display name, such as "Prism Launcher". */
export function launcherLabel(kind: InstallTargetLauncher): string {
  return LAUNCHER_LABELS[kind];
}

/** The loader badge text, such as "Fabric 0.16.5", or `null` without a loader. */
export function loaderLabel(loader: InstallTargetOption['loader']): string | null {
  if (loader === null) return null;
  const name = LOADER_LABELS[loader.kind] ?? loader.kind;
  return loader.version === null || loader.kind === 'unknown' ? name : `${name} ${loader.version}`;
}

/** "Prism Launcher — My Instance (MC x.y)", without the launcher name twice. */
export function installTargetName(option: InstallTargetOption): string {
  const launcher = launcherLabel(option.launcher);
  const base =
    option.displayName === '' || option.displayName === launcher
      ? launcher
      : `${launcher} — ${option.displayName}`;
  return option.mcVersion === null ? base : `${base} (MC ${option.mcVersion})`;
}

/** The sentence at the top of the Install menu. */
export function describeInstallTarget(option: InstallTargetOption | null): string {
  if (option === null) return 'No install target: choose one in Settings';
  return `Install to: ${installTargetName(option)}`;
}

/** Which launcher's client jar the extraction reads, such as "Prism Launcher — x.y". */
export function describeJarSource(launcher: InstallTargetLauncher, versionId: string): string {
  return `${launcherLabel(launcher)} — ${versionId}`;
}
