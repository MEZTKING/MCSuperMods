/**
 * The Vehicle Studio's smaller sections (B419, ADR 0091 D1, ADR 0090 D2, D5, D8 to D11): "Name and
 * size", "Engine and fuel", "Health and repair", "Storage", "Item", "Camera", "Exhaust" and the
 * event triggers shown above the shared events editor.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { Plus, X } from 'lucide-react';
import { Button, iconButtonClass } from '../../../components/ui/Button';
import { typingKey } from '../../../forms/context';
import { asObject, pointerOf } from '../../blocks-items/blocks-items-model';
import { CheckField, EventSelect, ProblemsAt, TextField } from '../../blocks-items/parts';
import { NumberField } from '../../structures/pickers';
import { IdList, Section } from '../../worldgen/parts';
import { ChoiceField } from '../MobKindSection';
import {
  IdAt,
  NumberAt,
  OffsetFields,
  ProblemsUnder,
  recordSetter,
  type VehicleSectionProps,
} from './parts';
import { DEFAULT_SIZE, modeOf, sizeOf } from './vehicle-model';
import { keyWords } from './WeaponsSection';

/** The "Name and size" section: names, hitbox, picking up and the dashboard. */
export function IdentitySection(props: VehicleSectionProps) {
  const { data, set, problems } = props;
  const object = asObject(data);
  const [width, height] = sizeOf(data);
  const setSize = (index: 0 | 1, value: number | undefined) => {
    if (value === undefined) return;
    const next: [number, number] = [width, height];
    next[index] = value;
    set(['size'], next, typingKey('/size'));
  };
  return (
    <Section title="Name and size" testId="vehicle-identity">
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label="Name"
          value={object.display_name}
          testId="vehicle-display-name"
          onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
        />
        <TextField
          label="Item name (the name if empty)"
          value={object.item_display_name}
          testId="vehicle-item-display-name"
          onCommit={(value) => set(['item_display_name'], value, typingKey('/item_display_name'))}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <NumberField
          label="Width (blocks)"
          value={width}
          testId="vehicle-width"
          onCommit={(value) => setSize(0, value)}
        />
        <NumberField
          label="Height (blocks)"
          value={height}
          testId="vehicle-height"
          onCommit={(value) => setSize(1, value)}
        />
        {object.size === undefined ? (
          <span className="pb-1 text-muted text-xs">
            A boat’s size, {DEFAULT_SIZE[0]} by {DEFAULT_SIZE[1]}.
          </span>
        ) : (
          <Button className="text-xs" onClick={() => set(['size'], undefined)}>
            Boat size
          </Button>
        )}
      </div>
      <CheckField
        label="A sneaking player hitting it gets it back as an item"
        checked={object.pick_up !== false}
        testId="vehicle-pick-up"
        onChange={(checked) => set(['pick_up'], checked ? undefined : false)}
      />
      <CheckField
        label="Shows the dashboard (health, fuel, ammunition) to the riders"
        checked={object.hud !== false}
        testId="vehicle-hud"
        onChange={(checked) => set(['hud'], checked ? undefined : false)}
      />
      {(['display_name', 'item_display_name', 'size', 'pick_up', 'hud', 'name'] as const).map(
        (key) => (
          <ProblemsAt key={key} problems={problems} pointer={pointerOf([key])} />
        ),
      )}
    </Section>
  );
}

