/**
 * Timers in Try it (ADR 0117 D4, B558). A timer counts through its own lowered functions (B552:
 * `#<path>.ticks` counts to 20, `second` moves `#<path>` on, `end` runs at the limit with the
 * hook `ended`), which the function engine runs every tick. The boss bar and action bar are the
 * game's own screens: Try it draws them as a mock-up from the timer's data (name, colour, where
 * it shows, its length) and the holders the functions keep, `#<path>` and `#<path>.on` on
 * `<ns>.msm_timers`. The engine says the `bossbar` lines are only in the game.
 *
 * Pure.
 */

import {
  elementsOf,
  type GamesProject,
  holderName,
  numberOf,
  objectOf,
  splitId,
  TIMER_KIND,
  textOf,
  titleWords,
} from './data.js';
import type { ScoreReader } from './one-block.js';

/** The objective a namespace's timers count on. */
export function timersObjective(namespace: string): string {
  return `${namespace}.msm_timers`;
}

/** What the mock-up shows of one timer. */
export interface TimerStatus {
  readonly id: string;
  /** The timer's name (its `name`, else plain words of its id). */
  readonly name: string;
  /** `boss_bar`, `action_bar` or `none`. */
  readonly show: string;
  /** The boss bar's colour (`pink`, `blue`, ...). */
  readonly colour: string;
  /** `down` or `up`. */
  readonly count: string;
  /** Its length in seconds. */
  readonly seconds: number;
  /** Whether it runs now (`#<path>.on` is 1). */
  readonly running: boolean;
  /** The seconds the functions show now (`#<path>`), or `null` before it first starts. */
  readonly value: number | null;
  /** The action bar's text, `[name ]<value>s`, as B552 writes it. */
  readonly text: string;
  /** How full the boss bar is, 0 to 1. */
  readonly fill: number;
}

/** Every timer's status. */
export function timerStatuses(games: GamesProject, scores: ScoreReader): TimerStatus[] {
  return elementsOf(games, TIMER_KIND).map((element) => {
    const data = objectOf(element.data);
    const objective = timersObjective(splitId(element.id).namespace);
    const raw = scores.score(holderName(element.id), objective);
    const on = scores.score(holderName(element.id, '.on'), objective);
    const seconds = Math.max(1, Math.trunc(numberOf(data.seconds, 1)));
    const count = textOf(data.count) === 'up' ? 'up' : 'down';
    const name = textOf(data.name).trim();
    const value = raw ?? null;
    const shown = value ?? (count === 'up' ? 0 : seconds);
    const fill = Math.min(1, Math.max(0, shown / seconds));
    return {
      id: element.id,
      name: name === '' ? titleWords(element.id) : name,
      show: textOf(data.show) === '' ? 'boss_bar' : textOf(data.show),
      colour: textOf(data.colour) === '' ? 'white' : textOf(data.colour),
      count,
      seconds,
      running: on === 1,
      value,
      text: name === '' ? `${shown}s` : `${name} ${shown}s`,
      fill,
    };
  });
}
