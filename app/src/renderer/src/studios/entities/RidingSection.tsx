/**
 * The Entity Studio's "Riding" section (B297, ADR 0071 D3): `msm:rideable` on or off, the
 * saddle and who may steer, ridden speed, jump strength, seats, the seat position, the saddle
 * bone (from the chosen geo model's bones) and the on-mount event.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { boneNames } from '../../preview/geo/json';
import { asObject, findElement } from '../blocks-items/blocks-items-model';
import { CheckField, EventSelect } from '../blocks-items/parts';
import { NumberField, SelectField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { GEO_MODEL_KIND } from './entities-model';
import {
  ChoiceField,
  componentTools,
  DefaultCheck,
  FieldProblems,
  numberAt,
} from './MobKindSection';
import { type MobSectionProps, newRideable, RIDE_CONTROL_LABELS, RIDE_CONTROLS } from './mob-kinds';

const RIDEABLE = 'msm:rideable';
const FIELDS = [
  'saddle',
  'controlled_by',
  'speed',
  'jump',
  'passengers',
  'rider_offset',
  'saddle_bone',
  'on_mount',
] as const;
const AXES = ['x', 'y', 'z'] as const;

/** The bones of the entity's geo model, or `[]`. */
export function modelBones(props: MobSectionProps): string[] {
  const model = asObject(asObject(asObject(props.data).components)['msm:animated_model']).model;
  if (typeof model !== 'string' || model === '') return [];
  const element = findElement(props.project, model, GEO_MODEL_KIND);
  return element === undefined ? [] : boneNames(element.data);
}

/** The "Riding" section. */
export function RidingSection(props: MobSectionProps) {
  const tools = componentTools(props, RIDEABLE);
  const { value } = tools;
  const bones = modelBones(props);
  const offset = Array.isArray(value.rider_offset) ? value.rider_offset : undefined;
  const tameable = asObject(asObject(props.data).components)['msm:tameable'] !== undefined;
  const needsSaddle = value.saddle !== false;
  return (
    <Section title="Riding" testId="entity-riding">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-rideable"
          checked={tools.on}
          onChange={(event) =>
            tools.toggle(event.target.checked, () =>
              newRideable(bones.includes('saddle') ? 'saddle' : undefined),
            )
          }
        />
        Can be ridden
      </label>
      {tools.on ? (
        <>
          <DefaultCheck
            label="Needs a saddle to steer"
            value={value.saddle}
            fallback
            testId="entity-riding-saddle"
            onChange={(next) => tools.setField('saddle', next)}
          />
          <div className="flex flex-wrap items-end gap-2">
            <ChoiceField
              label="Who can steer"
              value={typeof value.controlled_by === 'string' ? value.controlled_by : 'anyone'}
              choices={RIDE_CONTROLS}
              labels={RIDE_CONTROL_LABELS}
              testId="entity-riding-controlled-by"
              onChange={(next) =>
                tools.setField('controlled_by', next === 'anyone' ? undefined : next)
              }
            />
            <NumberField
              label="Ridden speed"
              value={numberAt(value, 'speed')}
              allowEmpty
              testId="entity-riding-speed"
              onCommit={(next) => tools.setField('speed', next, true)}
            />
            <NumberField
              label="Jump strength"
              value={numberAt(value, 'jump')}
              allowEmpty
              testId="entity-riding-jump"
              onCommit={(next) => tools.setField('jump', next, true)}
            />
            <NumberField
              label="Riders"
              value={numberAt(value, 'passengers')}
              integer
              allowEmpty
              testId="entity-riding-passengers"
              onCommit={(next) => tools.setField('passengers', next, true)}
            />
            {needsSaddle && (
              <SelectField
                label="Saddle bone"
                value={
                  typeof value.saddle_bone === 'string' && value.saddle_bone !== ''
                    ? value.saddle_bone
                    : undefined
                }
                choices={bones}
                emptyLabel="(none)"
                testId="entity-riding-saddle-bone"
                onChange={(next) => tools.setField('saddle_bone', next)}
              />
            )}
            <EventSelect
              label="On mount"
              value={value.on_mount}
              events={props.events}
              testId="entity-on-mount"
              onChange={(next) => tools.setField('on_mount', next)}
            />
          </div>
          <CheckField
            label="Set the seat position"
            checked={offset !== undefined}
            testId="entity-riding-offset-enabled"
            onChange={(checked) => tools.setField('rider_offset', checked ? [0, 1, 0] : undefined)}
          />
          {offset !== undefined && (
            <div className="flex flex-wrap items-end gap-2">
              {AXES.map((axis, index) => (
                <NumberField
                  key={axis}
                  label={`Seat ${axis}`}
                  value={offset[index] as Json | undefined}
                  testId={`entity-riding-offset-${axis}`}
                  onCommit={(next) => {
                    if (next === undefined) return;
                    const updated = [0, 1, 2].map((at) =>
                      at === index ? next : typeof offset[at] === 'number' ? offset[at] : 0,
                    );
                    tools.setField('rider_offset', updated, true);
                  }}
                />
              ))}
            </div>
          )}
          {value.controlled_by === 'owner' && !tameable && (
            <p className="text-muted text-xs" data-testid="entity-riding-needs-taming">
              Only its owner can steer, so the mob needs Taming.
            </p>
          )}
          <p className="text-muted text-xs">
            An empty hand mounts the mob and sneaking gets off. Empty fields use: ridden speed 1
            (times the mob’s speed), no jump, one rider, the seat on top of the hitbox. The saddle
            bone is shown only while the mob is saddled. The rider’s game moves a ridden mob.
          </p>
        </>
      ) : (
        <p className="text-muted text-xs">The mob cannot be ridden.</p>
      )}
      <FieldProblems problems={props.problems} component={RIDEABLE} keys={FIELDS} />
    </Section>
  );
}
