/**
 * The Vehicle Studio's "Movement" section (B419, ADR 0091 D1, ADR 0090 D3): the mode picker with a
 * picture per mode, the top speed shown in blocks a second beside blocks a tick, and the fields
 * that belong to the mode (turning in place and grip on the ground, lift and take-off in the air,
 * floating for ground vehicles), plus ramming damage.
 *
 * @packageDocumentation
 */

import { asObject } from '../../blocks-items/blocks-items-model';
import { CheckField } from '../../blocks-items/parts';
import { Section } from '../../worldgen/parts';
import { NumberAt, ProblemsUnder, recordSetter, type VehicleSectionProps } from './parts';
import {
  DEFAULT_MAX_SPEED,
  DEFAULT_TURN_RATE,
  FALLBACK_SPEED_CAP,
  maxSpeedOf,
  modeOf,
  speedWords,
  VEHICLE_MODE_LABELS,
  VEHICLE_MODE_NOTES,
  VEHICLE_MODES,
} from './vehicle-model';

/** The lines of each mode's small picture (32 by 24). */
function modeLines(mode: string) {
  switch (mode) {
    case 'water':
      return (
        <>
          <path d="M4 12h24l-4 6H8z" />
          <path d="M2 20q4-3 7 0t7 0 7 0 7 0" />
        </>
      );
    case 'amphibious':
      return (
        <>
          <path d="M5 10h22v6H5z" />
          <path d="M2 20q4-3 7 0t7 0" />
          <path d="M18 20h12" />
        </>
      );
    case 'air':
      return (
        <>
          <path d="M4 12h22l3 2-3 2H4z" />
          <path d="M12 12l-3-8h4l4 8M12 16l-3 6h4l4-6" />
        </>
      );
    case 'hover':
      return (
        <>
          <path d="M9 10h14v8H9z" />
          <path d="M4 6h24M16 6v4M23 14h7" />
        </>
      );
    default:
      return (
        <>
          <path d="M4 15V10l5-4h12l5 4h2v5z" />
          <circle cx="9" cy="17" r="3" />
          <circle cx="23" cy="17" r="3" />
        </>
      );
  }
}

/** A small picture of each mode. */
function ModePicture({ mode }: { mode: string }) {
  return (
    <svg
      width={32}
      height={24}
      viewBox="0 0 32 24"
      className="fill-none stroke-current"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      {modeLines(mode)}
    </svg>
  );
}

/** The mode picker: one picture card per mode. */
export function ModePicker(props: {
  modes: readonly string[];
  value: string;
  onChange(mode: string): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How it moves"
      className="flex flex-wrap gap-2"
      data-testid="vehicle-mode"
    >
      {props.modes.map((mode) => {
        const chosen = props.value === mode;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a card with a picture, not a bare radio
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={chosen}
            title={VEHICLE_MODE_NOTES[mode]}
            data-testid={`vehicle-mode-${mode}`}
            className={`flex w-24 flex-col items-center gap-1 rounded border p-1 text-xs ${chosen ? 'border-accent bg-accent/10' : 'border-border'}`}
            onClick={() => props.onChange(mode)}
          >
            <ModePicture mode={mode} />
            {VEHICLE_MODE_LABELS[mode] ?? mode}
          </button>
        );
      })}
    </div>
  );
}

const MOVEMENT_KEYS = [
  'mode',
  'max_speed',
  'reverse_factor',
  'acceleration',
  'braking',
  'turn_rate',
  'turns_in_place',
  'step_height',
  'grip',
  'lift_speed',
  'takeoff_speed',
  'floats',
] as const;

