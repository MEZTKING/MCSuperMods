/**
 * "Practice players" in the panel "Your game" (B728, ADR 0132 D10): up to seven stand-in players
 * beside you, each with its hearts and team, and what each does now (walk to you or into an area,
 * hit or knock out another, break the block under another, leave, join); and **Watch a round**,
 * which plays the game type's round script on your own game (`gamehub/rounds/`) while you watch
 * from outside it. Everything goes through `source.practice`; the game's own functions answer.
 */

import type { GamesProject, LocalWorldSource, PracticeAction, PracticeView } from '@msm/sim';
import { AREA_KIND, idWords, MAX_PRACTICE_PLAYERS, PREVIEW_PLAYER_NAME } from '@msm/sim';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { RoundPlayer, type RoundRun, roundFactsOf, roundScriptFor } from '../../gamehub/rounds';
import { CHAT_COLOURS } from '../../liveviews/data/lines/text-component';

/** Props of {@link PracticePlayers}. */
export interface PracticePlayersProps {
  readonly source: LocalWorldSource;
  readonly games: GamesProject;
  /** Something changed that the view should draw again. */
  onChanged(): void;
}

/** How often the rows follow the game while it runs (ticks). */
const REFRESH_TICKS = 5;

/** A player's hearts in words: "9 of 10 hearts", or why they have none. */
export function heartsWords(view: PracticeView): string {
  if (!view.online) return 'Away';
  if (view.dead) return 'Dead, back in a moment';
  // Health is in half hearts, as the hearts row counts it.
  const now = Math.ceil(view.health / 2);
  const most = Math.ceil(view.most / 2);
  return `${now} of ${most} ${most === 1 ? 'heart' : 'hearts'}`;
}

/** The choices of a row's "What … does" menu. */
function choicesFor(
  view: PracticeView,
  others: readonly PracticeView[],
  areas: readonly { readonly id: string; readonly name: string }[],
): { readonly value: string; readonly label: string; readonly action: PracticeAction }[] {
  const who = view.name;
  if (!view.online) {
    return [{ value: 'join', label: 'Joins the game again', action: { do: 'join', who } }];
  }
  const out: { value: string; label: string; action: PracticeAction }[] = [
    {
      value: 'walk:me',
      label: 'Walks to you',
      action: { do: 'walk', who, to: { player: PREVIEW_PLAYER_NAME } },
    },
  ];
  for (const area of areas) {
    out.push({
      value: `walk:${area.id}`,
      label: `Walks into ${area.name}`,
      action: { do: 'walk', who, to: { area: area.id } },
    });
  }
  for (const other of others) {
    if (other.name === who || !other.online) continue;
    const them = other.name === PREVIEW_PLAYER_NAME ? 'you' : other.name;
    out.push(
      {
        value: `hit:${other.name}`,
        label: `Hits ${them}`,
        action: { do: 'hit', who, target: other.name },
      },
      {
        value: `out:${other.name}`,
        label: `Knocks ${them} out`,
        action: { do: 'knock_out', who: other.name, by: who },
      },
      {
        value: `under:${other.name}`,
        label: `Breaks the block under ${them}`,
        action: { do: 'break_under', who, target: other.name },
      },
    );
  }
  out.push({ value: 'leave', label: 'Leaves the game', action: { do: 'leave', who } });
  return out;
}

