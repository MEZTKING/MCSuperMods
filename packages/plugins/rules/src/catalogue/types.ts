/**
 * Types of the Rules catalogue (ADR 0082 D4, D5): what the editor offers and what the compiler
 * knows about each trigger, step, condition, value, place and "who". The ids are the rule book
 * format (`packages/schemas/mcdoc/msm/rules.mcdoc`); labels and sentences are the plain words
 * the cards, the generated script's comments and the AI helper use.
 */

/** The kind of picker or editor a blank in a sentence opens. */
export type SlotType =
  | 'item'
  | 'block'
  | 'mob'
  | 'sound'
  | 'particle'
  | 'effect'
  | 'function'
  | 'dimension'
  | 'number'
  | 'seconds'
  | 'percent'
  | 'text'
  | 'counter'
  | 'place'
  | 'who'
  | 'choice'
  /** A project key bind (`msm:key_bind`). */
  | 'key'
  /** A project vehicle (`msm:vehicle`). */
  | 'vehicle'
  /** A project HUD element (`msm:hud`). */
  | 'hud'
  /** A weapon of the vehicle, by its `id` in the vehicle's `weapons`. */
  | 'weapon'
  /** A project command (`msm:command`, ADR 0096 D1). */
  | 'command'
  /** One of the arguments of the trigger's command, by name (ADR 0111 D1). */
  | 'argument'
  /** A dialog, vanilla or of the project's data pack (ADR 0111 D4). */
  | 'dialog'
  /** A game rule, vanilla or a project `msm:game_rule` (ADR 0111 D5). */
  | 'game_rule'
  /** What a game rule is set to or compared with: true or false, or a number (ADR 0111 D5). */
  | 'game_rule_value'
  /** A statistic, vanilla or a project `msm:stat` (ADR 0111 D6). */
  | 'stat'
  /** An advancement, vanilla or of the project's data pack (ADR 0111 D3). */
  | 'advancement';

/** One blank of a sentence: the field it edits and how. */
export interface SlotSpec {
  /** The field name in the step, condition, value or trigger options (`count`, `item`). */
  readonly name: string;
  /** The picker or editor. */
  readonly type: SlotType;
  /** Absent in the data means the default. */
  readonly optional?: boolean;
  /** For `choice`: the allowed values with their words. */
  readonly choices?: readonly { readonly value: string | boolean; readonly label: string }[];
  /** For numbers: the smallest and largest allowed literal. */
  readonly min?: number;
  readonly max?: number;
  /** Whole numbers only. */
  readonly whole?: boolean;
  /** Words before the value in the sentence, left out with an absent optional value ("for"). */
  readonly prefix?: string;
}

/** Someone a trigger has: the player, the mob the rule is about, or the other one. */
export type Actor = 'player' | 'mob' | 'other';

/** Who a format action affects (`EffectTarget` in `action.mcdoc`). */
export type ActionTarget = 'self' | 'other';

/** The groups of the When picker. */
export type TriggerGroup =
  | 'blocks'
  | 'containers'
  | 'machines'
  | 'portals'
  | 'items'
  | 'thrown'
  | 'mobs'
  | 'effects'
  | 'players'
  | 'keys'
  | 'vehicles'
  | 'world'
  | 'any';

/** What a trigger's `subject` names. */
export type SubjectSort =
  | 'block'
  | 'item'
  | 'mob'
  | 'effect'
  /** A project key bind (ADR 0088 D6). */
  | 'key'
  /** A project vehicle (ADR 0090 D11). */
  | 'vehicle'
  /** A project command (ADR 0096 D5). */
  | 'command'
  /** An advancement, vanilla or the project's (ADR 0111 D3; script triggers only). */
  | 'advancement'
  /** No subject: player and world triggers. */
  | 'none';

