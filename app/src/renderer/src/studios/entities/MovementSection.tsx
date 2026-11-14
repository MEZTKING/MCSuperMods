/**
 * The Entity Studio's "Movement" section (B297, ADR 0070 D3): the movement mode and the fields
 * that belong to it (flying speed and hovering for `fly`; air breathing and drying out for
 * `swim`) and the step height. Speed, follow range, knockback resistance, "Swims" and "Fire
 * immune" stay in the Stats section.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { typingKey } from '../../forms/context';
import { asObject, pointerOf } from '../blocks-items/blocks-items-model';
import { ProblemsAt } from '../blocks-items/parts';
import { NumberField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { ChoiceField, DefaultCheck } from './MobKindSection';
import { MOVEMENT_MODE_LABELS, MOVEMENT_MODES, type MobSectionProps, modeOf } from './mob-kinds';

const MOVEMENT = 'msm:movement';
const FIELDS = [
  'mode',
  'flying_speed',
  'hovers',
  'breathes_air',
  'dry_out_ticks',
  'step_height',
] as const;

/** The "Movement" section. */
export function MovementSection(props: MobSectionProps) {
  const movement = asObject(asObject(asObject(props.data).components)[MOVEMENT]);
  const mode = modeOf(props.data);
  /** Sets one movement field; removes the component when nothing is left. */
  const setMovement = (key: string, value: Json | undefined, typing = false) => {
    const next = { ...movement };
    if (value === undefined) delete next[key];
    else next[key] = value;
    if (Object.keys(next).length === 0) {
      props.set(['components', MOVEMENT], undefined);
      return;
    }
    if (value === undefined && !Object.hasOwn(movement, key)) return;
    props.set(
      ['components', MOVEMENT, key],
      value,
      typing ? typingKey(`/components/${MOVEMENT}/${key}`) : undefined,
    );
  };
  const breathesAir = movement.breathes_air === true;
  return (
    <Section title="Movement" testId="entity-movement">
      <div className="flex flex-wrap items-end gap-2">
        <ChoiceField
          label="Moves by"
          value={mode}
          choices={MOVEMENT_MODES}
          labels={MOVEMENT_MODE_LABELS}
          testId="entity-movement-mode"
          onChange={(value) => setMovement('mode', value === 'walk' ? undefined : value)}
        />
        {mode === 'fly' && (
          <NumberField
            label="Flying speed"
            value={movement.flying_speed}
            allowEmpty
            testId="entity-flying-speed"
            onCommit={(value) => setMovement('flying_speed', value, true)}
          />
        )}
        {mode === 'swim' && !breathesAir && (
          <NumberField
            label="Dries out after (ticks)"
            value={movement.dry_out_ticks}
            integer
            allowEmpty
            testId="entity-dry-out-ticks"
            onCommit={(value) => setMovement('dry_out_ticks', value, true)}
          />
        )}
        <NumberField
          label="Step height"
          value={movement.step_height}
          allowEmpty
          testId="entity-step-height"
          onCommit={(value) => setMovement('step_height', value, true)}
        />
      </div>
      {mode === 'fly' && (
        <DefaultCheck
          label="Hovers in place when idle"
          value={movement.hovers}
          fallback
          testId="entity-hovers"
          onChange={(value) => setMovement('hovers', value)}
        />
      )}
      {mode === 'swim' && (
        <DefaultCheck
          label="Breathes air (surfaces like a dolphin)"
          value={movement.breathes_air}
          fallback={false}
          testId="entity-breathes-air"
          onChange={(value) => setMovement('breathes_air', value)}
        />
      )}
      <p className="text-muted text-xs" data-testid="entity-movement-note">
        {mode === 'fly'
          ? 'Flying mobs take no fall damage and wander through the air. An empty flying speed uses 0.4, a parrot’s.'
          : mode === 'swim'
            ? 'Swimming mobs live in water and need a speed near 1. Without breathing air they flop on land and lose health after 300 ticks by default.'
            : mode === 'amphibious'
              ? 'Amphibious mobs walk on land and swim in water, breathing both.'
              : 'Walking mobs stay on the ground.'}{' '}
        An empty step height keeps 0.6 blocks.
      </p>
      {FIELDS.map((key) => (
        <ProblemsAt
          key={key}
          problems={props.problems}
          pointer={pointerOf(['components', MOVEMENT, key])}
        />
      ))}
    </Section>
  );
}