/** The "Engine and fuel" section. */
export function EngineSection(props: VehicleSectionProps) {
  const { data, set, problems, target } = props;
  const engine = asObject(asObject(data).engine);
  const fuel = asObject(engine.fuel);
  const fuelOn = engine.fuel !== undefined;
  const items = Array.isArray(fuel.items) ? fuel.items : [];
  const setEngine = recordSetter(props, ['engine']);
  const horn = keyWords(target.controls?.runtimeKeys.horn);
  return (
    <Section title="Engine and fuel" testId="vehicle-engine">
      <div className="flex flex-wrap items-end gap-2">
        <IdAt
          section={props}
          path={['engine', 'sound']}
          label="Engine sound (loops)"
          registry="sound_event"
          testId="vehicle-engine-sound"
          onCommit={(value) => setEngine('sound', value)}
        />
        <IdAt
          section={props}
          path={['engine', 'start_sound']}
          label="Start sound"
          registry="sound_event"
          testId="vehicle-start-sound"
          onCommit={(value) => setEngine('start_sound', value)}
        />
        <IdAt
          section={props}
          path={['engine', 'horn']}
          label={`Horn${horn === null ? '' : ` (the ${horn} key)`}`}
          registry="sound_event"
          testId="vehicle-horn"
          onCommit={(value) => setEngine('horn', value)}
        />
      </div>
      <CheckField
        label="Needs fuel"
        checked={fuelOn}
        testId="vehicle-needs-fuel"
        onChange={(checked) =>
          setEngine(
            'fuel',
            checked ? { items: [{ item: 'minecraft:coal', ticks: 1200 }] } : undefined,
          )
        }
      />
      {fuelOn && (
        <div className="flex flex-col gap-2 pl-4" data-testid="vehicle-fuel">
          {items.map((entry, index) => {
            const path = ['engine', 'fuel', 'items', index] as const;
            const ticks = asObject(entry).ticks;
            return (
              <div
                key={index}
                className="flex flex-wrap items-end gap-2"
                data-testid={`vehicle-fuel-${index}`}
              >
                <IdAt
                  section={props}
                  path={[...path, 'item']}
                  label="Fuel item"
                  registry="item"
                  testId={`vehicle-fuel-${index}-item`}
                  onCommit={(value) => set([...path, 'item'], value ?? '')}
                />
                <NumberAt
                  section={props}
                  path={[...path, 'ticks']}
                  label="Ticks of driving"
                  integer
                  testId={`vehicle-fuel-${index}-ticks`}
                />
                <span className="pb-1 text-muted text-xs">
                  {typeof ticks === 'number' ? `${Math.round(ticks / 20)} seconds` : ''}
                </span>
                <button
                  type="button"
                  className={iconButtonClass}
                  aria-label={`Remove fuel ${index + 1}`}
                  disabled={items.length === 1}
                  onClick={() =>
                    set(
                      ['engine', 'fuel', 'items'],
                      items.filter((_, at) => at !== index),
                    )
                  }
                >
                  <X size={12} aria-hidden />
                </button>
                <ProblemsUnder problems={problems} path={path} keys={['item', 'ticks']} />
              </div>
            );
          })}
          <div className="flex flex-wrap items-end gap-2">
            <Button
              className="text-xs"
              data-testid="vehicle-add-fuel"
              onClick={() =>
                set(
                  ['engine', 'fuel', 'items'],
                  [...items, { item: 'minecraft:charcoal', ticks: 1200 }],
                )
              }
            >
              <Plus size={12} aria-hidden />
              Add a fuel
            </Button>
            <NumberAt
              section={props}
              path={['engine', 'fuel', 'capacity']}
              label="Tank holds (ticks; ten of the biggest if empty)"
              integer
              testId="vehicle-fuel-capacity"
            />
          </div>
        </div>
      )}
      <ProblemsUnder
        problems={problems}
        path={['engine']}
        keys={['fuel', 'sound', 'start_sound', 'horn']}
      />
      <ProblemsUnder problems={problems} path={['engine', 'fuel']} keys={['items', 'capacity']} />
    </Section>
  );
}