/**
 * Where a definition trigger's event id goes in the subject's element data: a component whose
 * `event` field names it (`msm:on_interact`), or a string field of a component or of the data
 * itself (`msm:redstone`'s `on_powered`, a portal's `on_travel`, a key bind's `msm:on_press`),
 * or an `{ event }` object field of a component or of the data itself (`msm:throwable`'s
 * `on_hit_entity`, a vehicle's `on_tick`), or a string field of every entry of a list of the
 * data (each of a vehicle's `weapons` has its `on_fire`).
 */
export interface TriggerComponent {
  /** The component key, or absent for a top-level field of the element data. */
  readonly component?: string;
  /** The field holding the event: absent means the component's own `event` field. */
  readonly field?: string;
  /** Whether `field` holds an `{ event }` object rather than the id string. */
  readonly fieldIsObject?: boolean;
  /**
   * A list field of the data (`weapons`): `field` is a string field of each of its entries, and
   * the generated event goes into every entry. With `required`, the list must not be empty.
   */
  readonly list?: string;
  /**
   * The component must exist already (it carries required settings of its own, such as a
   * container's layout); the compiler reports `rules.needs-component` otherwise.
   */
  readonly required?: boolean;
  /** Another component the subject must have (`msm:armor` for `msm:while_worn`). */
  readonly needs?: string;
  /** The block `type` the subject must have (`portal` for `on_travel`). */
  readonly blockType?: string;
  /**
   * With a `scriptEvent`: rules that are not plain still go into the definition's event through
   * `run_script` (as for triggers without a script event), so the subject always runs the
   * event; the script event is used only when the subject has `unusableWith` (B458: a
   * command's `event`, which must be there for a command without a function).
   */
  readonly bridge?: boolean;
  /**
   * A field of the data that rules out the event (a command with a `function` cannot also run
   * an `event`, ADR 0096 D1): when the subject has it, every rule of the trigger listens to the
   * trigger's `scriptEvent` instead and the definition is left alone.
   */
  readonly unusableWith?: string;
}

/** How one trigger option maps onto the trigger component (ADR 0082 D3, R16). */
export interface TriggerOptionMapping {
  /** The rule book option (`interval_seconds`). */
  readonly option: string;
  /** The component field (`interval_ticks`). */
  readonly field: string;
  /** Seconds to ticks (times 20, rounded), or copied as is. */
  readonly convert: 'ticks' | 'copy';
  /** The smallest value the component accepts, after conversion. */
  readonly min?: number;
  /** The largest value the component accepts, after conversion. */
  readonly max?: number;
}

/** A catalogue entry: id, words and Very easy visibility. */
export interface CatalogueEntry {
  /** The id in the rule book format. */
  readonly id: string;
  /** Short words for the picker. */
  readonly label: string;
  /** The sentence with `{slot}` blanks, as the card reads it. */
  readonly sentence: string;
  /** The blanks, in sentence order. */
  readonly slots: readonly SlotSpec[];
  /** `false` hides the entry in Very easy mode (run a command, offsets). */
  readonly veryEasy: boolean;
}

