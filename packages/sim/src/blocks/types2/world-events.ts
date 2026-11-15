/**
 * The place, explosion and command events in the "What happened" trace (B463): fires
 * {@link fireScriptEvent} and writes one line per rule (ran, did not apply, or only in the game)
 * and per hand-written script, by rule name where the rule books give one. The local source asks
 * before placing ({@link WorldEvents.placing}: a stopped placing places nothing), before an
 * explosion breaks blocks ({@link WorldEvents.exploding}) and after a command ran.
 */
import type { SimTrace } from '../../events/trace.js';
import type { SimFiles, SimOrigin } from '../../types.js';
import {
  type ExplosionCause,
  fireScriptEvent,
  type RuleOutcome,
  readScriptListeners,
  type ScriptEventName,
  type ScriptEventResult,
  type ScriptListener,
} from './script-events.js';

/** Finds a rule's name in the project's rule books, when it has one. */
export type RuleNamer = (book: string, key: string) => string | undefined;

const WHAT: Readonly<Record<ScriptEventName, string>> = {
  'block.place': 'the placing',
  'world.explosion': 'the explosion',
  command: 'the command',
};

/** The listeners of the current files and the trace lines of their firings. */
export class WorldEvents {
  private listenersNow: ScriptListener[];
  private readonly trace: SimTrace;
  private readonly ruleName: RuleNamer;

  constructor(files: SimFiles, trace: SimTrace, ruleName: RuleNamer = () => undefined) {
    this.listenersNow = readScriptListeners(files);
    this.trace = trace;
    this.ruleName = ruleName;
  }

  /** The listeners read from the current files. */
  get listeners(): readonly ScriptListener[] {
    return this.listenersNow;
  }

  /** Reads the listeners of new files (a live edit). */
  setFiles(files: SimFiles): void {
    this.listenersNow = readScriptListeners(files);
  }

  /** Whether anything listens for the event (for `subject`). */
  hears(event: ScriptEventName, subject?: string): boolean {
    return this.listenersNow.some(
      (one) => one.event === event && (one.subject === undefined || one.subject === subject),
    );
  }

  /** A player is about to place `block` (named `name`): `block.place`. */
  placing(block: string, name: string): ScriptEventResult {
    return this.fire('block.place', block, `You placed ${name}`);
  }

  /** Something explodes: `world.explosion`, with the cause the "caused by" condition reads. */
  exploding(cause: ExplosionCause, sentence: string): ScriptEventResult {
    return this.fire('world.explosion', undefined, sentence, cause);
  }

  /** A project command ran: its `command` listeners (Rules made for a command with a function). */
  commandRan(id: string, sentence: string): ScriptEventResult {
    return this.fire('command', id, sentence);
  }

  private fire(
    event: ScriptEventName,
    subject: string | undefined,
    sentence: string,
    cause?: ExplosionCause,
  ): ScriptEventResult {
    const result = fireScriptEvent(this.listenersNow, event, subject, cause);
    for (const one of result.rules) this.writeRule(event, sentence, one);
    for (const script of result.scripts) {
      this.trace.add({
        kind: 'onlyInMinecraft',
        text: `the script ${script.path} hears ${WHAT[event]} (${event}); scripts run only in the game`,
        origin: { elementId: script.path },
      });
    }
    return result;
  }

  private writeRule(event: ScriptEventName, sentence: string, one: RuleOutcome): void {
    const book = one.listener.book as string;
    const name = this.ruleName(book, one.rule.key) ?? one.rule.key;
    const origin: SimOrigin = { elementId: book, ruleBook: book, ruleKey: one.rule.key };
    const what = WHAT[event];
    if (one.outcome === 'skipped') {
      this.trace.add({
        kind: 'skipped',
        text: `${sentence}, but rule "${name}" did not apply: ${conditionWords(one.condition)}.`,
        origin,
      });
      return;
    }
    if (one.outcome === 'unknown') {
      this.trace.add({
        kind: 'onlyInMinecraft',
        text: `whether rule "${name}" applies to ${what}: its condition is checked only in the game, so the preview leaves it out`,
        origin,
      });
      return;
    }
    const did = one.rule.cancels
      ? event === 'block.place'
        ? 'it stopped the placing'
        : 'it stopped the explosion'
      : one.rule.keepsBlocks
        ? 'it kept the blocks safe'
        : 'it ran';
    this.trace.add({
      kind: 'trigger',
      text: `${sentence}, so rule "${name}" ran: ${did}.`,
      origin,
      depth: 1,
    });
    if (one.rule.otherSteps) {
      this.trace.add({
        kind: 'onlyInMinecraft',
        text: `the other steps of rule "${name}" (it runs as a script)`,
        origin,
      });
    }
  }
}

/** A condition in plain words, for a rule that did not apply. */
function conditionWords(condition: string | undefined): string {
  if (condition === undefined) return 'its condition did not hold';
  const type = /isType\(other, "([^"]+)"\)/.exec(condition);
  if (type !== null) return `the explosion was not caused by ${type[1]}`;
  if (condition.includes('other === undefined')) return 'the explosion was not caused by a block';
  return 'its condition did not hold';
}
