/**
 * The Entity Studio's "Ranged attack" section (B297, ADR 0070 D4): `msm:ranged_attack` on or
 * off, the projectile picker over the target's projectile items and the project's items with
 * `msm:throwable`, the shot numbers, the sound and the on-shoot event. A "Ranged attack" goal
 * does the shooting; the section offers to add one when the list has none.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { asObject } from '../blocks-items/blocks-items-model';
import { EventSelect } from '../blocks-items/parts';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { goalsOf, newGoal } from './entities-model';
import { componentTools, FieldProblems, numberAt } from './MobKindSection';
import { type MobSectionProps, newRangedAttack, projectileChoices } from './mob-kinds';

const RANGED = 'msm:ranged_attack';
const FIELDS = [
  'projectile',
  'damage',
  'speed',
  'inaccuracy',
  'interval_ticks',
  'charge_ticks',
  'range',
  'sound',
  'on_shoot',
] as const;

/** Props of {@link RangedSection}: the shared ones plus the target's projectile items. */
export interface RangedSectionProps extends MobSectionProps {
  projectileItems: readonly string[] | undefined;
}

/** The "Ranged attack" section. */
export function RangedSection(props: RangedSectionProps) {
  const tools = componentTools(props, RANGED);
  const { value } = tools;
  const goals = goalsOf(props.data);
  const hasGoal = goals.some((goal) => asObject(goal).type === 'ranged_attack');
  const number = (key: string, label: string, integer = false) => (
    <NumberField
      label={label}
      value={numberAt(value, key)}
      allowEmpty
      {...(integer ? { integer: true } : {})}
      testId={`entity-ranged-${key.replaceAll('_', '-')}`}
      onCommit={(next) => tools.setField(key, next, true)}
    />
  );
  const addGoal = () => {
    const goal = newGoal('ranged_attack');
    if (asObject(asObject(props.data).components)['msm:ai_goals'] === undefined) {
      props.set(['components', 'msm:ai_goals'], { goals: [goal] });
    } else {
      props.set(['components', 'msm:ai_goals', 'goals'], [...goals, goal] as Json[]);
    }
  };
  return (
    <Section title="Ranged attack" testId="entity-ranged">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-ranged-enabled"
          checked={tools.on}
          onChange={(event) => tools.toggle(event.target.checked, newRangedAttack)}
        />
        Shoots projectiles
      </label>
      {tools.on ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <SelectField
              label="Projectile"
              value={typeof value.projectile === 'string' ? value.projectile : undefined}
              choices={projectileChoices(props.project, props.projectileItems)}
              testId="entity-ranged-projectile"
              onChange={(next) => {
                if (next !== undefined) tools.setField('projectile', next);
              }}
            />
            {number('damage', 'Arrow damage')}
            {number('speed', 'Projectile speed')}
            {number('inaccuracy', 'Inaccuracy')}
            {number('interval_ticks', 'Ticks between shots', true)}
            {number('charge_ticks', 'Aiming ticks', true)}
            {number('range', 'Range')}
            <IdField
              label="Shoot sound"
              value={typeof value.sound === 'string' ? value.sound : ''}
              registry="sound_event"
              suggest={props.suggest}
              testId="entity-ranged-sound"
              onCommit={(next) => tools.setField('sound', next === '' ? undefined : next)}
            />
            <EventSelect
              label="On shoot"
              value={value.on_shoot}
              events={props.events}
              testId="entity-on-shoot"
              onChange={(next) => tools.setField('on_shoot', next)}
            />
          </div>
          <p className="text-muted text-xs">
            Projectiles are the vanilla projectile items of this target and your project’s items
            with Throwable. Empty fields use a skeleton’s numbers: arrow damage 2, speed 1.6,
            inaccuracy 6, 40 ticks between shots, 20 aiming ticks, range 15.
          </p>
          {!hasGoal && (
            <div className="flex flex-wrap items-center gap-2" data-testid="entity-ranged-no-goal">
              <p className="text-muted text-xs">
                The mob shoots only with a "Ranged attack" goal in Behaviour.
              </p>
              <Button className="text-xs" data-testid="entity-ranged-add-goal" onClick={addGoal}>
                <Plus size={12} aria-hidden />
                Add a ranged attack goal
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted text-xs">The mob does not shoot.</p>
      )}
      <FieldProblems problems={props.problems} component={RANGED} keys={FIELDS} />
    </Section>
  );
}