/** A trigger (ADR 0082 D4). */
export interface TriggerEntry extends CatalogueEntry {
  readonly group: TriggerGroup;
  /** What `subject` names. */
  readonly subject: SubjectSort;
  /** Whether `subject` may be absent (the `any_` triggers). */
  readonly subjectOptional: boolean;
  /**
   * The element kinds a subject may be. Definition triggers need a project element of these
   * kinds; `any_` triggers take any id, vanilla or project.
   */
  readonly subjectKinds: readonly string[];
  /** Definition triggers: where the event goes. Absent for script-only triggers. */
  readonly definition?: TriggerComponent;
  /**
   * Trigger options and their component fields (definition triggers); without a `component`,
   * fields of the data itself (a key bind's `cooldown_ticks`) or of the `fieldIsObject` object
   * (a vehicle's `on_tick.interval`).
   */
  readonly options: readonly TriggerOptionMapping[];
  /**
   * Script-only triggers: the Script API event (`block.break`). A definition trigger with one
   * too (the key and vehicle triggers, Script API 1.5) compiles its plain rules to the
   * definition's event and the rest to a listener of this event, which runs after it (B421).
   */
  readonly scriptEvent?: string;
  /** The actors the trigger has; pickers hide the others. */
  readonly actors: readonly Actor[];
  /** Plain words for each actor on this trigger ("whoever stepped on it"). */
  readonly actorLabels: Readonly<Partial<Record<Actor, string>>>;
  /**
   * Which format action target means each actor exactly on this trigger's event context
   * (ADR 0058 actors); an actor without one makes steps on it compile to script.
   */
  readonly actionTargets: Readonly<Partial<Record<Actor, ActionTarget>>>;
  /** Whether the trigger happens somewhere ("here"); world triggers do not. */
  readonly hasPlace: boolean;
  /** Whether "here" is a block, so `set_block_state` offsets match "here" (plain rules). */
  readonly hereIsBlock: boolean;
  /** Whether the event can be cancelled ("Stop the normal action"). */
  readonly cancellable: boolean;
  /** Whether the mob of the trigger is already dead (no alive check after a wait). */
  readonly mobDead?: boolean;
  /** Whether the player of the trigger has left (no alive check after a wait). */
  readonly playerGone?: boolean;
}

/** The groups of the Do picker. */
export type StepGroup = 'players' | 'world' | 'sounds' | 'mobs' | 'logic' | 'counters';

/** A step (ADR 0082 D5). */
export interface StepEntry extends CatalogueEntry {
  readonly group: StepGroup;
  /**
   * "(A)" in ADR 0082 D5: the format action the step compiles to when its target matches and
   * its numbers are plain (no readings); absent means script only.
   */
  readonly action?: string;
  /** Logic steps hold other steps (`do`, and `else` for `if`). */
  readonly logic: boolean;
  /** The actor the step needs whatever its `who` (`play_animation` needs the mob). */
  readonly needsActor?: Actor;
  /** The default `who` when the field is absent. */
  readonly defaultWho?: string;
  /**
   * The only triggers the step works on ("Stop the placing" on placing a block); absent means
   * every trigger. Elsewhere the compiler reports `rules.not-for-trigger`.
   */
  readonly triggers?: readonly string[];
}

/** A condition (ADR 0082 D5). */
export interface ConditionEntry extends CatalogueEntry {
  /** The sentence when `not` is set. */
  readonly notSentence: string;
  /** The actor the condition reads. */
  readonly needsActor?: Actor;
  /** The only triggers the condition works on ("caused by" on an explosion); absent means all. */
  readonly triggers?: readonly string[];
}

/** A value reading (ADR 0082 D2, D5). */
export interface ValueEntry extends CatalogueEntry {
  /** The actor the reading needs. */
  readonly needsActor?: Actor;
  /** Whether it may appear inside `math` (every reading but `math` and the word readings). */
  readonly plain: boolean;
  /**
   * A reading in words, not a number ("the way it faces", B458): it fills text slots only; in a
   * number slot the compiler reports `rules.not-a-number`.
   */
  readonly words?: boolean;
  /**
   * The only triggers the reading works on ("What the player typed" on a command, ADR 0111 D1);
   * absent means every trigger. Elsewhere the compiler reports `rules.not-for-trigger`.
   */
  readonly triggers?: readonly string[];
}

/** A named place or a place object (ADR 0082 D5). */
export interface PlaceEntry extends CatalogueEntry {
  /** The actor the place needs ("at the player" needs the player). */
  readonly needsActor?: Actor;
  /** Whether the place is relative to "here". */
  readonly needsHere: boolean;
}

/** A named "who" or the nearby-players object (ADR 0082 D5). */
export interface WhoEntry extends CatalogueEntry {
  readonly needsActor?: Actor;
  readonly needsHere: boolean;
  /** Whether it means several entities. */
  readonly many: boolean;
}
