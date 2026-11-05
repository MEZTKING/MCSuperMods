/**
 * Entity Studio (B118) for `msm:entity` element data (ADR 0028 D2, D6):
 *
 * - Identity: display name, category, hitbox size, eye height.
 * - Appearance (`msm:animated_model`): geo model and animation set pickers over the project's
 *   `msm:geo_model` and `msm:animation` elements, texture picker over the project's
 *   `textures/` PNGs, idle, walk and attack animations offered from the chosen set, scale.
 * - Stats: `msm:health` and `msm:movement`.
 * - Attack: `msm:attack` on or off, damage, knockback, the on-attack event.
 * - Behaviour: the ordered `msm:ai_goals` list (add from the six types, remove, move, per-type
 *   fields).
 * - Spawning: natural `spawn` on or off, biomes (ids and `#` tags), weight, group sizes,
 *   placement, heightmap, rule.
 * - Spawn egg: on, or off as `"spawn_egg": false`; creative tab, texture, display name.
 * - Events: the trigger components (`msm:on_hurt`, `msm:on_death`, `msm:on_interact`) and the
 *   shared events editor, with `play_animation` over the chosen animation set.
 *
 * Choices (categories, placements, heightmaps, rules) come from the schema. Everything else
 * stays behind "Advanced (all fields)".
 */

import type { Json } from '@msm/core';
import { ArrowDown, ArrowUp, ExternalLink, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { type FormProblem, isWithin, ProblemList } from '../../forms';
import { typingKey } from '../../forms/context';
import {
  asObject,
  choicesAt,
  eventNames,
  findElement,
  moved,
  pathSetter,
  pointerOf,
} from '../blocks-items/blocks-items-model';
import { EventsEditor } from '../blocks-items/EventsEditor';
import { CheckField, EventSelect, ProblemsAt, TextField } from '../blocks-items/parts';
import { useStructureStudioHost } from '../structures/host';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, IdList, Section } from '../worldgen/parts';
import {
  ANIMATION_KIND,
  animationNames,
  elementIdsOfKind,
  GEO_MODEL_KIND,
  GOALS,
  type GoalField,
  goalSpec,
  goalsOf,
  newGoal,
  newSpawn,
  projectTextureIds,
} from './entities-model';

type JsonObject = { [key: string]: Json };

const MODEL_PATH = ['components', 'msm:animated_model'] as const;
const GOALS_PATH = ['components', 'msm:ai_goals', 'goals'] as const;

/** A "Go to" button for a project element, disabled when the element is not in the project. */
function GoToButton(props: { label: string; id: string; exists: boolean }) {
  const host = useStructureStudioHost();
  return (
    <button
      type="button"
      aria-label={props.label}
      title={
        !props.exists
          ? 'Not part of this project'
          : host === null
            ? 'Not available here'
            : `Open ${props.id}`
      }
      className={iconButtonClass}
      disabled={!props.exists || host === null}
      onClick={() => host?.openElement(props.id as `${string}:${string}`)}
    >
      <ExternalLink size={12} aria-hidden />
    </button>
  );
}

