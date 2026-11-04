/**
 * UI state (Zustand): the latest session snapshot plus purely visual state. Project data is
 * owned by the {@link ProjectSession}; this store only mirrors it.
 *
 * @packageDocumentation
 */

import type { ResourceLocation } from '@msm/core';
import { create } from 'zustand';
import type { MinecraftProgress } from '../../../shared/ipc-channels';
import type { MinecraftStatus } from '../../../shared/platform';
import type { SessionSnapshot } from '../session/project-session';

/** A transient message shown in the status bar. */
export interface StatusMessage {
  kind: 'info' | 'error';
  text: string;
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
}

/** The UI store's shape. */
export interface UiState {
  snapshot: SessionSnapshot | null;
  selectedId: ResourceLocation | null;
  /** RFC 6901 pointer of the focused field in the selected element, or `null`. */
  selectedPointer: string | null;
  activeTab: EditorTab;
  rightDock: RightDockTab;
  minecraft: MinecraftUiState;
  message: StatusMessage | null;
  setSnapshot(snapshot: SessionSnapshot): void;
  /** Selects an element (and optionally a field in it); clears the field otherwise. */
  select(id: ResourceLocation | null, pointer?: string | null): void;
  selectPointer(pointer: string | null): void;
  setActiveTab(tab: EditorTab): void;
  setRightDock(tab: RightDockTab): void;
  setMinecraftStatus(status: MinecraftStatus | null): void;
  setMinecraftProgress(progress: MinecraftProgress | null): void;
  setMessage(message: StatusMessage | null): void;
}

/** The UI store. */
export const useUiStore = create<UiState>()((set) => ({
  snapshot: null,
  selectedId: null,
  selectedPointer: null,
  activeTab: 'form',
  rightDock: 'problems',
  minecraft: { status: null, progress: null },
  message: null,
  setSnapshot: (snapshot) =>
    set((state) => {
      const stillExists =
        state.selectedId !== null &&
        snapshot.project?.namespaces.some((namespace) =>
          namespace.elements.some((element) => element.id === state.selectedId),
        ) === true;
      return stillExists ? { snapshot } : { snapshot, selectedId: null, selectedPointer: null };
    }),
  select: (selectedId, pointer = null) => set({ selectedId, selectedPointer: pointer }),
  selectPointer: (selectedPointer) => set({ selectedPointer }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setRightDock: (rightDock) => set({ rightDock }),
  setMinecraftStatus: (status) => set((state) => ({ minecraft: { ...state.minecraft, status } })),
  setMinecraftProgress: (progress) =>
    set((state) => ({ minecraft: { ...state.minecraft, progress } })),
  setMessage: (message) => set({ message }),
}));
