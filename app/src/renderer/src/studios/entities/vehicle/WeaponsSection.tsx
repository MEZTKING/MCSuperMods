/**
 * The Vehicle Studio's "Weapons", "Turret" and "Parts" sections (B419, ADR 0091 D1, ADR 0090 D6,
 * D7, D10). Weapons: id, key, projectile (the target's projectile items and the project's
 * throwables), speed, spread, damage, cooldown, automatic, ammunition, muzzle (a bone of the model
 * and an offset), sound, recoil and the "on fire" event. Turret: its bone and barrel bone picked
 * from the model, the yaw and pitch limits, turn rate and aiming seat. Parts: the bones the
 * renderer turns, as lists of the model's bones, with "Find parts by name".
 *
 * @packageDocumentation
 */

import { Plus, X } from 'lucide-react';
import { Button, iconButtonClass } from '../../../components/ui/Button';
import { inputClass } from '../../../forms';
import { typingKey } from '../../../forms/context';
import { asObject, pointerOf } from '../../blocks-items/blocks-items-model';
import { CheckField, EventSelect, ProblemsAt } from '../../blocks-items/parts';
import { SelectField } from '../../structures/pickers';
import { Section } from '../../worldgen/parts';
import { ChoiceField } from '../MobKindSection';
import { projectileChoices } from '../mob-kinds';
import { BoneListPicker, BoneSelect } from './BonePicker';
import {
  IdAt,
  NumberAt,
  OffsetFields,
  ProblemsUnder,
  recordSetter,
  type VehicleSectionProps,
  valueAt,
} from './parts';
import {
  effectiveSeatOffsets,
  guessParts,
  newWeapon,
  PART_FIELDS,
  PART_LABELS,
  stringList,
  weaponsOf,
  withGuessedParts,
} from './vehicle-model';

/** A key name such as `key.keyboard.left.alt` in words: "Left Alt". */
export function keyWords(name: string | undefined): string | null {
  if (name === undefined || !name.startsWith('key.')) return null;
  const parts = name.split('.').slice(2);
  if (parts.length === 0) return null;
  return parts
    .map((part) =>
      part.length === 1 ? part.toUpperCase() : part[0]?.toUpperCase() + part.slice(1),
    )
    .join(' ');
}

/**
 * The words of the two runtime weapon keys (ADR 0088 D5), with their default keys from the
 * target (`TargetFacts.controls.runtimeKeys`) when it has them.
 */
export function weaponKeyLabels(
  runtimeKeys: { fire: string; second: string } | undefined,
): Record<string, string> {
  const fire = keyWords(runtimeKeys?.fire);
  const second = keyWords(runtimeKeys?.second);
  return {
    fire: `Vehicle: fire${fire === null ? '' : ` (${fire})`}`,
    second: `Vehicle: second weapon${second === null ? '' : ` (${second})`}`,
  };
}

const WEAPON_KEYS = [
  'id',
  'key',
  'projectile',
  'speed',
  'inaccuracy',
  'damage',
  'cooldown_ticks',
  'automatic',
  'ammo',
  'muzzle',
  'sound',
  'recoil',
  'on_fire',
] as const;

