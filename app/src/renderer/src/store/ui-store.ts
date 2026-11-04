/**
 * UI state (Zustand): the latest session snapshot plus purely visual state. Project data is
 * owned by the {@link ProjectSession}; this store only mirrors it.
 *
 * @packageDocumentation
 */

import type { ResourceLocation } from '@msm/core';
import { create } from 'zustand';
import type { SessionSnapshot } from '../session/project-session';

/** A transient message shown in the status bar. */
export interface StatusMessage {
  kind: 'info' | 'error';
  text: string;
}

/** The UI store's shape. */
export interface UiState {
  snapshot: SessionSnapshot | null;
  selectedId: ResourceLocation | null;
  message: StatusMessage | null;
  setSnapshot(snapshot: SessionSnapshot): void;
  select(id: ResourceLocation | null): void;
  setMessage(message: StatusMessage | null): void;
}

/** The UI store. */
export const useUiStore = create<UiState>()((set) => ({
  snapshot: null,
  selectedId: null,
  message: null,
  setSnapshot: (snapshot) =>
    set((state) => {
      const stillExists =
        state.selectedId !== null &&
        snapshot.project?.namespaces.some((namespace) =>
          namespace.elements.some((element) => element.id === state.selectedId),
        ) === true;
      return { snapshot, selectedId: stillExists ? state.selectedId : null };
    }),
  select: (selectedId) => set({ selectedId }),
  setMessage: (message) => set({ message }),
}));
