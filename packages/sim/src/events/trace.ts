/**
 * The "What happened" trace (B396, ADR 0085 D8): one entry per trigger fired, action run or
 * skipped, and "Only in Minecraft" line, with its origin (element id, event id, and the rule key
 * and book when the event is one Rules generated). Every entry also goes to the log in plain
 * words, so the panel works from the log alone; the trace keeps every firing (the log says each
 * "Only in Minecraft" line once) for the panel's links and for tests. B398 draws it.
 *
 * Logic rules (B401): each step a rule of a generated Rules script reached in the script worker
 * (its conditions checked, chances rolled, loops, waits, what it did, an error) is an entry named
 * by the rule (`Rule "<name>" ...`), with the rule's key and book in its origin and the step in
 * {@link TraceEntry.ruleStep}; the script bridge writes them.
 */
import type { BlockPos, SimLog, SimOrigin } from '../types.js';

/** What a trace entry records. */
export type TraceKind =
  /** A trigger fired an event. */
  | 'trigger'
  /** An action ran (or showed as an effect or a chip). */
  | 'action'
  /** An action or trigger did nothing here, as it would do nothing in the game (no player, on cooldown, chance). */
  | 'skipped'
  /** Something only the game does (ADR 0085 D5). */
  | 'onlyInMinecraft';

/** One entry of the trace. */
export interface TraceEntry {
  /** The tick it happened in. */
  readonly tick: number;
  readonly kind: TraceKind;
  /** The sentence in plain words, by display name. */
  readonly text: string;
  /** Where it comes from. */
  readonly origin: SimOrigin;
  /** The trigger's spec id (`block:msm:on_interact`), for `trigger` entries. */
  readonly trigger?: string;
  /** The action type (`give_item`), for `action` entries and actions said or skipped. */
  readonly action?: string;
  /** The action's index in its event. */
  readonly actionIndex?: number;
  /** How deep in a `trigger_event` chain: the fired event is 1. */
  readonly depth?: number;
  /** The event's block, when it has one (a block's trigger or an action of its event). */
  readonly pos?: BlockPos;
  /** For a `trigger_event` action, the event it ran (at `depth + 1`). */
  readonly ranEvent?: string;
  /**
   * For a step of a logic rule in a generated script (B401): what the step was (`check`,
   * `chance`, `repeat`, `each`, `wait`, `resume`, `gone`, `error`, `start`), or `did` for
   * something the rule did (a block set, a sound, a message, an item given, a counter, a line
   * only the game has). The rule is `origin.ruleKey` of `origin.ruleBook`.
   */
  readonly ruleStep?: string;
}

/** The most entries a trace keeps. */
export const TRACE_LIMIT = 500;

/** The trace of one area; see the module comment. */
export class SimTrace {
  private readonly kept: TraceEntry[] = [];
  private readonly log: SimLog;
  private readonly now: () => number;
  private readonly limit: number;

  /**
   * @param log - Where each entry is also written in plain words.
   * @param now - The current tick.
   * @param limit - The most entries kept; the oldest go first.
   */
  constructor(log: SimLog, now: () => number, limit: number = TRACE_LIMIT) {
    this.log = log;
    this.now = now;
    this.limit = limit;
  }

  /** The entries kept, oldest first. */
  get entries(): readonly TraceEntry[] {
    return this.kept;
  }

  /** Adds an entry and writes its line (`onlyInMinecraft` lines through `log.onlyInMinecraft`). */
  add(entry: Omit<TraceEntry, 'tick'>): TraceEntry {
    const full: TraceEntry = Object.freeze({ tick: this.now(), ...entry });
    this.kept.push(full);
    if (this.kept.length > this.limit) this.kept.splice(0, this.kept.length - this.limit);
    if (full.kind === 'onlyInMinecraft') this.log.onlyInMinecraft(full.text, full.origin);
    else this.log.info(full.text, full.origin);
    return full;
  }

  /** Forgets every entry (the area was cleared). */
  clear(): void {
    this.kept.length = 0;
  }
}
