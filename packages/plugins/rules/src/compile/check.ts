/**
 * The compiler's own checks of one rule (ADR 0082 D4, D6): ids the catalogue knows, actors and
 * places the trigger has, nesting and length caps, cancellable triggers. A rule with an error is
 * left out of the output. The plugin validators (B368) report the same codes on the cards.
 */
import type { Json, JsonObject, Problem, ResourceLocation } from '@msm/plugin-api';
import { asArray, asObject, conditionList, pointer, stepList, str } from '../book';
import {
  type Actor,
  conditionById,
  MAX_DEPTH,
  MAX_STEPS,
  placeById,
  type SlotSpec,
  stepById,
  type TriggerEntry,
  valueById,
  whoById,
} from '../catalogue';
import { RULES_COMPILE_CODES as CODES } from './types';

/** Collects problems for one book. */
export class Reporter {
  readonly problems: Problem[] = [];
  private errors = 0;

  readonly bookId: ResourceLocation;

  constructor(bookId: ResourceLocation) {
    this.bookId = bookId;
  }

  error(code: string, path: string, message: string): void {
    this.errors += 1;
    this.problems.push({ severity: 'error', code, message, elementId: this.bookId, path });
  }

  warning(code: string, path: string, message: string): void {
    this.problems.push({ severity: 'warning', code, message, elementId: this.bookId, path });
  }

  /** The number of errors so far, to tell whether a check added any. */
  get errorCount(): number {
    return this.errors;
  }
}

/** What a step list may use where it is. */
interface Scope {
  readonly actors: ReadonlySet<Actor>;
  readonly here: boolean;
}

const ACTOR_WORDS: Record<Actor, string> = {
  player: 'a player',
  mob: 'a mob',
  other: 'another one',
};

const SCOPE_ACTOR: Record<string, Actor | undefined> = {
  player: 'player',
  mob: 'mob',
  world: undefined,
};

const KEY = /^[a-z0-9_]{1,32}$/;

/** Checks one rule; true when it has no error. */
export function checkRule(
  rule: JsonObject,
  base: string,
  trigger: TriggerEntry,
  reporter: Reporter,
): boolean {
  const before = reporter.errorCount;
  const checker = new RuleChecker(trigger, reporter);
  const key = str(rule, 'key');
  if (key === undefined || !KEY.test(key)) {
    reporter.error(
      CODES.badKey,
      pointer(base, 'key'),
      'A rule key must be 1 to 32 lower-case letters, digits or underscores.',
    );
  }
  const scope: Scope = { actors: new Set(trigger.actors), here: trigger.hasPlace };
  const onlyIf = asObject(rule.only_if);
  if (onlyIf !== undefined) checker.conditions(onlyIf, pointer(base, 'only_if'), scope);
  checker.steps(rule, 'do', base, 1, scope);
  if (checker.stepCount > MAX_STEPS) {
    reporter.error(
      CODES.tooManySteps,
      pointer(base, 'do'),
      `This rule has ${checker.stepCount} steps; a rule can have at most ${MAX_STEPS}.`,
    );
  }
  return reporter.errorCount === before;
}

class RuleChecker {
  stepCount = 0;
  private readonly trigger: TriggerEntry;
  private readonly reporter: Reporter;

  constructor(trigger: TriggerEntry, reporter: Reporter) {
    this.trigger = trigger;
    this.reporter = reporter;
  }

  private actor(actor: Actor, scope: Scope, path: string): void {
    if (scope.actors.has(actor)) return;
    this.reporter.error(
      CODES.noSuchActor,
      path,
      `"${this.trigger.label}" has no ${actor === 'other' ? 'other one' : actor} (${ACTOR_WORDS[actor]}) to use here.`,
    );
  }

  private here(scope: Scope, path: string): void {
    if (scope.here) return;
    this.reporter.error(
      CODES.noSuchPlace,
      path,
      `"${this.trigger.label}" does not happen at a place, so "here" means nothing; pick a player or a mob instead.`,
    );
  }

  steps(owner: JsonObject, field: string, base: string, level: number, scope: Scope): void {
    for (const { step, index } of stepList(owner, field)) {
      this.step(step, pointer(base, field, index), level, scope);
    }
  }

