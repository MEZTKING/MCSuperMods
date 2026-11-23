/**
 * The time line under a song's Play button (ADR 0121; B630): how far the playing sound has got,
 * on a bar as long as the longer of the stated length and the file's, with a mark where the data
 * says the song ends and one where the file ends. The position is the app's one player's
 * (`useSoundPlayer().current`: `position()` and `duration`), polled while this view's own sound
 * plays; a press elsewhere takes the player and the line stops.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayingSound } from '../../../audio/player';
import { useSoundPlayer } from '../../../audio/provider';
import { lengthWords } from './song-files';

/** How often the line moves while a sound plays. */
export const TIME_LINE_TICK_MS = 100;

/** What {@link usePlayingTime} answers. */
export interface PlayingTime {
  /** Seconds played, or `null` while this view's sound is not playing. */
  readonly position: number | null;
  /** The playing file's length as the player knows it, or `null`. */
  readonly duration: number | null;
  /** Call when this view's Play button was pressed (its `onPicked`). */
  pressed(): void;
}

/**
 * Follows the sound this view started: after {@link PlayingTime.pressed}, the first sound the
 * player starts is this view's; the line follows it until it ends or another takes its place.
 */
export function usePlayingTime(): PlayingTime {
  const player = useSoundPlayer();
  const [position, setPosition] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [watching, setWatching] = useState(false);
  const before = useRef<PlayingSound | null>(null);
  const mine = useRef<PlayingSound | null>(null);

  const pressed = useCallback(() => {
    before.current = player?.current ?? null;
    mine.current = null;
    setWatching(true);
  }, [player]);

  useEffect(() => {
    if (!watching || player === null) return;
    const tick = (): void => {
      const now = player.current;
      if (mine.current === null) {
        if (now !== null && now !== before.current) mine.current = now;
        else return;
      }
      if (now !== mine.current) {
        mine.current = null;
        setPosition(null);
        setDuration(null);
        setWatching(false);
        return;
      }
      setPosition(now.position());
      setDuration(now.duration);
    };
    tick();
    const timer = setInterval(tick, TIME_LINE_TICK_MS);
    return () => clearInterval(timer);
  }, [watching, player]);

  return { position, duration, pressed };
}

/** Props of {@link TimeLine}. */
export interface TimeLineProps {
  /** Seconds played, or `null` when nothing of this view plays. */
  readonly position: number | null;
  /** The length the data states, in seconds. */
  readonly stated: number | null;
  /** The file's length, in seconds (read from the file, else the player's). */
  readonly file: number | null;
}

/** The bar with its marks and the time in words. */
export function TimeLine(props: TimeLineProps) {
  const { position, stated, file } = props;
  const span = Math.max(stated ?? 0, file ?? 0, position ?? 0);
  const at = (seconds: number): string => `${span > 0 ? (seconds / span) * 100 : 0}%`;
  const total = stated ?? file;
  return (
    <div className="flex flex-col gap-1" data-testid="song-time-line">
      <div
        className="relative h-3 w-full rounded bg-bg border border-border"
        role="progressbar"
        aria-label="Time played"
        aria-valuemin={0}
        aria-valuemax={span > 0 ? Math.round(span) : 0}
        aria-valuenow={Math.round(position ?? 0)}
      >
        {position !== null && (
          <div
            data-testid="song-time-played"
            className="absolute inset-y-0 left-0 rounded bg-accent"
            style={{ width: at(Math.min(position, span)) }}
          />
        )}
        {file !== null && (
          <div
            data-testid="song-time-file-end"
            title={`The file ends at ${lengthWords(file)}`}
            className="absolute -inset-y-1 w-0.5 bg-text"
            style={{ left: `calc(${at(file)} - 1px)` }}
          />
        )}
        {stated !== null && (
          <div
            data-testid="song-time-stated-end"
            title={`The data says the song ends at ${lengthWords(stated)}`}
            className="absolute -inset-y-1 w-0.5 bg-warning"
            style={{ left: `calc(${at(stated)} - 1px)` }}
          />
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span data-testid="song-time-now">
          {position === null ? 'Not playing' : lengthWords(position)}
          {total !== null ? ` of ${lengthWords(total)}` : ''}
        </span>
        <span>
          {file !== null && <span className="mr-3">Black mark: the file ends</span>}
          {stated !== null && <span>Amber mark: the data says it ends</span>}
        </span>
      </div>
    </div>
  );
}
