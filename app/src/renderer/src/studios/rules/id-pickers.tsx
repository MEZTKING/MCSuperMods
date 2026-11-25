/**
 * Pickers for the slot types of Rules batch 2 (ADR 0111 D1, D3–D6; B534's catalogue, B538):
 *
 * - `dialog`, `game_rule`, `stat` and `advancement`: one id from the registry view (the
 *   project's own first, then Minecraft's), narrowed by typing; an id typed in full can be used
 *   as it is ("Use …"). A trigger's optional advancement subject offers "Any advancement" too.
 * - `argument`: one of the arguments of the rule's command (its subject), in plain words, only
 *   those Rules can read (`READABLE_ARGUMENT_TYPES`, limit N20).
 * - `game_rule_value`: true or false for an on-or-off rule, a number (or a reading) for a
 *   whole-number one; a rule whose kind is not known (Minecraft's) offers both.
 * - `kit` and `game` (Rules 4 for games, B729): one of the project's own kits or games
 *   (`msm:kit`, `msm:game`), by name, narrowed by typing; also a game trigger's subject.
 *
 * The pure parts ({@link idChoices}, {@link projectIdChoices}, {@link commandArgumentsOf},
 * {@link gameRuleKindOf}) run in Node tests.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import { READABLE_ARGUMENT_TYPES, type SlotSpec } from '@msm/plugin-rules';
import { Popover } from 'radix-ui';
import { useId, useState } from 'react';
import type { ThingRegistries } from '../../components/thing-picker/ThingPicker';
import { thingName } from '../../components/thing-picker/thing-sources';
import { inputClass } from '../../forms';
import { argumentTypeLabel } from '../scripting/command-model';
import { useBookEdit, useRulesEnv } from './env';
import { MenuList } from './parts';
import { ruleSubjectAt } from './project-pickers';
import { asArray, asObject, getAt, type RuleScope, setAt } from './rules-model';
import { NumberEditor } from './ValueEditor';

/** The slot types that name one id, with the registry their ids come from and their words. */
export const ID_SLOTS: Readonly<
  Record<
    'dialog' | 'game_rule' | 'stat' | 'advancement',
    { registry: string; one: string; own: string; game: string }
  >
> = Object.freeze({
  dialog: { registry: 'dialog', one: 'a dialog', own: 'Your dialogs', game: "Minecraft's dialogs" },
  game_rule: {
    registry: 'game_rule',
    one: 'a game rule',
    own: 'Your game rules',
    game: "Minecraft's game rules",
  },
  stat: {
    registry: 'custom_stat',
    one: 'a statistic',
    own: 'Your statistics',
    game: "Minecraft's statistics",
  },
  advancement: {
    registry: 'advancement',
    one: 'an advancement',
    own: 'Your advancements',
    game: "Minecraft's advancements",
  },
});

/** A slot type of {@link ID_SLOTS}. */
export type IdSlotType = keyof typeof ID_SLOTS;

/** Whether a slot type names one id through {@link IdMenu}. */
export const isIdSlot = (type: string): type is IdSlotType => Object.hasOwn(ID_SLOTS, type);

/** The most choices a menu lists at once; typing narrows the rest. */
export const ID_MENU_LIMIT = 40;

/** One choice of an id menu. */
export interface IdChoice {
  readonly id: string;
  readonly name: string;
  /** The project's own (any namespace but `minecraft`), or the game's. */
  readonly own: boolean;
}

/**
 * The ids of `registry` matching `filter` (in the name or the id, ignoring case), the project's
 * own first, each part by name; `more` counts the matches left out past `limit`.
 */
export function idChoices(
  project: Project,
  registries: ThingRegistries,
  registry: string,
  filter: string,
  limit = ID_MENU_LIMIT,
): { choices: IdChoice[]; more: number } {
  const needle = filter.trim().toLowerCase();
  const all = registries.ids(registry).map((id) => ({
    id,
    name: thingName(project, id),
    own: !id.startsWith('minecraft:'),
  }));
  const matching = all.filter(
    (choice) =>
      needle === '' ||
      choice.id.toLowerCase().includes(needle) ||
      choice.name.toLowerCase().includes(needle),
  );
  matching.sort(
    (a, b) =>
      Number(b.own) - Number(a.own) ||
      a.name.localeCompare(b.name, 'en') ||
      a.id.localeCompare(b.id),
  );
  return { choices: matching.slice(0, limit), more: Math.max(0, matching.length - limit) };
}

/** Whether `text` is a whole namespaced id (`ns:path`). */
export const isFullId = (text: string): boolean => /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(text.trim());