/** One goal of the ordered goal list: its fields and the move and remove buttons. */
function GoalRow(props: {
  goal: Json;
  index: number;
  count: number;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  set(key: string, value: Json | undefined, coalesce?: string): void;
  onMove(to: number): void;
  onRemove(): void;
}) {
  const { goal: raw, index, count, problems, set } = props;
  const goal = asObject(raw);
  const spec = goalSpec(goal.type);
  const name = `Goal ${index + 1}`;
  const pointer = pointerOf([...GOALS_PATH, index]);
  const field = (entry: GoalField) => {
    const value = goal[entry.key];
    const label = `${name} ${entry.label.toLowerCase()}`;
    switch (entry.type) {
      case 'float':
        return (
          <NumberField
            key={entry.key}
            label={label}
            value={typeof value === 'number' ? value : entry.defaultValue}
            allowEmpty
            onCommit={(next) => set(entry.key, next, typingKey(`${pointer}/${entry.key}`))}
          />
        );
      case 'bool': {
        const fallback = entry.defaultValue === true;
        return (
          <CheckField
            key={entry.key}
            label={entry.label}
            checked={typeof value === 'boolean' ? value : fallback}
            onChange={(checked) => set(entry.key, checked === fallback ? undefined : checked)}
          />
        );
      }
      case 'ids': {
        const ids = Array.isArray(value)
          ? value.filter((id): id is string => typeof id === 'string')
          : [];
        return (
          <div key={entry.key} className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted">{entry.label}</span>
            <IdList
              label={`${name} ${entry.label.toLowerCase()}`}
              ids={ids}
              registry="entity_type"
              suggest={props.suggest}
              pointer={`${pointer}/${entry.key}`}
              problems={problems}
              onChange={(next) =>
                set(entry.key, next.length === 0 && entry.required !== true ? undefined : next)
              }
            />
          </div>
        );
      }
    }
  };
  return (
    <li
      className="flex flex-col gap-2 rounded border border-border p-2"
      data-testid={`entity-goal-${index}`}
    >
      <div className="flex items-center gap-1">
        <span className="flex-1 font-medium text-sm">
          {index + 1}. {spec?.label ?? String(goal.type ?? 'Unknown goal')}
        </span>
        <button
          type="button"
          aria-label={`Move ${name} up`}
          className={iconButtonClass}
          disabled={index === 0}
          onClick={() => props.onMove(index - 1)}
        >
          <ArrowUp size={12} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Move ${name} down`}
          className={iconButtonClass}
          disabled={index === count - 1}
          onClick={() => props.onMove(index + 1)}
        >
          <ArrowDown size={12} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Remove ${name}`}
          className={iconButtonClass}
          onClick={props.onRemove}
        >
          <X size={12} aria-hidden />
        </button>
      </div>
      {spec === undefined ? (
        <p className="text-muted text-xs">Unknown goal type; edit it under Advanced.</p>
      ) : (
        spec.fields.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">{spec.fields.map(field)}</div>
        )
      )}
      <ProblemList problems={problems.filter((problem) => problem.path === pointer)} />
      <ProblemList
        problems={problems.filter(
          (problem) =>
            problem.path !== pointer &&
            isWithin(problem.path, pointer) &&
            !spec?.fields.some(
              (entry) => entry.type === 'ids' && isWithin(problem.path, `${pointer}/${entry.key}`),
            ),
        )}
      />
    </li>
  );
}

