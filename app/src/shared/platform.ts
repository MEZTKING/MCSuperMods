/**
 * The `PlatformAdapter`: every piece of OS access the renderer needs, behind one interface so
 * that a Tauri port stays possible (ADR 0007). The main process implements it over Node; the
 * preload exposes it to the renderer over typed IPC.
 *
 * @packageDocumentation
 */

import type { ProjectFileSystem } from '@msm/core';
import type { MenuCommand } from './ipc-channels';

/** The outcome of opening or creating a project root. */
export type RootResult = { ok: true } | { ok: false; reason: string };

/** Host services for the renderer. */
export interface PlatformAdapter {
  app: { info(): Promise<{ version: string; electron: string; platform: string }> };
  dialogs: {
    pickDirectory(opts: { title: string; mustBeEmpty?: boolean }): Promise<string | null>;
    confirmDiscard(message: string): Promise<boolean>;
  };
  project: {
    openRoot(path: string): Promise<RootResult>;
    createRoot(path: string): Promise<RootResult>;
    closeRoot(): Promise<void>;
    currentRoot(): Promise<string | null>;
  };
  /** File access scoped to the current project root. Rejects when no root is open. */
  fs: ProjectFileSystem;
}

/** What the preload exposes as `window.msm`: the adapter plus window-level events. */
export interface MsmBridge extends PlatformAdapter {
  /** Subscribes to application-menu commands; returns an unsubscribe function. */
  onMenu(listener: (command: MenuCommand) => void): () => void;
  /** Tells the main process whether there are unsaved changes (for the close prompt). */
  setDirty(dirty: boolean): void;
  /** Tells the main process the renderer has rendered (smoke mode). */
  smokeReady(): void;
}