  private step(step: JsonObject, path: string, level: number, scope: Scope): void {
    this.stepCount += 1;
    const id = str(step, 'step') ?? '';
    const entry = stepById(id);
    if (entry === undefined) {
      this.reporter.error(
        CODES.unknownStep,
        pointer(path, 'step'),
        `Unknown step "${id}": it may come from a newer MSM.`,
      );
      return;
    }
    if (entry.logic && level >= MAX_DEPTH) {
      this.reporter.error(
        CODES.tooDeep,
        path,
        `Steps can be nested at most ${MAX_DEPTH} levels deep; move this "${entry.label}" up a level.`,
      );
      return;
    }
    if (entry.needsActor !== undefined) this.actor(entry.needsActor, scope, path);
    if (id === 'stop_normal_action' && !this.trigger.cancellable) {
      this.reporter.error(
        CODES.cannotStop,
        path,
        `"${this.trigger.label}" cannot be stopped; "Stop the normal action" works only when a player uses or breaks a block, uses an item or a mob, hurts a mob, or chats.`,
      );
    }
    this.slots(entry.slots, step, path, scope, entry.defaultWho);
    if (id === 'if') {
      this.conditions(step, path, scope);
      this.steps(step, 'do', path, level + 1, scope);
      this.steps(step, 'else', path, level + 1, scope);
    } else if (id === 'repeat') {
      this.steps(step, 'do', path, level + 1, scope);
    } else if (id === 'for_each_player') {
      if (step.radius !== undefined) this.here(scope, pointer(path, 'radius'));
      const inner: Scope = { actors: new Set([...scope.actors, 'player']), here: scope.here };
      this.steps(step, 'do', path, level + 1, inner);
    }
  }

  conditions(owner: JsonObject, path: string, scope: Scope): void {
    for (const { condition, index } of conditionList(owner).conditions) {
      this.condition(condition, pointer(path, 'conditions', index), scope);
    }
  }

  private condition(condition: JsonObject, path: string, scope: Scope): void {
    const id = str(condition, 'condition') ?? '';
    const entry = conditionById(id);
    if (entry === undefined) {
      this.reporter.error(
        CODES.unknownCondition,
        pointer(path, 'condition'),
        `Unknown condition "${id}": it may come from a newer MSM.`,
      );
      return;
    }
    if (entry.needsActor !== undefined) this.actor(entry.needsActor, scope, path);
    const defaultWho = id === 'mob_is' ? 'other' : undefined;
    if (id === 'mob_is') {
      const who = condition.who ?? 'other';
      if (who === 'every_player') {
        this.reporter.error(
          CODES.noSuchActor,
          pointer(path, 'who'),
          'Pick one: the player, the mob or the other one.',
        );
        return;
      }
    }
    this.slots(entry.slots, condition, path, scope, defaultWho);
  }

  private slots(
    slots: readonly SlotSpec[],
    object: JsonObject,
    path: string,
    scope: Scope,
    defaultWho: string | undefined,
  ): void {
    for (const slot of slots) {
      const value = object[slot.name];
      const at = pointer(path, slot.name);
      switch (slot.type) {
        case 'number':
        case 'seconds':
        case 'percent':
          if (value !== undefined) this.value(value, at, scope);
          break;
        case 'text':
          for (const [index, piece] of asArray(value).entries()) {
            if (typeof piece !== 'string') this.value(piece, pointer(at, index), scope);
          }
          break;
        case 'counter': {
          const actor = SCOPE_ACTOR[str(object, 'scope') ?? 'world'];
          if (actor !== undefined) this.actor(actor, scope, pointer(path, 'scope'));
          break;
        }
        case 'place':
          this.place(value ?? 'here', at, scope);
          break;
        case 'who':
          this.who(value ?? defaultWho ?? 'player', at, scope);
          break;
        default:
          break;
      }
    }
  }

  private value(value: Json, path: string, scope: Scope): void {
    if (typeof value === 'number') return;
    const object = asObject(value);
    const kind = str(object, 'value') ?? '';
    const entry = valueById(kind);
    if (object === undefined || entry === undefined) {
      this.reporter.error(
        CODES.unknownValue,
        pointer(path, 'value'),
        `Unknown value "${kind}": it may come from a newer MSM.`,
      );
      return;
    }
    if (entry.needsActor !== undefined) this.actor(entry.needsActor, scope, path);
    if (kind === 'counter') {
      const actor = SCOPE_ACTOR[str(object, 'scope') ?? 'world'];
      if (actor !== undefined) this.actor(actor, scope, pointer(path, 'scope'));
    }
    if (kind === 'math') {
      for (const side of ['a', 'b']) {
        const part = object[side];
        if (part !== undefined) this.value(part, pointer(path, side), scope);
      }
    }
  }

  private place(value: Json, path: string, scope: Scope): void {
    const object = asObject(value);
    const kind = typeof value === 'string' ? value : (str(object, 'place') ?? '');
    const entry = placeById(kind);
    if (entry === undefined) {
      this.reporter.error(CODES.unknownPlace, path, `Unknown place "${kind}".`);
      return;
    }
    if (entry.needsHere) this.here(scope, path);
    if (entry.needsActor !== undefined) this.actor(entry.needsActor, scope, path);
    if (kind === 'offset') this.place(object?.from ?? 'here', pointer(path, 'from'), scope);
  }

  private who(value: Json, path: string, scope: Scope): void {
    const kind = typeof value === 'string' ? value : (str(asObject(value), 'who') ?? '');
    const entry = whoById(kind);
    if (entry === undefined) {
      this.reporter.error(CODES.unknownPlace, path, `Unknown "who": "${kind}".`);
      return;
    }
    if (entry.needsHere) this.here(scope, path);
    if (entry.needsActor !== undefined) this.actor(entry.needsActor, scope, path);
  }
}