export function EntityStudio(props: StudioProps) {
  const { project, element, node, problems, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  const [newGoalType, setNewGoalType] = useState<string>(GOALS[0]?.type ?? 'wander');
  // The objects last switched off in this session, per element, so switching them on again
  // restores their fields.
  const [last, setLast] = useState<{ id: string; values: Record<string, Json> }>({
    id: element.id,
    values: {},
  });
  const remembered = (key: string): Json | undefined =>
    last.id === element.id ? last.values[key] : undefined;
  const remember = (key: string, value: Json | undefined) => {
    if (value === undefined || value === false) return;
    setLast((current) => ({
      id: element.id,
      values: { ...(current.id === element.id ? current.values : {}), [key]: value },
    }));
  };

  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const events = eventNames(element.data);
  const components = asObject(data.components);
  const choices = (path: readonly string[]) => choicesAt(node, element.data, path);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );
  const hasErrorAt = (path: readonly (string | number)[]) => {
    const pointer = pointerOf(path);
    return problems.some((problem) => problem.path === pointer && problem.severity === 'error');
  };

  if (advanced) {
    return (
      <section aria-label="Entity Studio" data-testid="entity-studio" className="flex flex-col gap-3">
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="entity-advanced-toggle" />
        {props.form}
      </section>
    );
  }

  const size = asObject(data.size);
  const identity = (
    <Section title="Identity" testId="entity-identity">
      <TextField
        label="Display name"
        value={data.display_name}
        testId="entity-display-name"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <div className="flex flex-wrap gap-2">
        <SelectField
          label="Category"
          value={typeof data.category === 'string' ? data.category : undefined}
          choices={choices(['category'])}
          testId="entity-category"
          onChange={(value) => {
            if (value !== undefined) set(['category'], value);
          }}
        />
        <NumberField
          label="Width"
          value={size.width}
          testId="entity-width"
          onCommit={(value) => set(['size', 'width'], value, typingKey('/size/width'))}
        />
        <NumberField
          label="Height"
          value={size.height}
          testId="entity-height"
          onCommit={(value) => set(['size', 'height'], value, typingKey('/size/height'))}
        />
        <NumberField
          label="Eye height"
          value={data.eye_height}
          allowEmpty
          testId="entity-eye-height"
          onCommit={(value) => set(['eye_height'], value, typingKey('/eye_height'))}
        />
      </div>
      <p className="text-muted text-xs">
        Size is the hitbox in blocks. An empty eye height uses 0.85 times the height.
      </p>
      {at(['category'])}
      {at(['size'])}
      {at(['size', 'width'])}
      {at(['size', 'height'])}
      {at(['eye_height'])}
    </Section>
  );

  const model = asObject(components['msm:animated_model']);
  const modelId = typeof model.model === 'string' ? model.model : '';
  const animationsId = typeof model.animations === 'string' ? model.animations : '';
  const names = animationNames(project, animationsId);
  const textures = projectTextureIds(project);
  const setModel = (key: string, value: Json | undefined, coalesce?: string) =>
    set([...MODEL_PATH, key], value, coalesce);
  const animationSelect = (key: 'idle' | 'walk' | 'attack', label: string, testId: string) => (
    <SelectField
      label={label}
      value={typeof model[key] === 'string' && model[key] !== '' ? model[key] : undefined}
      choices={names}
      emptyLabel="(none)"
      testId={testId}
      onChange={(value) => setModel(key, value)}
    />
  );
  const appearance = (
    <Section title="Appearance" testId="entity-appearance">
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label="Model"
          value={modelId === '' ? undefined : modelId}
          choices={elementIdsOfKind(project, GEO_MODEL_KIND)}
          emptyLabel="(choose a geo model)"
          testId="entity-model"
          onChange={(value) => setModel('model', value ?? '')}
        />
        <GoToButton
          label="Go to model"
          id={modelId}
          exists={modelId !== '' && findElement(project, modelId, GEO_MODEL_KIND) !== undefined}
        />
        <SelectField
          label="Animation set"
          value={animationsId === '' ? undefined : animationsId}
          choices={elementIdsOfKind(project, ANIMATION_KIND)}
          emptyLabel="(none)"
          testId="entity-animations"
          onChange={(value) => setModel('animations', value)}
        />
        <GoToButton
          label="Go to animation set"
          id={animationsId}
          exists={
            animationsId !== '' && findElement(project, animationsId, ANIMATION_KIND) !== undefined
          }
        />
        <SelectField
          label="Texture"
          value={typeof model.texture === 'string' && model.texture !== '' ? model.texture : undefined}
          choices={textures}
          emptyLabel="(choose a texture)"
          testId="entity-texture"
          onChange={(value) => setModel('texture', value ?? '')}
        />
      </div>
      {at([...MODEL_PATH, 'model'])}
      {at([...MODEL_PATH, 'animations'])}
      {at([...MODEL_PATH, 'texture'])}
      <div className="flex flex-wrap items-end gap-2">
        {animationSelect('idle', 'Idle animation', 'entity-idle')}
        {animationSelect('walk', 'Walk animation', 'entity-walk')}
        {animationSelect('attack', 'Attack animation', 'entity-attack-animation')}
        <NumberField
          label="Scale"
          value={model.scale}
          allowEmpty
          testId="entity-scale"
          onCommit={(value) =>
            setModel('scale', value, typingKey('/components/msm:animated_model/scale'))
          }
        />
      </div>
      <p className="text-muted text-xs">
        Models and animation sets come from File, Import Blockbench Model, or New element. Textures
        are the project’s PNGs under textures/. Animation names come from the chosen animation set.
      </p>
      {['idle', 'walk', 'attack', 'scale'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf([...MODEL_PATH, key])} />
      ))}
    </Section>
  );

  const health = asObject(components['msm:health']);
  const movement = asObject(components['msm:movement']);
  /** Sets one movement field; removes the component when nothing is left. */
  const setMovement = (key: string, value: Json | undefined, coalesce?: string) => {
    const next = { ...movement };
    if (value === undefined) delete next[key];
    else next[key] = value;
    if (Object.keys(next).length === 0) set(['components', 'msm:movement'], undefined);
    else set(['components', 'msm:movement', key], value, coalesce);
  };
  const stats = (
    <Section title="Stats" testId="entity-stats">
      <div className="flex flex-wrap gap-2">
        <NumberField
          label="Health"
          value={health.max}
          allowEmpty
          testId="entity-health"
          onCommit={(value) =>
            value === undefined
              ? set(['components', 'msm:health'], undefined)
              : set(['components', 'msm:health', 'max'], value, typingKey('/components/msm:health/max'))
          }
        />
        <NumberField
          label="Speed"
          value={movement.speed}
          allowEmpty
          testId="entity-speed"
          onCommit={(value) =>
            setMovement('speed', value, typingKey('/components/msm:movement/speed'))
          }
        />
        <NumberField
          label="Follow range"
          value={movement.follow_range}
          allowEmpty
          testId="entity-follow-range"
          onCommit={(value) =>
            setMovement('follow_range', value, typingKey('/components/msm:movement/follow_range'))
          }
        />
        <NumberField
          label="Knockback resistance"
          value={movement.knockback_resistance}
          allowEmpty
          testId="entity-knockback-resistance"
          onCommit={(value) =>
            setMovement(
              'knockback_resistance',
              value,
              typingKey('/components/msm:movement/knockback_resistance'),
            )
          }
        />
      </div>
      <CheckField
        label="Swims"
        checked={movement.swims === true}
        testId="entity-swims"
        onChange={(checked) => setMovement('swims', checked ? true : undefined)}
      />
      <CheckField
        label="Fire immune"
        checked={movement.fire_immune === true}
        testId="entity-fire-immune"
        onChange={(checked) => setMovement('fire_immune', checked ? true : undefined)}
      />
      <p className="text-muted text-xs">
        Empty fields use the defaults: health 20 (ten hearts), speed 0.25, follow range 16, no
        knockback resistance.
      </p>
      {at(['components', 'msm:health', 'max'])}
      {['speed', 'follow_range', 'knockback_resistance', 'swims', 'fire_immune'].map((key) => (
        <ProblemsAt
          key={key}
          problems={problems}
          pointer={pointerOf(['components', 'msm:movement', key])}
        />
      ))}
    </Section>
  );

  const attackOn = components['msm:attack'] !== undefined;
  const attack = asObject(components['msm:attack']);
  const attackSection = (
    <Section title="Attack" testId="entity-attack">
      <CheckField
        label="Attacks in melee"
        checked={attackOn}
        testId="entity-attack-enabled"
        onChange={(checked) => {
          if (checked) {
            set(['components', 'msm:attack'], remembered('attack') ?? { damage: 3 });
            return;
          }
          remember('attack', components['msm:attack']);
          set(['components', 'msm:attack'], undefined);
        }}
      />
      {attackOn ? (
        <div className="flex flex-wrap items-end gap-2">
          <NumberField
            label="Damage"
            value={attack.damage}
            testId="entity-attack-damage"
            onCommit={(value) =>
              set(
                ['components', 'msm:attack', 'damage'],
                value,
                typingKey('/components/msm:attack/damage'),
              )
            }
          />
          <NumberField
            label="Knockback"
            value={attack.knockback}
            allowEmpty
            testId="entity-attack-knockback"
            onCommit={(value) =>
              set(
                ['components', 'msm:attack', 'knockback'],
                value,
                typingKey('/components/msm:attack/knockback'),
              )
            }
          />
          <EventSelect
            label="On attack"
            value={attack.on_attack}
            events={events}
            testId="entity-on-attack"
            onChange={(value) => set(['components', 'msm:attack', 'on_attack'], value)}
          />
        </div>
      ) : (
        <p className="text-muted text-xs">
          The entity deals no melee damage. A "Melee attack" goal needs an attack.
        </p>
      )}
      {['damage', 'knockback', 'on_attack'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['components', 'msm:attack', key])} />
      ))}
    </Section>
  );

  const goals = goalsOf(element.data);
  const setGoals = (next: Json[]) => {
    if (components['msm:ai_goals'] === undefined) {
      set(['components', 'msm:ai_goals'], { goals: next });
    } else {
      set([...GOALS_PATH], next);
    }
  };
  const behaviour = (
    <Section title="Behaviour" testId="entity-behaviour">
      <p className="text-muted text-xs">
        Goals run in priority order: the first goal that can run wins. Move a goal up to make it more
        important.
      </p>
      {goals.length === 0 && <p className="text-muted text-xs">No goals: the entity stands still.</p>}
      <ol className="flex flex-col gap-2">
        {goals.map((goal, index) => {
          const pointer = pointerOf([...GOALS_PATH, index]);
          const goalObject = asObject(goal);
          return (
            <GoalRow
              key={`${index}:${String(goalObject.type)}`}
              goal={goal}
              index={index}
              count={goals.length}
              problems={problems}
              suggest={suggest}
              set={(key, value, coalesce) => {
                if (value === undefined && !Object.hasOwn(goalObject, key)) return;
                onChange(
                  `${pointer}/${key}`,
                  value,
                  coalesce === undefined ? undefined : { coalesce },
                );
              }}
              onMove={(to) => setGoals(moved(goals, index, to))}
              onRemove={() => setGoals(goals.filter((_, at) => at !== index))}
            />
          );
        })}
      </ol>
      <div className="flex items-end gap-1">
        <SelectField
          label="New goal type"
          value={newGoalType}
          choices={GOALS.map((entry) => entry.type)}
          testId="entity-new-goal-type"
          onChange={(type) => {
            if (type !== undefined) setNewGoalType(type);
          }}
        />
        <Button
          className="text-xs"
          aria-label="Add goal"
          data-testid="entity-add-goal"
          onClick={() => setGoals([...goals, newGoal(newGoalType)])}
        >
          <Plus size={12} aria-hidden />
          Add goal
        </Button>
      </div>
      {at(['components', 'msm:ai_goals'])}
      {at([...GOALS_PATH])}
    </Section>
  );

  const spawnOn = data.spawn !== undefined;
  const spawn = asObject(data.spawn);
  const biomes = Array.isArray(spawn.biomes)
    ? spawn.biomes.filter((id): id is string => typeof id === 'string')
    : [];
  const spawnSelect = (key: 'placement' | 'heightmap' | 'rule', label: string, empty: string) => (
    <SelectField
      label={label}
      value={typeof spawn[key] === 'string' ? spawn[key] : undefined}
      choices={choices(['spawn', key])}
      emptyLabel={empty}
      testId={`entity-spawn-${key}`}
      onChange={(value) => set(['spawn', key], value)}
    />
  );
  const spawning = (
    <Section title="Spawning" testId="entity-spawning">
      <CheckField
        label="Spawns naturally"
        checked={spawnOn}
        testId="entity-spawns"
        onChange={(checked) => {
          if (checked) {
            set(['spawn'], remembered('spawn') ?? newSpawn());
            return;
          }
          remember('spawn', data.spawn);
          set(['spawn'], undefined);
        }}
      />
      {spawnOn ? (
        <>
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted">Biomes</span>
            <IdList
              label="Biomes"
              ids={biomes}
              registry="worldgen/biome"
              suggest={suggest}
              pointer="/spawn/biomes"
              problems={problems}
              onChange={(next) => set(['spawn', 'biomes'], next)}
            />
            <p className="text-muted">
              Biome ids such as minecraft:plains, or biome tags starting with # such as
              #minecraft:is_overworld; the entity spawns in all of them.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <NumberField
              label="Weight"
              value={spawn.weight}
              integer
              testId="entity-spawn-weight"
              onCommit={(value) => set(['spawn', 'weight'], value, typingKey('/spawn/weight'))}
            />
            <NumberField
              label="Min group"
              value={spawn.min_group}
              integer
              testId="entity-spawn-min-group"
              onCommit={(value) =>
                set(['spawn', 'min_group'], value, typingKey('/spawn/min_group'))
              }
            />
            <NumberField
              label="Max group"
              value={spawn.max_group}
              integer
              testId="entity-spawn-max-group"
              onCommit={(value) =>
                set(['spawn', 'max_group'], value, typingKey('/spawn/max_group'))
              }
            />
            {spawnSelect('placement', 'Placement', '(default: on_ground)')}
            {spawnSelect('heightmap', 'Heightmap', '(default: motion_blocking_no_leaves)')}
            {spawnSelect('rule', 'Rule', '(default: mob)')}
          </div>
          <p className="text-muted text-xs">
            Weight is how often this entity is picked against the other spawns of its category.
          </p>
        </>
      ) : (
        <p className="text-muted text-xs">
          The entity never spawns on its own; use the spawn egg or /summon.
        </p>
      )}
      {at(['spawn'])}
      {['weight', 'min_group', 'max_group', 'placement', 'heightmap', 'rule'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['spawn', key])} />
      ))}
    </Section>
  );

  const hasEgg = data.spawn_egg !== false;
  const egg = asObject(data.spawn_egg);
  const eggSection = (
    <Section title="Spawn egg" testId="entity-spawn-egg">
      <CheckField
        label="Has a spawn egg"
        checked={hasEgg}
        testId="entity-has-egg"
        onChange={(checked) => {
          if (checked) {
            set(['spawn_egg'], remembered('spawn_egg') ?? {});
            return;
          }
          remember('spawn_egg', data.spawn_egg);
          set(['spawn_egg'], false);
        }}
      />
      {hasEgg ? (
        <div className="flex flex-wrap items-end gap-2">
          <IdField
            label="Creative tab"
            value={typeof egg.creative_tab === 'string' ? egg.creative_tab : ''}
            registry="creative_mode_tab"
            suggest={suggest}
            testId="entity-egg-tab"
            onCommit={(value) => setEgg('creative_tab', value === '' ? undefined : value)}
          />
          <SelectField
            label="Egg texture"
            value={typeof egg.texture === 'string' && egg.texture !== '' ? egg.texture : undefined}
            choices={textures}
            emptyLabel="(none)"
            testId="entity-egg-texture"
            onChange={(value) => setEgg('texture', value)}
          />
          <TextField
            label="Egg display name"
            value={egg.display_name}
            testId="entity-egg-display-name"
            onCommit={(value) => setEgg('display_name', value, typingKey('/spawn_egg/display_name'))}
          />
        </div>
      ) : (
        <p className="text-muted text-xs">The entity registers no spawn egg.</p>
      )}
      <p className="text-muted text-xs">
        The egg is the item {element.id}_spawn_egg, listed in the Spawn Eggs tab unless another tab
        is chosen. Without a texture it has no item model; without a name it is called
        "&lt;display name&gt; Spawn Egg".
      </p>
      {at(['spawn_egg'])}
      {['creative_tab', 'texture', 'display_name'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['spawn_egg', key])} />
      ))}
    </Section>
  );
  /** Sets one egg field; an absent `spawn_egg` becomes an object first. */
  function setEgg(key: string, value: Json | undefined, coalesce?: string) {
    if (data.spawn_egg === undefined) {
      if (value !== undefined) set(['spawn_egg'], { [key]: value } satisfies JsonObject);
      return;
    }
    set(['spawn_egg', key], value, coalesce);
  }

  const trigger = (component: string, label: string, testId: string) => (
    <EventSelect
      label={label}
      value={asObject(components[component]).event}
      events={events}
      testId={testId}
      onChange={(value) =>
        value === undefined
          ? set(['components', component], undefined)
          : set(['components', component, 'event'], value)
      }
    />
  );
  const triggers = (
    <>
      <div className="flex flex-wrap items-end gap-2" data-testid="entity-triggers">
        {trigger('msm:on_hurt', 'On hurt', 'entity-on-hurt')}
        {trigger('msm:on_death', 'On death', 'entity-on-death')}
        {trigger('msm:on_interact', 'On interact', 'entity-on-interact')}
      </div>
      {['msm:on_hurt', 'msm:on_death', 'msm:on_interact'].map((component) => (
        <ProblemsAt
          key={component}
          problems={problems}
          pointer={pointerOf(['components', component, 'event'])}
        />
      ))}
    </>
  );

  return (
    <section aria-label="Entity Studio" data-testid="entity-studio" className="flex flex-col gap-4">
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="entity-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      {at(['components'])}
      {hasErrorAt([...MODEL_PATH]) && at([...MODEL_PATH])}
      {identity}
      {appearance}
      {stats}
      {attackSection}
      {behaviour}
      {spawning}
      {eggSection}
      <EventsEditor
        element={element}
        problems={problems}
        suggest={suggest}
        onChange={onChange}
        animations={names}
        triggers={triggers}
      />
    </section>
  );
}