/** The practice players' rows and Watch a round; see the module comment. */
export function PracticePlayers(props: PracticePlayersProps) {
  const { source, games, onChanged } = props;
  const [, setVersion] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const [watching, setWatching] = useState<RoundPlayer | null>(null);
  const [result, setResult] = useState<RoundRun | null>(null);
  const watchRef = useRef<RoundPlayer | null>(null);
  watchRef.current = watching;
  const refresh = (): void => {
    setVersion((n) => n + 1);
    onChanged();
  };

  // The rows follow the game every few ticks; a round being watched does its steps each tick.
  useEffect(() => {
    let ticks = 0;
    return source.subscribe((event) => {
      if (event.type !== 'entities') return;
      const round = watchRef.current;
      if (round !== null && !round.done) {
        round.afterTick();
        if (round.done) {
          setResult(round.result());
          setVersion((n) => n + 1);
          return;
        }
      }
      ticks += 1;
      if (ticks % REFRESH_TICKS === 0) setVersion((n) => n + 1);
    });
  }, [source]);

  // Leaving Try it (or another project) stops a round being watched.
  useEffect(() => () => watchRef.current?.stop(), []);

  const facts = useMemo(() => roundFactsOf(games.elements), [games]);
  const script = facts === undefined ? undefined : roundScriptFor(facts.type);
  const areas = useMemo(
    () =>
      games.elements
        .filter((element) => element.kind === AREA_KIND)
        .map((element) => {
          const data = element.data as { readonly name?: unknown };
          return {
            id: element.id,
            name:
              typeof data.name === 'string' && data.name !== '' ? data.name : idWords(element.id),
          };
        }),
    [games],
  );
  const views = source.practice.views();
  const practice = views.filter((view) => view.name !== PREVIEW_PLAYER_NAME);
  const full = practice.length >= MAX_PRACTICE_PLAYERS;

  const act = (action: PracticeAction): void => {
    const outcome = source.practice.act(action);
    setSaid(outcome.ok ? null : outcome.said);
    refresh();
  };

  const watch = (): void => {
    if (facts === undefined || script === undefined) return;
    source.practice.removeAll();
    const round = new RoundPlayer(source, script, facts);
    round.begin();
    setResult(null);
    setWatching(round);
    refresh();
  };

  const stopWatching = (): void => {
    watching?.stop();
    setWatching(null);
    setResult(null);
    refresh();
  };

  return (
    <div data-testid="tryit-practice" className="flex flex-col gap-1 border-t border-border pt-1">
      <h4 className="font-medium">Practice players</h4>
      <p className="text-muted">
        Stand-ins who play beside you, so a kill, a team at work or a win can be seen here.
      </p>
      {views.map((view) => {
        const colour = view.colour === null ? undefined : CHAT_COLOURS[view.colour];
        const me = view.name === PREVIEW_PLAYER_NAME;
        const choices = me ? [] : choicesFor(view, views, areas);
        return (
          <div key={view.name} data-testid="tryit-practice-row" className="flex flex-col">
            <p className="flex justify-between gap-2">
              <span style={colour === undefined ? {} : { color: colour }}>
                {me ? 'You' : view.name}
                {view.team === null ? '' : ` (${view.team})`}
              </span>
              <span data-testid="tryit-practice-hearts">{heartsWords(view)}</span>
            </p>
            {!me && watching === null && (
              <span className="flex items-center gap-1">
                <select
                  aria-label={`What ${view.name} does`}
                  data-testid="tryit-practice-do"
                  className="min-w-0 flex-1 rounded border border-border bg-bg px-1"
                  value=""
                  onChange={(event) => {
                    const choice = choices.find((one) => one.value === event.target.value);
                    if (choice !== undefined) act(choice.action);
                  }}
                >
                  <option value="">What {view.name} does…</option>
                  {choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                <Button
                  aria-label={`Send ${view.name} away`}
                  data-testid="tryit-practice-remove"
                  onClick={() => {
                    source.practice.remove(view.name);
                    refresh();
                  }}
                >
                  Remove
                </Button>
              </span>
            )}
          </div>
        );
      })}
      {said !== null && (
        <p data-testid="tryit-practice-said" className="text-muted">
          {said}
        </p>
      )}
      {watching === null ? (
        <span className="flex flex-wrap gap-1">
          <Button
            data-testid="tryit-practice-add"
            disabled={full}
            onClick={() => {
              source.practice.add();
              refresh();
            }}
          >
            Add a practice player
          </Button>
          {script !== undefined && (
            <Button data-testid="tryit-practice-watch" onClick={watch}>
              Watch a round
            </Button>
          )}
        </span>
      ) : (
        <div data-testid="tryit-practice-round" className="flex flex-col gap-1">
          <p>
            {result === null
              ? (watching.caption ?? 'The round is starting…')
              : result.winners.length > 0
                ? `Round over: ${result.winners.join(' and ')} won.`
                : 'Round over.'}
          </p>
          <Button data-testid="tryit-practice-stop" onClick={stopWatching}>
            {result === null ? 'Stop watching' : 'Done'}
          </Button>
        </div>
      )}
      {full && watching === null && (
        <p className="text-muted">Seven practice players is the most Try it stands in.</p>
      )}
    </div>
  );
}