/** The "Health and repair" section. */
export function HealthSection(props: VehicleSectionProps) {
  const { data, set, problems, suggest } = props;
  const health = asObject(asObject(data).health);
  const repair = Array.isArray(health.repair) ? health.repair : [];
  const setHealth = recordSetter(props, ['health']);
  const immune = Array.isArray(health.immune_to)
    ? health.immune_to.filter((id): id is string => typeof id === 'string')
    : [];
  const explodes = health.explodes !== undefined;
  return (
    <Section title="Health and repair" testId="vehicle-health">
      <div className="flex flex-wrap items-end gap-2">
        <NumberAt
          section={props}
          path={['health', 'max']}
          label="Damage it takes (40 if empty)"
          testId="vehicle-health-max"
        />
      </div>
      <CheckField
        label="Explodes when destroyed"
        checked={explodes}
        testId="vehicle-explodes"
        onChange={(checked) => setHealth('explodes', checked ? 2 : undefined)}
      />
      {explodes && (
        <div className="pl-4">
          <NumberAt
            section={props}
            path={['health', 'explodes']}
            label="Explosion power (TNT is 4)"
            testId="vehicle-explosion-power"
          />
        </div>
      )}
      <fieldset className="flex flex-col gap-1 text-xs" data-testid="vehicle-repair">
        <legend className="text-muted">Repaired with</legend>
        {repair.length === 0 && <p className="text-muted">Nothing: damage stays.</p>}
        {repair.map((_, index) => {
          const path = ['health', 'repair', index] as const;
          return (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <IdAt
                section={props}
                path={[...path, 'item']}
                label="Item"
                registry="item"
                testId={`vehicle-repair-${index}-item`}
                onCommit={(value) => set([...path, 'item'], value ?? '')}
              />
              <NumberAt
                section={props}
                path={[...path, 'amount']}
                label="Repairs"
                testId={`vehicle-repair-${index}-amount`}
              />
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Remove repair item ${index + 1}`}
                onClick={() => {
                  const next = repair.filter((_, at) => at !== index);
                  setHealth('repair', next.length === 0 ? undefined : next);
                }}
              >
                <X size={12} aria-hidden />
              </button>
              <ProblemsUnder problems={problems} path={path} keys={['item', 'amount']} />
            </div>
          );
        })}
        <Button
          className="self-start text-xs"
          data-testid="vehicle-add-repair"
          onClick={() =>
            set(['health', 'repair'], [...repair, { item: 'minecraft:iron_ingot', amount: 10 }])
          }
        >
          <Plus size={12} aria-hidden />
          Add a repair item
        </Button>
      </fieldset>
      <div className="flex flex-col gap-0.5 text-xs">
        <span className="text-muted">Not hurt by (damage types or # tags)</span>
        <IdList
          label="Not hurt by"
          ids={immune}
          registry="damage_type"
          suggest={suggest}
          pointer="/health/immune_to"
          problems={problems}
          onChange={(next) => setHealth('immune_to', next.length === 0 ? undefined : next)}
        />
      </div>
      <ProblemsUnder
        problems={problems}
        path={['health']}
        keys={['max', 'repair', 'explodes', 'immune_to']}
      />
    </Section>
  );
}

/** The "Storage" section. */
export function StorageSection(props: VehicleSectionProps) {
  const { data, set, problems } = props;
  const storage = asObject(asObject(data).storage);
  const on = asObject(data).storage !== undefined;
  const rows = typeof storage.rows === 'number' ? storage.rows : 1;
  return (
    <Section title="Storage" testId="vehicle-storage">
      <CheckField
        label="Has storage (a chest you open from a seat, or by sneaking and using it)"
        checked={on}
        testId="vehicle-storage-on"
        onChange={(checked) => set(['storage'], checked ? { rows: 1 } : undefined)}
      />
      {on && (
        <div className="pl-4">
          <ChoiceField
            label="Rows of nine slots"
            value={String(rows)}
            choices={['1', '2', '3', '4', '5', '6']}
            labels={{ 1: '1 row', 2: '2 rows', 3: '3 rows', 4: '4 rows', 5: '5 rows', 6: '6 rows' }}
            testId="vehicle-storage-rows"
            onChange={(value) => set(['storage', 'rows'], Number(value ?? 1))}
          />
        </div>
      )}
      <ProblemsUnder problems={problems} path={['storage']} keys={['rows']} />
    </Section>
  );
}

/** The words of `item.places_on`. */
export const PLACES_ON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ground: 'On a block',
  water: 'On water',
  any: 'On either',
});

/** The default `places_on` of a mode (ADR 0090 D5). */
export function defaultPlacesOn(mode: string): string {
  return mode === 'water' ? 'water' : mode === 'amphibious' ? 'any' : 'ground';
}

/** The "Item" section. */
export function ItemSection(props: VehicleSectionProps) {
  const { data, problems } = props;
  const item = asObject(asObject(data).item);
  const setItem = recordSetter(props, ['item']);
  const fallback = defaultPlacesOn(modeOf(data));
  return (
    <Section title="Item" testId="vehicle-item">
      <p className="text-muted text-xs">
        The item that places the vehicle has the vehicle’s own id.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <IdAt
          section={props}
          path={['item', 'texture']}
          label="Item picture"
          registry="texture"
          testId="vehicle-item-texture"
          onCommit={(value) => setItem('texture', value)}
        />
        <IdAt
          section={props}
          path={['item', 'model']}
          label="Item model (instead of the picture)"
          registry="model"
          testId="vehicle-item-model"
          onCommit={(value) => setItem('model', value)}
        />
        <ChoiceField
          label="Placed"
          value={typeof item.places_on === 'string' ? item.places_on : fallback}
          choices={['ground', 'water', 'any']}
          labels={PLACES_ON_LABELS}
          testId="vehicle-places-on"
          onChange={(value) => setItem('places_on', value === fallback ? undefined : value)}
        />
      </div>
      <ProblemsUnder
        problems={problems}
        path={['item']}
        keys={['texture', 'model', 'places_on', 'name']}
      />
    </Section>
  );
}

/** The "Camera" section. */
export function CameraSection(props: VehicleSectionProps) {
  const { problems } = props;
  return (
    <Section title="Camera" testId="vehicle-camera">
      <div className="flex flex-wrap items-end gap-2">
        <NumberAt
          section={props}
          path={['camera', 'distance']}
          label="Third-person distance (blocks)"
          testId="vehicle-camera-distance"
          onCommit={(value) =>
            props.set(
              ['camera'],
              value === undefined ? undefined : { distance: value },
              typingKey('/camera'),
            )
          }
        />
        <span className="pb-1 text-muted text-xs">Empty keeps the player’s own distance.</span>
      </div>
      <ProblemsUnder problems={problems} path={['camera']} keys={['distance']} />
    </Section>
  );
}

/** The "Exhaust" section. */
export function ExhaustSection(props: VehicleSectionProps) {
  const { data, set, problems } = props;
  const on = asObject(data).exhaust !== undefined;
  const [, height] = sizeOf(data);
  return (
    <Section title="Exhaust" testId="vehicle-exhaust">
      <CheckField
        label="Puffs particles while the engine runs"
        checked={on}
        testId="vehicle-exhaust-on"
        onChange={(checked) =>
          set(
            ['exhaust'],
            checked
              ? { particle: 'minecraft:smoke', offset: [0, Math.round(height * 50) / 100, -1] }
              : undefined,
          )
        }
      />
      {on && (
        <div className="flex flex-wrap items-end gap-3 pl-4">
          <IdAt
            section={props}
            path={['exhaust', 'particle']}
            label="Particle"
            registry="particle_type"
            testId="vehicle-exhaust-particle"
            onCommit={(value) => set(['exhaust', 'particle'], value ?? '')}
          />
          <NumberAt
            section={props}
            path={['exhaust', 'every_ticks']}
            label="Every (ticks; 2 if empty)"
            integer
            testId="vehicle-exhaust-every"
          />
          <OffsetFields
            section={props}
            path={['exhaust', 'offset']}
            label="Where"
            testId="vehicle-exhaust-offset"
          />
        </div>
      )}
      <ProblemsUnder problems={problems} path={['exhaust']} keys={['particle', 'every_ticks']} />
    </Section>
  );
}

/** The vehicle's triggers (ADR 0090 D11), shown at the top of the events editor. */
export function VehicleTriggers(props: VehicleSectionProps) {
  const { data, set, problems, events } = props;
  const object = asObject(data);
  const onTick = asObject(object.on_tick);
  const select = (key: string, label: string) => (
    <EventSelect
      key={key}
      label={label}
      value={object[key]}
      events={events}
      testId={`vehicle-${key.replaceAll('_', '-')}`}
      onChange={(value) => set([key], value)}
    />
  );
  return (
    <div className="flex flex-col gap-2" data-testid="vehicle-triggers">
      <div className="flex flex-wrap items-end gap-2">
        {select('on_place', 'When placed')}
        {select('on_mount', 'When someone gets in')}
        {select('on_dismount', 'When someone gets out')}
        {select('on_destroy', 'When destroyed')}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <EventSelect
          label="While driven, every so often"
          value={onTick.event}
          events={events}
          testId="vehicle-on-tick"
          onChange={(value) =>
            set(
              ['on_tick'],
              value === undefined ? undefined : ({ ...onTick, event: value } as Json),
            )
          }
        />
        {object.on_tick !== undefined && (
          <NumberAt
            section={props}
            path={['on_tick', 'interval']}
            label="Every (ticks; 20 if empty)"
            integer
            testId="vehicle-on-tick-interval"
          />
        )}
      </div>
      {(['on_place', 'on_mount', 'on_dismount', 'on_destroy'] as const).map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf([key])} />
      ))}
      <ProblemsUnder problems={problems} path={['on_tick']} keys={['event', 'interval']} />
    </div>
  );
}
