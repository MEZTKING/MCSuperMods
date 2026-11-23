/**
 * The Game and map Studio (ADR 0132; plan `docs/PLAN-game-studio.md` section 12): one place for
 * a whole game, in nine tabs. B721 stub: the tab row and each tab's stub, not yet shown by the
 * app. B730 builds the shell (the lists and the Studios through the registry), B735 renders it
 * from `App.tsx` as a lazy view as Try it is.
 *
 * @packageDocumentation
 */

import type { ComponentType } from 'react';
import { HUB_TABS, type HubTabId } from './hub-model';
import { useHubStore } from './hub-store';
import { AreasTab } from './tabs/AreasTab';
import { CommandBlocksTab } from './tabs/CommandBlocksTab';
import { GameTab } from './tabs/GameTab';
import { LobbyTab } from './tabs/LobbyTab';
import { MapTab } from './tabs/MapTab';
import { StoryTab } from './tabs/StoryTab';
import { TeamsTab } from './tabs/TeamsTab';
import { TestShareTab } from './tabs/TestShareTab';
import { TimersTab } from './tabs/TimersTab';

/** Each tab's component. */
const TAB_VIEWS: Readonly<Record<HubTabId, ComponentType>> = {
  game: GameTab,
  teams: TeamsTab,
  timers: TimersTab,
  areas: AreasTab,
  'command-blocks': CommandBlocksTab,
  map: MapTab,
  story: StoryTab,
  lobby: LobbyTab,
  'test-share': TestShareTab,
};

/** The hub: its tab row and the chosen tab. */
export default function GameHub() {
  const tab = useHubStore((state) => state.tab);
  const setTab = useHubStore((state) => state.setTab);
  const View = TAB_VIEWS[tab];
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="game-hub">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Game and map Studio">
        {HUB_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === tab}
            className="rounded px-2 py-1 text-sm"
            data-testid={`game-hub-tab-${entry.id}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" data-testid={`game-hub-panel-${tab}`}>
        <View />
      </div>
    </div>
  );
}
