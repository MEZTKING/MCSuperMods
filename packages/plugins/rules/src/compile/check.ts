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
  triggerById,
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

/**
 * What the checks know of the project around a rule: the arguments of the trigger's command
 * (ADR 0111 D1) and the kinds of the project's own game rules (ADR 0111 D5).
 */
export interface CheckContext {
  /** The trigger's command's arguments, name to type; absent off a command or without one. */
  readonly commandArguments?: ReadonlyMap<string, string>;
  /** The kind (`boolean` or `integer`) of a project game rule, or undefined for any other id. */
  readonly gameRuleKind?: (id: string) => string | undefined;
}

/** Argument types Rules reads as numbers (ADR 0111 D1, limit N20). */
const NUMBER_ARGUMENTS = new Set(['integer', 'number']);
/** Argument types Rules reads one part of, by `axis`. */
const POSITION_ARGUMENTS = new Set(['position', 'block_position']);
/** Argument types Rules reads as words. */
const WORD_ARGUMENTS = new Set([
  'word',
  'text',
  'player',
  'entity',
  'item',
  'block',
  'dimension',
  'effect',
]);

/** Every argument type Rules can read (ADR 0111 D1, limit N20). */
export const READABLE_ARGUMENT_TYPES: readonly string[] = Object.freeze([
  ...NUMBER_ARGUMENTS,
  ...POSITION_ARGUMENTS,
  ...WORD_ARGUMENTS,
]);

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

const triggerLabel = (id: string): string => triggerById(id)?.label ?? id;

