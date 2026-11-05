/**
 * UI state (Zustand): the latest session snapshot plus purely visual state. Project data is
 * owned by the {@link ProjectSession}; this store only mirrors it.
 *
 * @packageDocumentation
 */

import type { Problem, ResourceLocation } from '@msm/core';
import { create } from 'zustand';
import type { MinecraftProgress } from '../../../shared/ipc-channels';
import type { GameLocationList, LauncherSettings, MinecraftStatus } from '../../../shared/platform';
import type { SessionSnapshot } from '../session/project-session';

/** A transient message shown in the status bar. */
export interface StatusMessage {
  kind: 'info' | 'error';
  text: string;
  /** A button shown with the message (for example "Reveal" after an export). */
  action?: { label: string; run(): void } | undefined;
}

/** The editor area's tabs. */
export type EditorTab = 'form' | 'json';

/** The right dock's tabs. */
export type RightDockTab = 'preview' | 'problems';

/** What the UI knows about the Minecraft installation and asset extraction. */
export interface MinecraftUiState {
  /** The last status read from main, or `null` before the first read. */
  status: MinecraftStatus | null;
  /** Progress of a running extraction, or `null` when none is running. */
  progress: MinecraftProgress | null;
  /**
   * The game locations main found (ADR 0019), or `null` before the first read or when they
   * could not be read. Refreshed with the status.
   */
  locations?: GameLocationList | null;
  /** The launcher folders the user added in Settings, or `null` before they are read. */
  launchers?: LauncherSettings | null;
}

/** The UI store's shape. */
export interface UiState {
  snapshot: SessionSnapshot | null;
  selectedId: ResourceLocation | null;
  /** RFC 6901 pointer of the focused field in the selected element, or `null`. */
  selectedPointer: string | null;
  /**
   * The span within the value at {@link UiState.selectedPointer} to put the caret at (a
   * function problem's `range`), or `null`. Cleared whenever the pointer changes.
   */
  selectedRange: { start: number; end: number } | null;
  activeTab: EditorTab;
  rightDock: RightDockTab;
  minecraft: MinecraftUiState;
  message: StatusMessage | null;
  /** Problems reported by the last export or install (cleared by the next one). */
  exportProblems: readonly Problem[];
  /** The namespace the last element was created in (New element dialog), or `null`. */
  lastNamespace: string | null;

  setSnapshot(snapshot: SessionSnapshot): void;
  /** Selects an element (and optionally a field in it); clears the field otherwise. */
  select(id: ResourceLocation | null, pointer?: string | null): void;
  selectPointer(pointer: string | null): void;
  /**
   * Selects an element, switches to the Form tab and focuses `pointer` there; `range` puts
   * the caret at its start within that value (a function line's column).
   */
  navigateTo(
    id: ResourceLocation,
    pointer: string | null,
    range?: { start: number; end: number } | null,
  ): void;
  setExportProblems(problems: readonly Problem[]): void;
  setActiveTab(tab: EditorTab): void;
  setRightDock(tab: RightDockTab): void;
  setMinecraftStatus(status: MinecraftStatus | null): void;
  setMinecraftProgress(progress: MinecraftProgress | null): void;
  setMinecraftLocations(locations: GameLocationList | null): void;
  setLauncherSettings(launchers: LauncherSettings | null): void;
  setMessage(message: StatusMessage | null): void;
  setLastNamespace(namespace: string | null): void;
}

/** The UI store. */
export const useUiStore = create<UiState>()((set) => ({
  snapshot: null,
  selectedId: null,
  selectedPointer: null,
  selectedRange: null,
  activeTab: 'form',
  rightDock: 'problems',
  minecraft: { status: null, progress: null, locations: null, launchers: null },
  message: null,
  exportProblems: [],
  lastNamespace: null,
  setSnapshot: (snapshot) =>
    set((state) => {
      const stillExists =
        state.selectedId !== null &&
        snapshot.project?.namespaces.some((namespace) =>
          namespace.elements.some((element) => element.id === state.selectedId),
        ) === true;
      return stillExists
        ? { snapshot }
        : { snapshot, selectedId: null, selectedPointer: null, selectedRange: null };
    }),
  select: (selectedId, pointer = null) =>
    set({ selectedId, selectedPointer: pointer, selectedRange: null }),
  selectPointer: (selectedPointer) => set({ selectedPointer, selectedRange: null }),
  navigateTo: (selectedId, selectedPointer, range = null) =>
    set({ selectedId, selectedPointer, selectedRange: range, activeTab: 'form' }),
  setExportProblems: (exportProblems) => set({ exportProblems }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setRightDock: (rightDock) => set({ rightDock }),
  setMinecraftStatus: (status) => set((state) => ({ minecraft: { ...state.minecraft, status } })),
  setMinecraftProgress: (progress) =>
    set((state) => ({ minecraft: { ...state.minecraft, progress } })),
  setMinecraftLocations: (locations) =>
    set((state) => ({ minecraft: { ...state.minecraft, locations } })),
  setLauncherSettings: (launchers) =>
    set((state) => ({ minecraft: { ...state.minecraft, launchers } })),
  setMessage: (message) => set({ message }),
  setLastNamespace: (lastNamespace) => set({ lastNamespace }),
}));
