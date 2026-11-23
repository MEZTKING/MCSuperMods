/**
 * The Game and map Studio's state outside the view (ADR 0132), as Try it's store: whether the
 * hub is shown and which tab is chosen. B721 stub; B730 keeps the tab in the mod's view state
 * and B735 opens the hub from the app.
 *
 * Imported by the shell, so it holds no Studio code: the hub stays in its own lazy chunk.
 *
 * @packageDocumentation
 */

import { create } from 'zustand';
import type { HubTabId } from './hub-model';

/** The hub store's shape. */
export interface HubState {
  /** Whether the hub is shown in the editor area. */
  open: boolean;
  /** The chosen tab. */
  tab: HubTabId;
  /** Shows or hides the hub. */
  setOpen(open: boolean): void;
  /** Chooses a tab. */
  setTab(tab: HubTabId): void;
}

/** The hub's store. */
export const useHubStore = create<HubState>((set) => ({
  open: false,
  tab: 'game',
  setOpen: (open) => set({ open }),
  setTab: (tab) => set({ tab }),
}));
