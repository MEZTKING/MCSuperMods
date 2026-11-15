/**
 * The Script API 1.6 events Try it fires without running scripts (B463, ADR 0096 D3, B455 and
 * B458 notes): `block.place` (a player places a block; cancellable), `world.explosion` (something
 * explodes; cancellable, or `keepBlocks`) and `command` (a project command runs). Scripts run
 * only in the game until slice 4 (limit L5), so the preview reads what the listeners say:
 *
 * - a script **Rules generated** is read rule by rule (`// rule:<key>` marks, ADR 0082 D3): its
 *   subject filter (`e.block !== "<id>"`, `e.id !== "<id>"`), whether the rule stops the event
 *   (`e.cancel()`) or keeps the blocks safe (`e.keepBlocks()`), and its conditions. A rule
 *   without conditions takes effect; of the conditions the preview knows only "caused by"
 *   (`isType(other, ...)`, `other === undefined`), which it checks against the explosion's
 *   cause; any other condition, and every step that is not a stop or keep, is said out loud;
 * - a **hand-written** script listening for the event is said out loud: it runs only in the game.
 */
import type { SimFiles } from '../../types.js';

/** The events this module reads. */
export type ScriptEventName = 'block.place' | 'world.explosion' | 'command';

/** One rule's part of a generated listener. */
export interface ListenerRule {
  readonly key: string;
  /** The rule stops the event (`stop_placing`, `stop_explosion`). */
  readonly cancels: boolean;
  /** The rule keeps the blocks safe (`keep_blocks_safe`). */
  readonly keepsBlocks: boolean;
  /** The rule's conditions as written (`if (!(...)) return;` lines), in order. */
  readonly conditions: readonly string[];
  /** True when the rule does more than stop or keep (its other steps run only in the game). */
  readonly otherSteps: boolean;
  /** The rule's sentence, from the comment above it. */
  readonly sentence?: string;
}

/** One `msm.events.on(<event>, ...)` of a script. */
export interface ScriptListener {
  /** The script's lowered path. */
  readonly path: string;
  readonly event: ScriptEventName;
  /** The rule book, for a script Rules generated. */
  readonly book?: string;
  /** The block or command id the listener is for, when it filters (`e.block`, `e.id`). */
  readonly subject?: string;
  /** The rules of a generated script; empty for a hand-written one. */
  readonly rules: readonly ListenerRule[];
}

const SCRIPT_PATH = /^msm\/([a-z0-9_.-]+)\/script\/(.+)\.(ts|js)$/;
const BOOK_LINE = /^\/\/ Made by Rules from ([a-z0-9_.-]+:[a-z0-9_./-]+);/;
const STARTS = /msm\.(events\.on|actions\.define)\(\s*["']([^"']+)["']/g;
const SUBJECT = /if \(e\.(block|id) !== "([^"]+)"\) return;/;
const RULE_MARK = /\/\/ rule:([A-Za-z0-9_.-]+)\s*$/;
const CONDITION = /^if \((.*)\) return;/;
const EVENTS: readonly ScriptEventName[] = ['block.place', 'world.explosion', 'command'];

const textOf = (value: string | Uint8Array): string =>
  typeof value === 'string' ? value : new TextDecoder().decode(value);

/** The rules of one generated listener's body, in order. */
function rulesOf(body: string): ListenerRule[] {
  const rules = new Map<
    string,
    { cancels: boolean; keeps: boolean; conditions: string[]; other: boolean; sentence?: string }
  >();
  let sentence: string | undefined;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('// When ')) {
      sentence = line.slice(3);
      continue;
    }
    const mark = RULE_MARK.exec(line);
    if (mark === null) continue;
    const key = mark[1] as string;
    let rule = rules.get(key);
    if (rule === undefined) {
      rule = {
        cancels: false,
        keeps: false,
        conditions: [],
        other: false,
        ...(sentence === undefined ? {} : { sentence }),
      };
      rules.set(key, rule);
    }
    const code = line.slice(0, mark.index).trim();
    if (code.startsWith('rule(') || code === '});' || code === '}); //' || code === '') continue;
    const condition = CONDITION.exec(code);
    if (condition !== null) rule.conditions.push(condition[1] as string);
    else if (code === 'e.cancel();') rule.cancels = true;
    else if (code === 'e.keepBlocks();') rule.keeps = true;
    else rule.other = true;
  }
  return [...rules.entries()].map(([key, rule]) =>
    Object.freeze({
      key,
      cancels: rule.cancels,
      keepsBlocks: rule.keeps,
      conditions: Object.freeze(rule.conditions),
      otherSteps: rule.other,
      ...(rule.sentence === undefined ? {} : { sentence: rule.sentence }),
    }),
  );
}

