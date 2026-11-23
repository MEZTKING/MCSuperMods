/** The one app-level sound player (ADR 0121 D1; B620), not read from the session store. */

import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { type SoundPlayer, webAudioPlayer } from './player';

const PlayerContext = createContext<SoundPlayer | null>(null);

/** Gives its children the app's sound player (`null` where the page has no Web Audio). */
export function SoundPlayerProvider({
  player,
  children,
}: {
  player?: SoundPlayer | null;
  children: ReactNode;
}) {
  const value = useMemo(() => (player === undefined ? webAudioPlayer() : player), [player]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/** The app's sound player, or `null`. */
export function useSoundPlayer(): SoundPlayer | null {
  return useContext(PlayerContext);
}