function WeaponRow(props: VehicleSectionProps & { index: number; count: number }) {
  const { data, set, index, problems, bones } = props;
  const weapon = asObject(weaponsOf(data)[index]);
  const path = ['weapons', index] as const;
  const name =
    typeof weapon.id === 'string' && weapon.id !== '' ? weapon.id : `weapon ${index + 1}`;
  const setWeapon = recordSetter(props, path);
  const ammoOn = weapon.ammo !== undefined;
  const muzzleOn = weapon.muzzle !== undefined;
  const projectile = typeof weapon.projectile === 'string' ? weapon.projectile : '';
  const arrow = projectile.endsWith('arrow');
  return (
    <li
      className="flex flex-col gap-2 rounded border border-border p-2"
      data-testid={`vehicle-weapon-${index}`}
    >
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-0.5 text-xs">
          <label className="text-muted" htmlFor={`weapon-${index}-id`}>
            Weapon id
          </label>
          <input
            id={`weapon-${index}-id`}
            className={`${inputClass} w-32 font-mono`}
            data-testid={`vehicle-weapon-${index}-id`}
            value={typeof weapon.id === 'string' ? weapon.id : ''}
            onChange={(event) =>
              set([...path, 'id'], event.target.value, typingKey(pointerOf([...path, 'id'])))
            }
          />
        </div>
        <ChoiceField
          label="Key"
          value={typeof weapon.key === 'string' ? weapon.key : 'fire'}
          choices={['fire', 'second']}
          labels={weaponKeyLabels(props.target.controls?.runtimeKeys)}
          testId={`vehicle-weapon-${index}-key`}
          onChange={(value) => setWeapon('key', value === 'fire' ? undefined : value)}
        />
        <SelectField
          label="Fires"
          value={projectile === '' ? undefined : projectile}
          choices={projectileChoices(props.project, props.target.entities?.projectileItems)}
          testId={`vehicle-weapon-${index}-projectile`}
          onChange={(value) => set([...path, 'projectile'], value ?? 'minecraft:arrow')}
        />
        <span className="flex-1" />
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Remove ${name}`}
          onClick={() => {
            const next = weaponsOf(data).filter((_, at) => at !== index);
            set(['weapons'], next.length === 0 ? undefined : next);
          }}
        >
          <X size={12} aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <NumberAt
          section={props}
          path={[...path, 'speed']}
          label="Speed (blocks a tick)"
          testId={`vehicle-weapon-${index}-speed`}
        />
        <NumberAt
          section={props}
          path={[...path, 'inaccuracy']}
          label="Spread"
          testId={`vehicle-weapon-${index}-inaccuracy`}
        />
        {arrow && (
          <NumberAt
            section={props}
            path={[...path, 'damage']}
            label="Arrow damage"
            testId={`vehicle-weapon-${index}-damage`}
          />
        )}
        <NumberAt
          section={props}
          path={[...path, 'cooldown_ticks']}
          label="Reload (ticks)"
          integer
          testId={`vehicle-weapon-${index}-cooldown`}
        />
        <NumberAt
          section={props}
          path={[...path, 'recoil']}
          label="Recoil (blocks a tick)"
          testId={`vehicle-weapon-${index}-recoil`}
        />
      </div>
      <CheckField
        label="Keeps firing while the key is held"
        checked={weapon.automatic === true}
        testId={`vehicle-weapon-${index}-automatic`}
        onChange={(checked) => setWeapon('automatic', checked ? true : undefined)}
      />
      <CheckField
        label="Needs ammunition"
        checked={ammoOn}
        testId={`vehicle-weapon-${index}-ammo`}
        onChange={(checked) =>
          setWeapon('ammo', checked ? { item: projectile || 'minecraft:arrow' } : undefined)
        }
      />
      {ammoOn && (
        <div className="flex flex-wrap items-end gap-2 pl-4">
          <IdAt
            section={props}
            path={[...path, 'ammo', 'item']}
            label="Ammunition item"
            registry="item"
            testId={`vehicle-weapon-${index}-ammo-item`}
            onCommit={(value) => set([...path, 'ammo', 'item'], value ?? '')}
          />
          <NumberAt
            section={props}
            path={[...path, 'ammo', 'per_shot']}
            label="Per shot"
            integer
            testId={`vehicle-weapon-${index}-ammo-per-shot`}
          />
          <NumberAt
            section={props}
            path={[...path, 'ammo', 'capacity']}
            label="Holds (64 if empty)"
            integer
            testId={`vehicle-weapon-${index}-ammo-capacity`}
          />
        </div>
      )}
      <CheckField
        label="Fires from a muzzle"
        checked={muzzleOn}
        testId={`vehicle-weapon-${index}-muzzle`}
        onChange={(checked) =>
          setWeapon('muzzle', checked ? asObject(newWeapon(data).muzzle) : undefined)
        }
      />
      {muzzleOn && (
        <div className="flex flex-wrap items-end gap-3 pl-4">
          <BoneSelect
            label="Muzzle bone (turns with it)"
            bones={bones}
            value={valueAt(data, [...path, 'muzzle', 'bone']) as string | undefined}
            emptyLabel="(the hull)"
            testId={`vehicle-weapon-${index}-muzzle-bone`}
            onChange={(bone) => set([...path, 'muzzle', 'bone'], bone)}
          />
          <OffsetFields
            section={props}
            path={[...path, 'muzzle', 'offset']}
            label="Muzzle"
            testId={`vehicle-weapon-${index}-muzzle-offset`}
          />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <IdAt
          section={props}
          path={[...path, 'sound']}
          label="Sound"
          registry="sound_event"
          testId={`vehicle-weapon-${index}-sound`}
        />
        <EventSelect
          label="On each shot, run event"
          value={weapon.on_fire}
          events={props.events}
          testId={`vehicle-weapon-${index}-on-fire`}
          onChange={(value) => setWeapon('on_fire', value)}
        />
      </div>
      <ProblemsUnder problems={problems} path={path} keys={WEAPON_KEYS} />
      <ProblemsUnder
        problems={problems}
        path={[...path, 'ammo']}
        keys={['item', 'per_shot', 'capacity']}
      />
      <ProblemsUnder problems={problems} path={[...path, 'muzzle']} keys={['bone']} />
    </li>
  );
}

/** The "Weapons" section. */
export function WeaponsSection(props: VehicleSectionProps) {
  const { data, set, problems } = props;
  const weapons = weaponsOf(data);
  return (
    <Section title="Weapons" testId="vehicle-weapons">
      <p className="text-muted text-xs">
        Fired with the “Vehicle: fire” and “Vehicle: second weapon” keys from a seat that has them.
        The server checks the reload and the ammunition.
      </p>
      {weapons.length === 0 && <p className="text-muted text-xs">No weapons.</p>}
      <ol className="flex flex-col gap-2">
        {weapons.map((_, index) => (
          <WeaponRow key={index} {...props} index={index} count={weapons.length} />
        ))}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid="vehicle-add-weapon"
        disabled={weapons.length >= 8}
        onClick={() => set(['weapons'], [...weapons, newWeapon(data)])}
      >
        <Plus size={12} aria-hidden />
        Add a weapon
      </Button>
      <ProblemsAt problems={problems} pointer="/weapons" />
    </Section>
  );
}

/** A `[min, max]` limit edited as two numbers; both empty removes it. */
function LimitFields(props: {
  section: VehicleSectionProps;
  path: readonly (string | number)[];
  label: string;
  testId: string;
  range: [number, number];
}) {
  const { section, path } = props;
  const raw = valueAt(section.data, path);
  const pair: [number | undefined, number | undefined] = Array.isArray(raw)
    ? [
        typeof raw[0] === 'number' ? raw[0] : undefined,
        typeof raw[1] === 'number' ? raw[1] : undefined,
      ]
    : [undefined, undefined];
  const commit = (at: 0 | 1, value: number | undefined) => {
    const next: [number | undefined, number | undefined] = [...pair];
    next[at] = value;
    if (next[0] === undefined && next[1] === undefined) {
      section.set(path, undefined);
      return;
    }
    section.set(
      path,
      [next[0] ?? props.range[0], next[1] ?? props.range[1]],
      typingKey(pointerOf(path)),
    );
  };
  return (
    <fieldset className="flex flex-col gap-1 text-xs">
      <legend className="text-muted">{props.label}</legend>
      <div className="flex gap-2">
        <NumberAt
          section={section}
          path={[...path, 0]}
          label="From"
          testId={`${props.testId}-min`}
          onCommit={(value) => commit(0, value)}
        />
        <NumberAt
          section={section}
          path={[...path, 1]}
          label="To"
          testId={`${props.testId}-max`}
          onCommit={(value) => commit(1, value)}
        />
      </div>
    </fieldset>
  );
}

/** The "Turret" section. */
export function TurretSection(props: VehicleSectionProps) {
  const { data, set, problems, bones } = props;
  const turret = asObject(asObject(data).turret);
  const on = asObject(data).turret !== undefined;
  const setTurret = recordSetter(props, ['turret']);
  const seats = effectiveSeatOffsets(data).length;
  return (
    <Section title="Turret" testId="vehicle-turret">
      <CheckField
        label="Has a turret that follows the gunner’s view"
        checked={on}
        testId="vehicle-turret-on"
        onChange={(checked) => {
          if (!checked) {
            set(['turret'], undefined);
            return;
          }
          const guessed = guessParts(bones ?? []);
          set(['turret'], {
            bone: guessed.turret ?? bones?.[0] ?? 'turret',
            ...(guessed.barrel === null ? {} : { pitch_bone: guessed.barrel }),
          });
        }}
      />
      {on && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <BoneSelect
              label="Turns left and right"
              bones={bones}
              value={typeof turret.bone === 'string' ? turret.bone : undefined}
              emptyLabel="(choose a bone)"
              testId="vehicle-turret-bone"
              onChange={(bone) => set(['turret', 'bone'], bone ?? '')}
            />
            <BoneSelect
              label="Turns up and down (barrel)"
              bones={bones}
              value={typeof turret.pitch_bone === 'string' ? turret.pitch_bone : undefined}
              testId="vehicle-turret-pitch-bone"
              onChange={(bone) => setTurret('pitch_bone', bone)}
            />
            <NumberAt
              section={props}
              path={['turret', 'turn_rate']}
              label="Turn rate (degrees a tick; 6 if empty)"
              testId="vehicle-turret-turn-rate"
            />
            <ChoiceField
              label="Aimed from"
              value={String(typeof turret.seat === 'number' ? turret.seat : 0)}
              choices={Array.from({ length: Math.max(seats, 1) }, (_, index) => String(index))}
              labels={Object.fromEntries(
                Array.from({ length: 8 }, (_, index) => [String(index), `Seat ${index + 1}`]),
              )}
              testId="vehicle-turret-seat"
              onChange={(value) => {
                const seat = Number(value ?? 0);
                setTurret('seat', seat === 0 ? undefined : seat);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <LimitFields
              section={props}
              path={['turret', 'yaw_limit']}
              label="Left and right limit (degrees; empty is all the way round)"
              testId="vehicle-turret-yaw-limit"
              range={[-180, 180]}
            />
            <LimitFields
              section={props}
              path={['turret', 'pitch_limit']}
              label="Up and down limit (degrees, negative is up)"
              testId="vehicle-turret-pitch-limit"
              range={[-90, 90]}
            />
          </div>
        </>
      )}
      <ProblemsUnder
        problems={problems}
        path={['turret']}
        keys={['bone', 'pitch_bone', 'yaw_limit', 'pitch_limit', 'turn_rate', 'seat']}
      />
    </Section>
  );
}

/** The "Parts" section. */
export function PartsSection(props: VehicleSectionProps) {
  const { data, set, problems, bones, replace } = props;
  const parts = asObject(asObject(data).parts);
  const setPart = (field: string, list: string[]) => {
    const next = { ...parts };
    if (list.length === 0) delete next[field];
    else next[field] = list;
    set(['parts'], Object.keys(next).length === 0 ? undefined : next);
  };
  return (
    <Section title="Parts" testId="vehicle-parts">
      <p className="text-muted text-xs">
        Bones of the model that the game turns while driving. The preview above shows them with
        Drive and Steer.
      </p>
      {PART_FIELDS.map((field) => (
        <BoneListPicker
          key={field}
          label={PART_LABELS[field]}
          bones={bones}
          value={stringList(parts[field])}
          testId={`vehicle-parts-${field}`}
          onChange={(list) => setPart(field, list)}
        />
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <NumberAt
          section={props}
          path={['parts', 'wheel_radius']}
          label="Wheel radius (blocks; 0.5 if empty)"
          testId="vehicle-wheel-radius"
        />
        <Button
          className="text-xs"
          data-testid="vehicle-find-parts"
          disabled={bones === null || bones.length === 0}
          title="Fills empty lists from bone names such as wheel, rotor, propeller, turret and barrel"
          onClick={() => replace(withGuessedParts(data, bones ?? []))}
        >
          Find parts by name
        </Button>
      </div>
      <ProblemsUnder problems={problems} path={['parts']} keys={[...PART_FIELDS, 'wheel_radius']} />
      {PART_FIELDS.flatMap((field) =>
        stringList(parts[field]).map((_, index) => (
          <ProblemsAt
            key={`${field}-${index}`}
            problems={problems}
            pointer={pointerOf(['parts', field, index])}
          />
        )),
      )}
    </Section>
  );
}