/** Checks one rule; true when it has no error. */
export function checkRule(
  rule: JsonObject,
  base: string,
  trigger: TriggerEntry,
  reporter: Reporter,
  context: CheckContext = {},
): boolean {
  const before = reporter.errorCount;
  const checker = new RuleChecker(trigger, reporter, context);
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
  private readonly context: CheckContext;

  constructor(trigger: TriggerEntry, reporter: Reporter, context: CheckContext) {
    this.trigger = trigger;
    this.reporter = reporter;
    this.context = context;
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
    if (entry.triggers !== undefined) this.onlyFor(entry.triggers, entry.label, path);
    if (id === 'ride') this.single(step.mount, pointer(path, 'mount'));
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
    if (entry.triggers !== undefined) this.onlyFor(entry.triggers, entry.label, path);
    const defaultWho = id === 'mob_is' ? 'other' : undefined;
    if (id === 'is_facing') this.facingOf(condition.of, pointer(path, 'of'), scope);
    if (id === 'mob_is' || id === 'is_riding') {
      const who = condition.who ?? defaultWho ?? 'player';
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

  /** A step or condition made for some triggers only (B458). */
  private onlyFor(triggers: readonly string[], label: string, path: string): void {
    if (triggers.includes(this.trigger.id)) return;
    this.reporter.error(
      CODES.notForTrigger,
      path,
      `"${label}" works only with ${triggers.map((id) => `"${triggerLabel(id)}"`).join(' or ')}, not with "${this.trigger.label}".`,
    );
  }

  /** "Ride" needs one thing to ride: the player, the mob or the other one. */
  private single(value: Json | undefined, path: string): void {
    if (value === undefined || value === 'player' || value === 'mob' || value === 'other') return;
    this.reporter.error(
      CODES.noSuchActor,
      path,
      'Pick one thing to ride: the player, the mob or the other one.',
    );
  }

  /** Whose facing: "here" needs a place, the others an actor. */
  private facingOf(value: Json | undefined, path: string, scope: Scope): void {
    const of = typeof value === 'string' ? value : 'here';
    if (of === 'here') this.here(scope, path);
    else if (of === 'player' || of === 'mob' || of === 'other') this.actor(of, scope, path);
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
          if (value !== undefined) this.value(value, at, scope, false);
          break;
        case 'text':
          for (const [index, piece] of asArray(value).entries()) {
            if (typeof piece !== 'string') this.value(piece, pointer(at, index), scope, true);
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
        case 'game_rule_value':
          if (value !== undefined) this.gameRuleValue(object, value, path, at, scope);
          break;
        default:
          break;
      }
    }
  }

  private value(value: Json, path: string, scope: Scope, inText: boolean): void {
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
    if (entry.triggers !== undefined) this.onlyFor(entry.triggers, entry.label, path);
    if (kind === 'command_argument') {
      this.commandArgument(object, path, inText);
      return;
    }
    if (entry.words === true && !inText) {
      this.reporter.error(
        CODES.notANumber,
        path,
        `"${entry.label}" gives words, not a number; use it in a message or pick a number.`,
      );
      return;
    }
    if (kind === 'facing') this.facingOf(object.of, pointer(path, 'of'), scope);
    if (kind === 'counter') {
      const actor = SCOPE_ACTOR[str(object, 'scope') ?? 'world'];
      if (actor !== undefined) this.actor(actor, scope, pointer(path, 'scope'));
    }
    if (kind === 'math') {
      for (const side of ['a', 'b']) {
        const part = object[side];
        if (part !== undefined) this.value(part, pointer(path, side), scope, false);
      }
    }
  }

  /**
   * "What the player typed" (ADR 0111 D1): an argument of the trigger's command, of a type
   * Rules reads, and a number where a number is needed.
   */
  private commandArgument(object: JsonObject, path: string, inText: boolean): void {
    const args = this.context.commandArguments;
    if (args === undefined || this.trigger.id !== 'command_used') return;
    const name = str(object, 'name') ?? '';
    const type = args.get(name);
    if (type === undefined) {
      this.reporter.error(
        CODES.unknownValue,
        pointer(path, 'name'),
        `The command has no argument "${name}"; pick one of ${args.size === 0 ? 'its arguments (it has none yet)' : [...args.keys()].map((key) => `"${key}"`).join(', ')}.`,
      );
      return;
    }
    if (!READABLE_ARGUMENT_TYPES.includes(type)) {
      this.reporter.error(
        CODES.unknownValue,
        pointer(path, 'name'),
        `Rules cannot read a ${type.replace(/_/g, ' ')} argument ("${name}"); pass it to a function instead.`,
      );
      return;
    }
    if (inText) return;
    if (WORD_ARGUMENTS.has(type)) {
      this.reporter.error(
        CODES.notANumber,
        path,
        `"${name}" is a ${type.replace(/_/g, ' ')}, not a number; use it in a message or pick a number.`,
      );
    } else if (POSITION_ARGUMENTS.has(type) && str(object, 'axis') === undefined) {
      this.reporter.error(
        CODES.notANumber,
        path,
        `"${name}" is a position; pick its x, y or z to use it as a number.`,
      );
    }
  }

  /**
   * What a game rule is set to or compared with (ADR 0111 D5): true or false for a boolean
   * rule, a number or a reading for a whole-number one; the kind is known for project rules.
   */
  private gameRuleValue(
    owner: JsonObject,
    value: Json,
    ownerPath: string,
    path: string,
    scope: Scope,
  ): void {
    const id = str(owner, 'game_rule');
    const kind = id === undefined ? undefined : this.context.gameRuleKind?.(id);
    const compare = str(owner, 'compare');
    if (typeof value === 'boolean') {
      if (kind === 'integer') {
        this.reporter.error(
          CODES.notANumber,
          path,
          `The game rule "${id}" holds a whole number, not true or false.`,
        );
      } else if (compare !== undefined && compare !== 'equal_to') {
        this.reporter.error(
          CODES.notANumber,
          pointer(ownerPath, 'compare'),
          'True or false can only be equal to; pick "equal to" or a number.',
        );
      }
      return;
    }
    if (kind === 'boolean') {
      this.reporter.error(
        CODES.notANumber,
        path,
        `The game rule "${id}" is true or false, not a number.`,
      );
      return;
    }
    this.value(value, path, scope, false);
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
