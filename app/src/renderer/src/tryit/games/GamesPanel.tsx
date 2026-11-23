/**
 * Try it's games looks (ADR 0117 D4, B558), a lazy chunk of its own: loaded only when the
 * project has a games element. The games kinds' own functions run in the simulation's function
 * engine; this draws what the game shows on screen from what they keep, as mock-ups:
 * - timers on a boss bar (top) or the action bar (above the hotbar) while they run;
 * - the sidebar of the objective the functions show there, names in the player's team colour;
 * - "Your game": the game mode (adventure stops breaking), the team the player is on (Try it is
 *   single player, limit M14), each magic block's phase and breaks, and each area with "You are
 *   in it" and "Rebuild now".
 * The areas' outlines are drawn in the view (`TryItView` adds `source.games.outline()` to the
 * picked block's outline). No ids: names are the elements' own or plain words of their ids.
 */

import type { Project } from '@msm/plugin-api';
import { type GameMode, type GamesStatus, type LocalWorldSource, NO_GAMES } from '@msm/sim';
import { useEffect, useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { CHAT_COLOURS } from '../../liveviews/data/lines/text-component';
import { gamesProjectOf } from '../grounds';

/** Boss bar colours as CSS, close to the game's bars (as the Timer Studio draws them). */
const BOSS_BAR_CSS: Readonly<Record<string, string>> = Object.freeze({
  pink: '#ec00b8',
  blue: '#00b7ec',
  red: '#ec3500',
  green: '#1dec00',
  yellow: '#e9ec00',
  purple: '#7b00ec',
  white: '#ececec',
});

/** The game modes in plain words. */
const MODE_LABELS: Readonly<Record<GameMode, string>> = Object.freeze({
  survival: 'Survival',
  creative: 'Creative',
  adventure: 'Adventure',
  spectator: 'Spectator',
});

/** Props of {@link GamesPanel}. */
export interface GamesPanelProps {
  readonly source: LocalWorldSource;
  readonly project: Project | null;
  /** Something changed that the view should draw again. */
  onChanged(): void;
}

/** A score holder's name as the sidebar shows it. */
function holderWords(holder: string): string {
  return /^[0-9a-f]{8}-/.test(holder) ? 'A mob' : holder;
}

/** The games looks; see the module comment. */
export default function GamesPanel(props: GamesPanelProps) {
  const { source, project, onChanged } = props;
  const games = useMemo(() => gamesProjectOf(project), [project]);
  useEffect(() => {
    source.games.setProject(games);
  }, [source, games]);
  useEffect(
    () => () => {
      source.games.setProject(NO_GAMES);
    },
    [source],
  );
  const status: GamesStatus = source.games.status();
  const teamColour =
    status.team === null || status.team.colour === 'reset'
      ? undefined
      : CHAT_COLOURS[status.team.colour];
  const bars = status.timers.filter((timer) => timer.running && timer.show === 'boss_bar');
  const actionBar = status.timers.find((timer) => timer.running && timer.show === 'action_bar');
  return (
    <>
      {bars.length > 0 && (
        <div
          data-testid="tryit-games-bossbars"
          className="pointer-events-none absolute top-2 left-1/2 z-10 flex w-72 -translate-x-1/2 flex-col gap-1"
        >
          {bars.map((timer) => (
            <div key={timer.id} data-testid="tryit-games-bossbar" className="text-center">
              <span className="text-xs text-white [text-shadow:1px_1px_0_#000]">{timer.name}</span>
              <div className="h-1.5 w-full bg-black/60" aria-hidden>
                <div
                  className="h-full"
                  style={{
                    width: `${Math.round(timer.fill * 100)}%`,
                    background: BOSS_BAR_CSS[timer.colour] ?? BOSS_BAR_CSS.white,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {actionBar !== undefined && (
        <p
          data-testid="tryit-games-actionbar"
          className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2 text-sm text-white [text-shadow:1px_1px_0_#000]"
        >
          {actionBar.text}
        </p>
      )}
      {status.sidebar !== null && (
        <div
          data-testid="tryit-games-sidebar"
          className="pointer-events-none absolute top-1/2 right-2 z-10 min-w-32 -translate-y-1/2 bg-black/40 px-1 text-xs text-white"
        >
          <p className="text-center">{status.sidebar.title}</p>
          {status.sidebar.rows.map((row) => (
            <p key={row.holder} className="flex justify-between gap-3">
              <span
                style={
                  row.holder === 'Player' && teamColour !== undefined ? { color: teamColour } : {}
                }
              >
                {row.holder === 'Player' && status.team !== null ? status.team.prefix : ''}
                {holderWords(row.holder)}
                {row.holder === 'Player' && status.team !== null ? status.team.suffix : ''}
              </span>
              <span className="text-[#ff5555]">{row.score}</span>
            </p>
          ))}
        </div>
      )}
      <section
        aria-label="Your game"
        data-testid="tryit-games"
        className="absolute top-2 right-2 z-20 flex max-h-[45%] w-64 flex-col gap-1 overflow-auto rounded border border-border bg-panel/95 p-2 text-xs shadow"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="font-medium">Your game</h3>
        <label className="flex items-center gap-1">
          Play as
          <select
            data-testid="tryit-games-mode"
            className="rounded border border-border bg-bg px-1"
            value={status.gameMode ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              source.games.setGameMode(value === '' ? null : (value as GameMode));
              onChanged();
            }}
          >
            <option value="">Try it’s own (anything breaks)</option>
            {(Object.keys(MODE_LABELS) as GameMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        {status.gameMode === 'adventure' && (
          <p className="text-muted">Adventure: blocks do not break.</p>
        )}
        {status.teams.length > 0 && (
          <label className="flex items-center gap-1">
            Your team
            <select
              data-testid="tryit-games-team"
              className="rounded border border-border bg-bg px-1"
              value={status.team?.id ?? ''}
              onChange={(event) => {
                source.games.setTeam(event.target.value === '' ? null : event.target.value);
                onChanged();
              }}
            >
              <option value="">No team</option>
              {status.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {status.team !== null && (
          <p
            data-testid="tryit-games-name"
            style={teamColour === undefined ? {} : { color: teamColour }}
          >
            {status.team.prefix}Player{status.team.suffix}
          </p>
        )}
        {status.oneBlocks.map((block) => (
          <p key={block.id} data-testid="tryit-games-one-block">
            <span className="font-medium">{block.name}: </span>
            {block.away ??
              (block.started
                ? `${block.phaseName}, ${Math.min(block.breaks, block.breaksInPhase)} of ${block.breaksInPhase} breaks`
                : 'starting…')}
          </p>
        ))}
        {status.areas.map((area) => (
          <div key={area.id} data-testid="tryit-games-area" className="flex items-center gap-1">
            <span className="flex-1">
              <span className="font-medium">{area.name}</span>
              {area.inArea === 'none'
                ? ': not in the test area'
                : area.inside
                  ? ': you are in it'
                  : ''}
            </span>
            {area.reset !== null && area.inArea !== 'none' && (
              <Button
                data-testid="tryit-games-rebuild"
                onClick={() => {
                  source.games.rebuild(area.id);
                  onChanged();
                }}
              >
                Rebuild now
              </Button>
            )}
          </div>
        ))}
        {status.sidebar !== null && status.sidebar.criterion !== 'dummy' && (
          <p className="text-muted">
            Scores that count by themselves (kills, blocks mined) count only in the game.
          </p>
        )}
      </section>
    </>
  );
}
