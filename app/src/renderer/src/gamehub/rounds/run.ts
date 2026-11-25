/**
 * Plays a round script (B728, ADR 0132 D10) on a `LocalWorldSource` running the game's real
 * lowered files: you watch from outside the game, the script's practice players join, the round
 * starts, and each step is done at its tick until the round is won (the game's state reaches
 * "ending") or the script runs out. Try it's **Watch a round** drives a {@link RoundPlayer} from
 * its own clock; the Game tab's live view (B732) calls {@link playRoundHeadless}, which ticks a
 * source of its own as fast as it can.
 *
 * What the runner adds to the game is said: a missing bed at a team's bed place is put there
 * (the arena's own beds come with its building), and in a headless run the test area's corner is
 * set so the game's places land in it, as a games ground sets it.
 */

import type { LocalWorldSource, PracticeAction, PracticePlace, WorldEvent } from '@msm/sim';
import {
  basesOf,
  gameFunction,
  gameHolder,
  gameObjective,
  gameTag,
  placesOf,
  ROUND_STATES,
  type RoundFacts,
  type WorldPos,
} from './facts';
import type { PlayerRef, RoundScript, RoundScriptStep, ScriptAction, ScriptPlace } from './script';

/** How long a round may run after its last step before the runner gives up (ticks). */
export const ROUND_GRACE_TICKS = 5 * 20;

/** The test area's size across and up (`@msm/sim`'s `AREA_SIZE_X`, `AREA_SIZE_Y`). */
const AREA_ACROSS = 48;
/** How far below the game's lowest place the area's floor lies, so falls have room. */
const ROOM_BELOW = 12;

/** Chat colours that are also dye colours, for the beds the runner puts down. */
const BED_COLOURS = new Set(['black', 'gray', 'blue', 'green', 'red', 'yellow', 'white']);

/** How a round went. */
export interface RoundRun {
  /** Whether the round was won (or ended) before the script ran out. */
  readonly won: boolean;
  /** The practice players the game tagged as winners. */
  readonly winners: readonly string[];
  /** What What happened said while it played, without the "only in Minecraft" lines. */
  readonly lines: readonly string[];
  /** The ticks it took. */
  readonly ticks: number;
}

/** Lines of the function engine's own book-keeping, left out of a round's lines. */
const QUIET = [/^Ran \d+ commands? from function /];

/** One round played on a source; see the module comment. */
export class RoundPlayer {
  private readonly source: LocalWorldSource;
  private readonly facts: RoundFacts;
  private readonly script: RoundScript;
  private readonly steps: readonly RoundScriptStep[];
  private readonly heard: string[] = [];
  private next = 0;
  private startTick = 0;
  private lastAt = 0;
  private finished = false;
  private ended = false;
  private unsubscribe: (() => void) | null = null;
  /** The caption of the step done last, for the panel. */
  caption: string | undefined;

  constructor(source: LocalWorldSource, script: RoundScript, facts: RoundFacts) {
    this.source = source;
    this.script = script;
    this.facts = facts;
    this.steps = [...script.steps(facts)].sort((a, b) => a.at - b.at);
    this.lastAt = this.steps.at(-1)?.at ?? 0;
  }

  /** Whether the round is over (won, ended or out of steps). */
  get done(): boolean {
    return this.finished;
  }

  /** The lines heard so far. */
  get lines(): readonly string[] {
    return this.heard;
  }

  /** Starts: you watch from outside, the players join, the steps at tick 0 are done. */
  begin(): void {
    const { source } = this;
    this.unsubscribe = source.subscribe((event: WorldEvent) => {
      if (event.type !== 'log' || event.line.onlyInMinecraft) return;
      if (QUIET.some((pattern) => pattern.test(event.line.text))) return;
      this.heard.push(event.line.text);
    });
    source.practice.setUserAway(true);
    this.startTick = source.ticksRun;
    this.placeBeds();
    this.due(0);
  }

