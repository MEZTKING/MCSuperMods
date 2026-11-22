/**
 * The Mob Studio's "Habits" section (ADR 0109 D3, D4, ADR 0112 D1): switches for the goals of a
 * flying mob (**Swoops**, phantom-like; **Roosts**, bat-like) and the five habits (**Collects
 * items**, allay-like; **Digs up items**, sniffer-like; **Plays dead**, axolotl-like; **Barters**,
 * piglin-like; and on a rideable mob **Dash**, camel-like), each with its few fields. A habit is a
 * goal of `msm:ai_goals` (switching it on adds the goal at the end, off removes it and keeps it
 * to restore), the dash a field of `msm:rideable`. The goals also show in the Behaviour list,
 * where their order can be changed. What a habit needs (flight, an attack, an owner) is said in
 * words next to it.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { typingKey } from '../../forms/context';
import { asObject, pointerOf } from '../blocks-items/blocks-items-model';
import { CheckField, ProblemsAt } from '../blocks-items/parts';
import { IdField, NumberField } from '../structures/pickers';
import { IdList, Section } from '../worldgen/parts';
import { goalsOf } from './entities-model';
import { componentTools, FieldProblems } from './MobKindSection';
import { FLYING_MODES, type MobSectionProps, modeOf } from './mob-kinds';

type JsonObject = { [key: string]: Json };

const GOALS_PATH = ['components', 'msm:ai_goals', 'goals'] as const;
const RIDEABLE = 'msm:rideable';

/** One habit: the goal type, its switch's words, what it does and the goal it starts as. */
export interface HabitSpec {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly fresh: () => JsonObject;
}

/** The habits in the order the section lists them. */
export const HABITS: readonly HabitSpec[] = Object.freeze([
  {
    type: 'swoop',
    label: 'Swoops',
    description: 'Circles high above what it attacks, then dives at it, as a phantom does.',
    fresh: () => ({ type: 'swoop', targets: ['minecraft:player'] }),
  },
  {
    type: 'roost',
    label: 'Roosts',
    description: 'Hangs upside down under a block by day, as a bat does, and lets go when hurt.',
    fresh: () => ({ type: 'roost' }),
  },
  {
    type: 'collect_items',
    label: 'Collects items',
    description:
      'Give it an item and it fetches more of the same for its owner, or for a note block it heard, as an allay does.',
    fresh: () => ({ type: 'collect_items' }),
  },
  {
    type: 'dig_items',
    label: 'Digs up items',
    description: 'Now and then digs on certain blocks and drops what it finds, as a sniffer does.',
    fresh: () => ({ type: 'dig_items', dig_blocks: ['minecraft:grass_block'] }),
  },
  {
    type: 'play_dead',
    label: 'Plays dead',
    description:
      'When badly hurt it lies still, is left alone and gets better, as an axolotl does.',
    fresh: () => ({ type: 'play_dead' }),
  },
  {
    type: 'barter',
    label: 'Barters',
    description:
      'Takes an item from a player or the ground and drops something back, as a piglin does with gold.',
    fresh: () => ({ type: 'barter', item: 'minecraft:gold_ingot' }),
  },
] satisfies HabitSpec[]);

/** The index of the first goal of `type`, or -1. */
export function habitIndex(data: Json | undefined, type: string): number {
  return goalsOf(data).findIndex((goal) => asObject(goal).type === type);
}

/** The goals of `data` with habit `type` switched on (added at the end) or off (every one removed). */
export function withHabit(
  data: Json | undefined,
  spec: HabitSpec,
  on: boolean,
  restored?: Json,
): Json[] {
  const goals = goalsOf(data);
  if (!on) return goals.filter((goal) => asObject(goal).type !== spec.type);
  if (goals.some((goal) => asObject(goal).type === spec.type)) return goals;
  const back = asObject(restored);
  return [...goals, back.type === spec.type ? back : spec.fresh()];
}

/** What a habit still needs in words (empty when nothing). */
export function habitNeeds(data: Json | undefined, type: string): string[] {
  const object = asObject(data);
  const components = asObject(object.components);
  const needs: string[] = [];
  if (type === 'swoop') {
    if (!FLYING_MODES.includes(modeOf(data))) {
      needs.push('It must fly, hover or fly through walls (under Movement).');
    }
    if (components['msm:attack'] === undefined) {
      needs.push('It needs an attack to hit with (under Attack).');
    }
  }
  if (type === 'collect_items' && components['msm:tameable'] === undefined) {
    const goal = asObject(goalsOf(data)[habitIndex(data, type)]);
    if (goal.note_blocks === false) {
      needs.push('It has no owner and no note block to bring items to; let it be tamed.');
    }
  }
  return needs;
}