/** Every listener for the three events among the lowered scripts, in path order. */
export function readScriptListeners(files: SimFiles): ScriptListener[] {
  const out: ScriptListener[] = [];
  const paths = [...files.keys()].filter((path) => SCRIPT_PATH.test(path)).sort();
  for (const path of paths) {
    const raw = files.get(path);
    if (raw === undefined) continue;
    const text = textOf(raw);
    const book = BOOK_LINE.exec(text)?.[1];
    const starts = [...text.matchAll(STARTS)];
    starts.forEach((start, index) => {
      if (start[1] !== 'events.on') return;
      const event = start[2] as ScriptEventName;
      if (!EVENTS.includes(event)) return;
      const end = starts[index + 1]?.index ?? text.length;
      const body = text.slice(start.index, end);
      const subject = SUBJECT.exec(body)?.[2];
      out.push(
        Object.freeze({
          path,
          event,
          ...(book === undefined ? {} : { book }),
          ...(subject === undefined ? {} : { subject }),
          rules: Object.freeze(book === undefined ? [] : rulesOf(body)),
        }),
      );
    });
  }
  return out;
}

/** What the explosion's cause is, for the "caused by" condition: an entity type or a block. */
export type ExplosionCause = { readonly entity: string } | 'block';

/**
 * Whether a rule's condition holds, when the preview can tell: `true` or `false` for the
 * "caused by" conditions (B458) checked against `cause`, `undefined` for any other.
 */
export function conditionHolds(condition: string, cause?: ExplosionCause): boolean | undefined {
  if (cause === undefined) return undefined;
  const type = /^!\(isType\(other, "([^"]+)"\)\)$/.exec(condition);
  if (type !== null) return cause !== 'block' && cause.entity === type[1];
  if (condition === '!(other === undefined)') return cause === 'block';
  return undefined;
}

/** What one rule did when its event came. */
export interface RuleOutcome {
  readonly listener: ScriptListener;
  readonly rule: ListenerRule;
  /** `ran`: it took effect; `skipped`: a condition did not hold; `unknown`: only the game knows. */
  readonly outcome: 'ran' | 'skipped' | 'unknown';
  /** The condition that decided `skipped` or `unknown`. */
  readonly condition?: string;
}

/** What firing an event over its listeners came to. */
export interface ScriptEventResult {
  /** True when a rule stopped the event. */
  readonly cancelled: boolean;
  /** True when a rule kept the blocks safe (explosions). */
  readonly keepBlocks: boolean;
  /** Each generated rule's outcome, in order. */
  readonly rules: readonly RuleOutcome[];
  /** The hand-written scripts that hear the event (they run only in the game). */
  readonly scripts: readonly ScriptListener[];
}

/**
 * Fires one of the three events over its listeners: those for the event whose subject filter
 * lets `subject` through. `cancel` wins over `keepBlocks` (B455).
 */
export function fireScriptEvent(
  listeners: readonly ScriptListener[],
  event: ScriptEventName,
  subject: string | undefined,
  cause?: ExplosionCause,
): ScriptEventResult {
  const rules: RuleOutcome[] = [];
  const scripts: ScriptListener[] = [];
  let cancelled = false;
  let keepBlocks = false;
  for (const listener of listeners) {
    if (listener.event !== event) continue;
    if (listener.subject !== undefined && listener.subject !== subject) continue;
    if (listener.book === undefined) {
      scripts.push(listener);
      continue;
    }
    for (const rule of listener.rules) {
      let outcome: RuleOutcome['outcome'] = 'ran';
      let decided: string | undefined;
      for (const condition of rule.conditions) {
        const holds = conditionHolds(condition, cause);
        if (holds === true) continue;
        outcome = holds === false ? 'skipped' : 'unknown';
        decided = condition;
        break;
      }
      if (outcome === 'ran') {
        if (rule.cancels) cancelled = true;
        if (rule.keepsBlocks) keepBlocks = true;
      }
      rules.push(
        Object.freeze({
          listener,
          rule,
          outcome,
          ...(decided === undefined ? {} : { condition: decided }),
        }),
      );
    }
  }
  return Object.freeze({
    cancelled,
    keepBlocks: keepBlocks && !cancelled,
    rules: Object.freeze(rules),
    scripts: Object.freeze(scripts),
  });
}