  /** Call after each tick of the source: the steps that are due, and whether the round ended. */
  afterTick(): void {
    if (this.finished) return;
    const elapsed = this.source.ticksRun - this.startTick;
    this.due(elapsed);
    const state = this.source.functions.state.score(
      gameHolder(this.facts, 'state'),
      gameObjective(this.facts),
    );
    if (state === ROUND_STATES.ending && this.next > 0) {
      this.ended = true;
      this.finish();
    } else if (this.next >= this.steps.length && elapsed > this.lastAt + ROUND_GRACE_TICKS) {
      this.finish();
    }
  }

  /** How the round went so far. */
  result(): RoundRun {
    const winner = gameTag(this.facts, 'winner');
    const tags = this.source.functions.state.tags;
    return {
      won: this.ended,
      winners: this.script.players.filter((name) => tags.get(name)?.has(winner) === true),
      lines: [...this.heard],
      ticks: this.source.ticksRun - this.startTick,
    };
  }

  /** Stops listening; the practice players go and you are back in the game. */
  stop(): void {
    this.finish();
    this.source.practice.removeAll();
  }

  private finish(): void {
    this.finished = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private due(elapsed: number): void {
    while (this.next < this.steps.length) {
      const step = this.steps[this.next] as RoundScriptStep;
      if (step.at > elapsed) break;
      this.next += 1;
      if (step.caption !== undefined) this.caption = step.caption;
      this.run(step.action);
    }
  }

  private run(action: ScriptAction): void {
    const { source, facts } = this;
    if (action.do === 'start') {
      if (source.functions.exists(gameFunction(facts, 'start'))) {
        source.functions.runFunction(gameFunction(facts, 'start'), { as: null, quiet: true });
      }
      return;
    }
    const practice = this.practiceAction(action);
    if (practice !== undefined) source.practice.act(practice);
  }

  private practiceAction(
    action: Exclude<ScriptAction, { do: 'start' }>,
  ): PracticeAction | undefined {
    const name = (ref: PlayerRef): string | undefined => this.resolve(ref);
    switch (action.do) {
      case 'join': {
        const at = action.at === undefined ? undefined : this.place(action.at);
        const team =
          action.team === undefined
            ? undefined
            : typeof action.team === 'string'
              ? action.team
              : basesOf(this.facts)[action.team.base]?.team;
        return {
          do: 'join',
          who: action.who,
          ...(at === undefined ? {} : { at }),
          ...(team === undefined ? {} : { team }),
        };
      }
      case 'leave': {
        const who = name(action.who);
        return who === undefined ? undefined : { do: 'leave', who };
      }
      case 'walk': {
        const who = name(action.who);
        const to = this.place(action.to);
        return who === undefined || to === undefined ? undefined : { do: 'walk', who, to };
      }
      case 'hit': {
        const who = name(action.who);
        const target = name(action.target);
        return who === undefined || target === undefined ? undefined : { do: 'hit', who, target };
      }
      case 'knock_out': {
        const who = name(action.who);
        const by = name(action.by);
        return who === undefined || by === undefined ? undefined : { do: 'knock_out', who, by };
      }
      case 'break_under': {
        const who = name(action.who);
        const target = name(action.target);
        return who === undefined || target === undefined
          ? undefined
          : { do: 'break_under', who, target };
      }
      case 'break': {
        const who = name(action.who);
        const at = this.place(action.at);
        return who === undefined || at === undefined || !('pos' in at)
          ? undefined
          : { do: 'break', who, at: at.pos };
      }
      case 'hit_thing': {
        const who = name(action.who);
        return who === undefined ? undefined : { do: 'hit_thing', who, type: action.type };
      }
      case 'type': {
        const who = name(action.who);
        return who === undefined ? undefined : { do: 'type', who, line: action.line };
      }
    }
  }

  /** A player reference's name now: by role or team as the game dealt them. */
  private resolve(ref: PlayerRef): string | undefined {
    if (typeof ref === 'string') return ref;
    const { tags, teamOf } = this.source.functions.state;
    const players = this.script.players;
    if ('role' in ref) {
      const tag = gameTag(this.facts, `role.${ref.role}`);
      return players.filter((one) => tags.get(one)?.has(tag) === true)[ref.index ?? 0];
    }
    const base = this.resolve(ref.teamOf);
    const team = base === undefined ? undefined : teamOf.get(base);
    if (team === undefined) return undefined;
    const same = players.filter((one) =>
      ref.other === true
        ? teamOf.get(one) !== undefined && teamOf.get(one) !== team
        : teamOf.get(one) === team && one !== base,
    );
    return same[ref.index ?? 0];
  }

  /** A script place as a practice place (world positions). */
  private place(place: ScriptPlace): PracticePlace | undefined {
    if ('pos' in place) return { pos: [place.pos[0], place.pos[1], place.pos[2]] };
    if ('area' in place) return { area: place.area };
    if ('bedOf' in place) {
      const who = this.resolve(place.bedOf);
      const team = who === undefined ? undefined : this.source.functions.state.teamOf.get(who);
      const bed = basesOf(this.facts).find((one) => one.team === team)?.bed;
      return bed === undefined ? undefined : { pos: [bed[0], bed[1], bed[2]] };
    }
    const who = this.resolve(place.near);
    const view = this.source.practice.views().find((one) => one.name === who);
    if (view === undefined) return undefined;
    const [x, y, z] = view.pos;
    return { pos: [x + (place.dx ?? 1), y, z + (place.dz ?? 0)] };
  }

  /** Puts a bed at each team's bed place in the test area where there is none (said). */
  private placeBeds(): void {
    const { source } = this;
    const { corner } = source.functions.state;
    let placed = 0;
    for (const base of basesOf(this.facts)) {
      const at = {
        x: Math.floor(base.bed[0] - corner.x),
        y: Math.floor(base.bed[1] - corner.y),
        z: Math.floor(base.bed[2] - corner.z),
      };
      if (!source.world.inBounds(at) || source.world.get(at) !== null) continue;
      const colour = source.functions.state.teams.get(base.team)?.colour ?? 'red';
      const bed = BED_COLOURS.has(colour) ? colour : 'red';
      source.functions.runLine(
        `setblock ${base.bed[0]} ${base.bed[1]} ${base.bed[2]} minecraft:${bed}_bed[part=foot]`,
        { as: null, quiet: true },
      );
      placed += 1;
    }
    if (placed > 0) {
      source.log.info(
        `Try it put ${placed === 1 ? 'a bed' : `${placed} beds`} where the teams’ beds go (your arena’s own beds come with its building).`,
      );
    }
  }
}

/**
 * The corner that puts a game's places in the test area: their middle across, their lowest
 * place {@link ROOM_BELOW} blocks up (as a games ground centres its building).
 */
export function cornerFor(places: readonly WorldPos[]): { x: number; y: number; z: number } {
  if (places.length === 0) return { x: 0, y: 0, z: 0 };
  const xs = places.map((one) => one[0]);
  const ys = places.map((one) => one[1]);
  const zs = places.map((one) => one[2]);
  const middle = (list: readonly number[]): number =>
    Math.floor((Math.min(...list) + Math.max(...list) + 1) / 2);
  return {
    x: middle(xs) - AREA_ACROSS / 2,
    y: Math.floor(Math.min(...ys)) - ROOM_BELOW,
    z: middle(zs) - AREA_ACROSS / 2,
  };
}

/**
 * Plays a round on a source of its own (the Game tab's live view, the tests): the corner set
 * from the script's places, ticked until the round ends or the script gives up, `maxTicks` at
 * most.
 */
export function playRoundHeadless(
  source: LocalWorldSource,
  script: RoundScript,
  facts: RoundFacts,
  options: { readonly maxTicks?: number; readonly focus?: readonly WorldPos[] } = {},
): RoundRun {
  source.functions.state.corner = cornerFor(options.focus ?? focusOf(script, facts));
  // The world loads (the load functions run) before anyone joins, as in the game.
  source.tick();
  const player = new RoundPlayer(source, script, facts);
  player.begin();
  const most = options.maxTicks ?? 20 * 60 * 5;
  for (let i = 0; i < most && !player.done; i += 1) {
    source.tick();
    player.afterTick();
  }
  const run = player.result();
  player.stop();
  return run;
}

/** The places a headless run fits in the test area: the script's own, else the game's. */
export function focusOf(script: RoundScript, facts: RoundFacts): readonly WorldPos[] {
  return script.focus?.(facts) ?? placesOf(facts);
}
