/**
 * What the upgrade report's before and after views and **Minecraft changed these too** need of
 * the app (B819): the session's lowering of a project on a target, its kinds, the targets'
 * change sets, the user's Minecraft files of each version and the project's own pictures. The
 * app builds one from the session and the preload bridge; tests give their own.
 *
 * @packageDocumentation
 */

import type { Project, Target, TargetFacts } from '@msm/plugin-api';
import type { LoweredElements } from '../../../session/project-session';
import type { WorldgenKindLike } from '../../../terrain/files';

/** A kind as the views read it: its folder and lowering (the world map) and preview kind. */
export type UpgradeViewKind = WorldgenKindLike & { readonly previewKind?: string | undefined };

/** The app's side of the upgrade report's views. */
export interface UpgradeViewsHost {
  /** Each thing's lowered files of `project` on `targetId` (`session.loweredElements`). */
  loweredElements(project: Project, targetId: string): Promise<LoweredElements>;
  /** The element kinds (`session.registry`). */
  readonly registry: { get(kind: string): UpgradeViewKind | undefined };
  /** Every built-in target, with its change set (`session.availableTargets`). */
  readonly targets: readonly TargetFacts[];
  /** The built-in target with `id`, hooks and all (`targetById` of `@msm/targets`). */
  targetOf(id: string): Target | undefined;
  /** Whether the user's Minecraft files of a version are set up here (`minecraft.status`). */
  minecraftStatus(mcVersion: string): Promise<{ readonly cache?: unknown }>;
  /** Reads one of Minecraft's own files of a version, or `null` (`minecraft.readAsset`). */
  readVanillaAsset(mcVersion: string, path: string): Promise<Uint8Array | null>;
  /** Reads a project picture or other asset (`assets/<namespace>/<path>`), or `null`. */
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  /** The project's folder (the views' choices are kept per project), or `null`. */
  readonly projectRoot: string | null;
  /** Opens the thing (as Things to fix's Show me does; the host closes the dialog). */
  onShow(elementId: string): void;
  /** Opens the Minecraft folder settings. */
  onSetup(): void;
  /** Test hook: whether WebGL is there (the preview panel finds out by itself otherwise). */
  readonly webgl?: boolean;
}