/** The "Habits" section. */
export function HabitsSection(props: MobSectionProps) {
  const data = asObject(props.data);
  const components = asObject(data.components);
  const setGoals = (next: Json[]) => {
    if (components['msm:ai_goals'] === undefined) {
      props.set(['components', 'msm:ai_goals'], { goals: next });
    } else {
      props.set([...GOALS_PATH], next);
    }
  };
  const toggle = (spec: HabitSpec, on: boolean) => {
    const key = `habit:${spec.type}`;
    if (!on) {
      const index = habitIndex(props.data, spec.type);
      if (index >= 0) props.remember(key, goalsOf(props.data)[index]);
    }
    setGoals(withHabit(props.data, spec, on, on ? props.remembered(key) : undefined));
  };
  const rideable = componentTools(props, RIDEABLE);
  const dash = asObject(rideable.value.dash);
  const dashOn = rideable.value.dash !== undefined;
  const walks = modeOf(props.data) === 'walk' || modeOf(props.data) === 'amphibious';

  return (
    <Section title="Habits" testId="entity-habits">
      <p className="text-muted text-xs">
        Things the mob does by itself, like vanilla creatures. Each one is a goal you can also move
        up or down under Behaviour.
      </p>
      {HABITS.map((spec) => {
        const index = habitIndex(props.data, spec.type);
        const on = index >= 0;
        const goal = on ? asObject(goalsOf(props.data)[index]) : {};
        const at = (key: string) => [...GOALS_PATH, index, key] as const;
        const setField = (key: string, value: Json | undefined, typing = false) => {
          if (value === undefined && !Object.hasOwn(goal, key)) return;
          props.set(at(key), value, typing ? typingKey(pointerOf(at(key))) : undefined);
        };
        const needs = on ? habitNeeds(props.data, spec.type) : [];
        return (
          <div
            key={spec.type}
            className="flex flex-col gap-1 rounded border border-border p-2"
            data-testid={`entity-habit-${spec.type}`}
          >
            <CheckField
              label={spec.label}
              checked={on}
              testId={`entity-habit-${spec.type}-on`}
              onChange={(checked) => toggle(spec, checked)}
            />
            <p className="text-muted text-xs">{spec.description}</p>
            {on && (
              <HabitFields
                type={spec.type}
                goal={goal}
                props={props}
                pointer={pointerOf([...GOALS_PATH, index])}
                setField={setField}
              />
            )}
            {needs.length > 0 && (
              <ul className="text-warning text-xs" data-testid={`entity-habit-${spec.type}-needs`}>
                {needs.map((need) => (
                  <li key={need}>{need}</li>
                ))}
              </ul>
            )}
            {on && (
              <ProblemsAt problems={props.problems} pointer={pointerOf([...GOALS_PATH, index])} />
            )}
          </div>
        );
      })}
      {rideable.on && (
        <div
          className="flex flex-col gap-1 rounded border border-border p-2"
          data-testid="entity-habit-dash"
        >
          <CheckField
            label="Dash"
            checked={dashOn}
            testId="entity-habit-dash-on"
            onChange={(checked) => {
              if (checked) rideable.setField('dash', asObject(props.remembered('habit:dash')));
              else {
                props.remember('habit:dash', rideable.value.dash);
                rideable.setField('dash', undefined);
              }
            }}
          />
          <p className="text-muted text-xs">
            Its rider charges the jump bar and the mob leaps forward, as a camel does (about 7
            blocks at a full bar). It replaces the jump.
          </p>
          {dashOn && (
            <div className="flex flex-wrap items-end gap-2">
              <NumberField
                label="Dash power"
                value={dash.power}
                allowEmpty
                testId="entity-dash-power"
                onCommit={(value) => rideable.setField(['dash', 'power'], value, true)}
              />
              <NumberField
                label="Wait before the next dash (ticks)"
                value={dash.cooldown_ticks}
                integer
                allowEmpty
                testId="entity-dash-cooldown"
                onCommit={(value) => rideable.setField(['dash', 'cooldown_ticks'], value, true)}
              />
            </div>
          )}
          {dashOn && !walks && (
            <p className="text-warning text-xs" data-testid="entity-habit-dash-needs">
              Only a mob that walks can dash. Pick "Walks" or "Walks and swims" under Movement.
            </p>
          )}
          <FieldProblems problems={props.problems} component={RIDEABLE} keys={['dash']} />
        </div>
      )}
    </Section>
  );
}