/** The "Movement" section. */
export function MovementSection(props: VehicleSectionProps) {
  const { data, set, problems, target } = props;
  const movement = asObject(asObject(data).movement);
  const mode = modeOf(data);
  const setMovement = recordSetter(props, ['movement']);
  const modes = target.vehicles?.modes ?? VEHICLE_MODES;
  const cap = target.vehicles?.maxSpeed ?? FALLBACK_SPEED_CAP;
  const groundLike = mode === 'ground' || mode === 'amphibious';
  const ram = asObject(asObject(data).ram_damage);
  const ramOn = asObject(data).ram_damage !== undefined;
  return (
    <Section title="Movement" testId="vehicle-movement">
      <ModePicker modes={modes} value={mode} onChange={(next) => set(['movement', 'mode'], next)} />
      <p className="text-muted text-xs" data-testid="vehicle-mode-note">
        {VEHICLE_MODE_NOTES[mode] ?? ''}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <NumberAt
          section={props}
          path={['movement', 'max_speed']}
          label="Top speed (blocks a tick)"
          testId="vehicle-max-speed"
        />
        <span className="pb-1 text-muted text-xs" data-testid="vehicle-speed-words">
          {speedWords(maxSpeedOf(data))}
          {movement.max_speed === undefined
            ? ` (the default for this mode, ${DEFAULT_MAX_SPEED[mode] ?? 0.4})`
            : ''}
          ; at most {cap}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <NumberAt
          section={props}
          path={['movement', 'acceleration']}
          label="Acceleration"
          testId="vehicle-acceleration"
        />
        <NumberAt
          section={props}
          path={['movement', 'braking']}
          label="Braking"
          testId="vehicle-braking"
        />
        <NumberAt
          section={props}
          path={['movement', 'reverse_factor']}
          label="Reverse (share of top speed)"
          testId="vehicle-reverse-factor"
        />
        <NumberAt
          section={props}
          path={['movement', 'turn_rate']}
          label={`Turn rate (degrees a tick; ${DEFAULT_TURN_RATE[mode] ?? 5} if empty)`}
          testId="vehicle-turn-rate"
        />
      </div>
      {groundLike && (
        <div className="flex flex-wrap items-end gap-2">
          <NumberAt
            section={props}
            path={['movement', 'step_height']}
            label="Step height (blocks)"
            testId="vehicle-step-height"
          />
          <NumberAt
            section={props}
            path={['movement', 'grip']}
            label="Grip (1 holds the line)"
            testId="vehicle-grip"
          />
        </div>
      )}
      {(mode === 'air' || mode === 'hover') && (
        <div className="flex flex-wrap items-end gap-2">
          <NumberAt
            section={props}
            path={['movement', 'lift_speed']}
            label="Climb speed (blocks a tick)"
            testId="vehicle-lift-speed"
          />
          {mode === 'air' && (
            <NumberAt
              section={props}
              path={['movement', 'takeoff_speed']}
              label="Take-off speed (blocks a tick)"
              testId="vehicle-takeoff-speed"
            />
          )}
        </div>
      )}
      {groundLike && (
        <CheckField
          label="Turns on the spot, like a tank"
          checked={movement.turns_in_place === true}
          testId="vehicle-turns-in-place"
          onChange={(checked) => setMovement('turns_in_place', checked ? true : undefined)}
        />
      )}
      {mode === 'ground' && (
        <CheckField
          label="Floats on water instead of sinking"
          checked={movement.floats === true}
          testId="vehicle-floats"
          onChange={(checked) => setMovement('floats', checked ? true : undefined)}
        />
      )}
      <CheckField
        label="Hurts what it runs into"
        checked={ramOn}
        testId="vehicle-ram"
        onChange={(checked) => set(['ram_damage'], checked ? { damage: 4 } : undefined)}
      />
      {ramOn && (
        <div className="flex flex-wrap items-end gap-2 pl-4">
          <NumberAt
            section={props}
            path={['ram_damage', 'damage']}
            label="Damage (half hearts)"
            testId="vehicle-ram-damage"
          />
          <NumberAt
            section={props}
            path={['ram_damage', 'min_speed']}
            label="From speed (blocks a tick)"
            testId="vehicle-ram-min-speed"
          />
          <span className="pb-1 text-muted text-xs">
            {typeof ram.min_speed === 'number' ? '' : 'From 0.2 blocks a tick if empty.'}
          </span>
        </div>
      )}
      <ProblemsUnder problems={problems} path={['movement']} keys={MOVEMENT_KEYS} />
      <ProblemsUnder problems={problems} path={['ram_damage']} keys={['damage', 'min_speed']} />
    </Section>
  );
}