/** The menu of an id slot: a filter box, the choices, and the typed id. */
export function IdMenu(props: {
  pointer: string;
  type: IdSlotType;
  label: string;
  /** Offers "Any …" that removes the value (an optional trigger subject). */
  anyLabel?: string;
}) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const [filter, setFilter] = useState('');
  const filterId = useId();
  const spec = ID_SLOTS[props.type];
  const raw = getAt(book, props.pointer);
  const value = typeof raw === 'string' ? raw : undefined;
  const { choices, more } = idChoices(env.project, env.registries, spec.registry, filter);
  const typed = filter.trim();
  const pick = (id: string | undefined) => change(setAt(book, props.pointer, id));
  return (
    <div className="flex flex-col gap-1.5" data-testid={`rules-id-menu-${props.type}`}>
      <span className="flex items-center gap-1.5">
        <label htmlFor={filterId} className="text-muted">
          Find
        </label>
        <input
          id={filterId}
          type="text"
          className={inputClass}
          data-testid="rules-id-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </span>
      {choices.length === 0 && (
        <p className="text-xs text-muted" data-testid="rules-id-none">
          Nothing matches yet.
        </p>
      )}
      <MenuList
        label={props.label}
        choices={[
          ...(props.anyLabel === undefined
            ? []
            : [
                {
                  key: '',
                  label: props.anyLabel,
                  chosen: value === undefined,
                  testId: 'rules-id-any',
                },
              ]),
          ...choices.map((choice) => ({
            key: choice.id,
            label: env.mode.advanced ? `${choice.name} (${choice.id})` : choice.name,
            group: choice.own ? spec.own : spec.game,
            chosen: choice.id === value,
            testId: `rules-id-${choice.id}`,
          })),
        ]}
        onPick={(key) => pick(key === '' ? undefined : key)}
      />
      {more > 0 && <p className="text-xs text-muted">{more} more: type to narrow the list.</p>}
      {isFullId(typed) && !choices.some((choice) => choice.id === typed) && (
        <Popover.Close asChild>
          <button
            type="button"
            className="rounded px-2 py-1 text-left hover:bg-bg"
            data-testid="rules-id-use-typed"
            onClick={() => pick(typed)}
          >
            Use {typed}
          </button>
        </Popover.Close>
      )}
    </div>
  );
}

/**
 * The slot types that name one of the project's own elements of a kind (Rules 4 for games,
 * B729), with their words.
 */
export const PROJECT_ID_SLOTS: Readonly<
  Record<'kit' | 'game', { kind: string; one: string; none: string }>
> = Object.freeze({
  kit: {
    kind: 'msm:kit',
    one: 'one of your kits',
    none: 'You have no kits yet. Add one under Games with Add element.',
  },
  game: {
    kind: 'msm:game',
    one: 'one of your games',
    none: 'You have no games yet. Add one under Games with Add element.',
  },
});

/** A slot type of {@link PROJECT_ID_SLOTS}. */
export type ProjectIdSlotType = keyof typeof PROJECT_ID_SLOTS;

/** Whether a slot type names one of the project's own kits or games. */
export const isProjectIdSlot = (type: string): type is ProjectIdSlotType =>
  Object.hasOwn(PROJECT_ID_SLOTS, type);

/**
 * The project's elements of `kind` matching `filter` (in the name or the id, ignoring case), by
 * name then id.
 */
export function projectIdChoices(project: Project, kind: string, filter: string): IdChoice[] {
  const needle = filter.trim().toLowerCase();
  const out: IdChoice[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== kind) continue;
      const name = thingName(project, element.id);
      if (
        needle !== '' &&
        !element.id.toLowerCase().includes(needle) &&
        !name.toLowerCase().includes(needle)
      ) {
        continue;
      }
      out.push({ id: element.id, name, own: true });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}

/** The menu of a kit or game slot: the project's own, by name, narrowed by typing. */
export function ProjectIdMenu(props: { pointer: string; type: ProjectIdSlotType; label: string }) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const [filter, setFilter] = useState('');
  const filterId = useId();
  const spec = PROJECT_ID_SLOTS[props.type];
  const raw = getAt(book, props.pointer);
  const value = typeof raw === 'string' ? raw : undefined;
  const all = projectIdChoices(env.project, spec.kind, '');
  const choices = filter.trim() === '' ? all : projectIdChoices(env.project, spec.kind, filter);
  return (
    <div className="flex flex-col gap-1.5" data-testid={`rules-project-menu-${props.type}`}>
      {all.length > 8 && (
        <span className="flex items-center gap-1.5">
          <label htmlFor={filterId} className="text-muted">
            Find
          </label>
          <input
            id={filterId}
            type="text"
            className={inputClass}
            data-testid="rules-project-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </span>
      )}
      {all.length === 0 && (
        <p className="text-xs text-muted" data-testid="rules-project-none">
          {spec.none}
        </p>
      )}
      <MenuList
        label={props.label}
        choices={choices.map((choice) => ({
          key: choice.id,
          label: env.mode.advanced ? `${choice.name} (${choice.id})` : choice.name,
          chosen: choice.id === value,
          testId: `rules-project-${choice.id}`,
        }))}
        onPick={(key) => change(setAt(book, props.pointer, key))}
      />
    </div>
  );
}

