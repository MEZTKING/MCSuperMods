/**
 * The Game and map Studio's model (ADR 0132; plan `docs/PLAN-game-studio.md` section 12): its
 * nine tabs in the approved mock-up's order. B721 stub; B730 adds what each tab lists for a
 * mod.
 *
 * @packageDocumentation
 */

/** A tab of the hub. */
export type HubTabId =
  | 'game'
  | 'teams'
  | 'timers'
  | 'areas'
  | 'command-blocks'
  | 'map'
  | 'story'
  | 'lobby'
  | 'test-share';

/** One tab: its id and its label. */
export interface HubTab {
  readonly id: HubTabId;
  readonly label: string;
}

/** The nine tabs, in the mock-up's order. */
export const HUB_TABS: readonly HubTab[] = Object.freeze([
  { id: 'game', label: 'Game' },
  { id: 'teams', label: 'Teams and players' },
  { id: 'timers', label: 'Timers and scores' },
  { id: 'areas', label: 'Areas' },
  { id: 'command-blocks', label: 'Command blocks' },
  { id: 'map', label: 'Map' },
  { id: 'story', label: 'Story' },
  { id: 'lobby', label: 'Lobby' },
  { id: 'test-share', label: 'Test and share' },
]);