/** The fields of one habit's goal. */
function HabitFields(props: {
  type: string;
  goal: JsonObject;
  props: MobSectionProps;
  pointer: string;
  setField(key: string, value: Json | undefined, typing?: boolean): void;
}) {
  const { goal, setField } = props;
  const { suggest, problems } = props.props;
  const ids = (key: string) =>
    Array.isArray(goal[key])
      ? (goal[key] as Json[]).filter((id): id is string => typeof id === 'string')
      : [];
  const text = (key: string) => (typeof goal[key] === 'string' ? (goal[key] as string) : '');
  const check = (key: string, label: string, fallback: boolean) => (
    <CheckField
      label={label}
      checked={typeof goal[key] === 'boolean' ? (goal[key] as boolean) : fallback}
      testId={`entity-habit-${props.type}-${key}`}
      onChange={(checked) => setField(key, checked === fallback ? undefined : checked)}
    />
  );
  const number = (key: string, label: string, integer = false) => (
    <NumberField
      label={label}
      value={goal[key]}
      allowEmpty
      integer={integer}
      testId={`entity-habit-${props.type}-${key}`}
      onCommit={(value) => setField(key, value, true)}
    />
  );
  const list = (key: string, label: string, registry: string) => (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="text-muted">{label}</span>
      <IdList
        label={label}
        ids={ids(key)}
        registry={registry}
        suggest={suggest}
        pointer={`${props.pointer}/${key}`}
        problems={problems}
        onChange={(next) => setField(key, next)}
      />
    </div>
  );
  const id = (key: string, label: string, registry: string) => (
    <IdField
      label={label}
      value={text(key)}
      registry={registry}
      suggest={suggest}
      testId={`entity-habit-${props.type}-${key}`}
      onCommit={(value) => setField(key, value)}
    />
  );
  switch (props.type) {
    case 'swoop':
      return (
        <>
          <div className="flex flex-wrap items-end gap-2">
            {number('height', 'Circles this high above (blocks)')}
            {number('speed', 'Dive speed')}
          </div>
          {list('targets', 'Swoops at', 'entity_type')}
          {check('retaliate', 'Fights back when hurt', false)}
        </>
      );
    case 'roost':
      return (
        <>
          {check('daylight', 'Roosts by day', true)}
          {check('when_idle', 'Also roosts when it has nothing to do', false)}
          <div className="flex flex-wrap items-end gap-2">
            {number('range', 'Looks this far up for a roost (blocks)', true)}
          </div>
        </>
      );
    case 'collect_items':
      return (
        <>
          <div className="flex flex-wrap items-end gap-2">
            {number('range', 'Looks this far for items (blocks)')}
            {number('speed', 'Speed')}
          </div>
          {check('note_blocks', 'Brings items to a note block it heard', true)}
        </>
      );
    case 'dig_items':
      return (
        <>
          {list('dig_blocks', 'Digs on', 'block')}
          {id('loot_table', 'What it digs up (a loot table)', 'loot_table')}
          <div className="flex flex-wrap items-end gap-2">
            {number('interval_ticks', 'Time between digs (ticks)', true)}
          </div>
        </>
      );
    case 'play_dead':
      return (
        <>
          <div className="flex flex-wrap items-end gap-2">
            {number('below_health', 'Plays dead below this share of its health (0.5 is half)')}
            {number('ticks', 'Plays dead for (ticks)', true)}
          </div>
          {check('regenerates', 'Gets better while playing dead', true)}
        </>
      );
    case 'barter':
      return (
        <>
          {id('item', 'Barters for (an item)', 'item')}
          {id('loot_table', 'What it gives back (a loot table)', 'loot_table')}
          <div className="flex flex-wrap items-end gap-2">
            {number('ticks', 'Thinks for (ticks)', true)}
          </div>
          {check('from_ground', 'Also picks the item up from the ground', true)}
        </>
      );
    default:
      return null;
  }
}