/** One argument of a command: its name and its type. */
export interface CommandArgument {
  readonly name: string;
  readonly type: string;
}

/** The arguments of project command `commandId` (named ones only), in order. */
export function commandArgumentsOf(
  project: Project,
  commandId: string | undefined,
): CommandArgument[] {
  if (commandId === undefined) return [];
  for (const namespace of project.namespaces) {
    const element = namespace.elements.find((entry) => entry.id === commandId);
    if (element === undefined) continue;
    return asArray(asObject(element.data)?.arguments).flatMap((argument) => {
      const object = asObject(argument);
      const name = object?.name;
      const type = object?.type;
      return typeof name === 'string' && name !== '' && typeof type === 'string'
        ? [{ name, type }]
        : [];
    });
  }
  return [];
}

/** Whether Rules can read an argument of `type` (limit N20). */
export const readableArgument = (type: string): boolean => READABLE_ARGUMENT_TYPES.includes(type);

/** Whether an argument of `type` is a place, read one part (x, y or z) at a time. */
export const isPositionArgument = (type: string): boolean =>
  type === 'position' || type === 'block_position';

/** The words of an argument in a menu: `name (kind of value)`. */
export const argumentWords = (argument: CommandArgument): string =>
  `${argument.name.replace(/_/g, ' ')} (${argumentTypeLabel(argument.type).toLowerCase()})`;

/** The menu of an `argument` slot: the arguments of the rule's command that Rules can read. */
export function ArgumentMenu(props: { pointer: string; label: string }) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const raw = getAt(book, props.pointer);
  const args = commandArgumentsOf(env.project, ruleSubjectAt(book, props.pointer));
  const readable = args.filter((argument) => readableArgument(argument.type));
  const unreadable = args.filter((argument) => !readableArgument(argument.type));
  return (
    <div className="flex flex-col gap-1.5" data-testid="rules-argument-menu">
      {args.length === 0 && (
        <p className="text-xs text-muted" data-testid="rules-argument-none">
          The command has nothing to type after it yet. Add what the player types in its Studio.
        </p>
      )}
      <MenuList
        label={props.label}
        choices={readable.map((argument) => ({
          key: argument.name,
          label: argumentWords(argument),
          chosen: argument.name === raw,
          testId: `rules-argument-${argument.name}`,
        }))}
        onPick={(key) => change(setAt(book, props.pointer, key))}
      />
      {unreadable.length > 0 && (
        <p className="text-xs text-muted" data-testid="rules-argument-unreadable">
          Rules cannot read{' '}
          {unreadable.map((argument) => argument.name.replace(/_/g, ' ')).join(', ')}; pass{' '}
          {unreadable.length === 1 ? 'it' : 'them'} to a function instead.
        </p>
      )}
    </div>
  );
}

/**
 * The kind of a game rule: a project `msm:game_rule`'s `kind` (`boolean` when absent or
 * unknown), or `undefined` for a rule the project does not have (Minecraft's, limit N20).
 */
export function gameRuleKindOf(
  project: Project,
  id: string | undefined,
): 'boolean' | 'integer' | undefined {
  if (id === undefined) return undefined;
  for (const namespace of project.namespaces) {
    const element = namespace.elements.find(
      (entry) => entry.id === id && entry.kind === 'msm:game_rule',
    );
    if (element !== undefined)
      return asObject(element.data)?.kind === 'integer' ? 'integer' : 'boolean';
  }
  return undefined;
}

/** The parent pointer of `pointer` (the object holding the slot). */
const parentOf = (pointer: string): string => pointer.slice(0, pointer.lastIndexOf('/'));

/** The editor of a `game_rule_value` slot: true or false, or a number, by the rule's kind. */
export function GameRuleValueEditor(props: {
  pointer: string;
  slot: SlotSpec;
  label: string;
  scope: RuleScope;
}) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const rule = asObject(getAt(book, parentOf(props.pointer)))?.game_rule;
  const kind = gameRuleKindOf(env.project, typeof rule === 'string' ? rule : undefined);
  const value: Json | undefined = getAt(book, props.pointer);
  return (
    <div className="flex flex-col gap-1.5" data-testid="rules-game-rule-value">
      {kind !== 'integer' && (
        <MenuList
          label={props.label}
          choices={[
            {
              key: 'true',
              label: 'true (on)',
              chosen: value === true,
              testId: 'rules-game-rule-true',
            },
            {
              key: 'false',
              label: 'false (off)',
              chosen: value === false,
              testId: 'rules-game-rule-false',
            },
          ]}
          onPick={(key) => change(setAt(book, props.pointer, key === 'true'))}
        />
      )}
      {kind === undefined && <p className="text-xs text-muted">Or a number:</p>}
      {kind !== 'boolean' && (
        <NumberEditor
          pointer={props.pointer}
          slot={{ ...props.slot, type: 'number', whole: true }}
          label={props.label}
          scope={props.scope}
          readings
        />
      )}
    </div>
  );
}
