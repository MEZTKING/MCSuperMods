/**
 * The Block Studio's Inventory section (B318, ADR 0076 D1), loaded with `React.lazy` and shown
 * only for the types that take containers and machines: "Holds items" (None, Storage or
 * Machine; one undo step that removes the other component), the storage fields (layout, rows,
 * slots, keep contents, hoppers, comparators, sounds, events) and the machine fields (recipe
 * types, power, speed, default time, screen, hoppers, comparator, light while working, events)
 * with the element's "Recipes" table (seconds shown, ticks saved).
 *
 * The model is `inventory-model.ts`; the vanilla recipe types a machine may take come from the
 * target's block facts.
 *
 * @packageDocumentation
 */

import type { Element, Json } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { useId } from 'react';
import { buttonClass } from '../../components/ui/Button';
import { type FormProblem, inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { IdField, NumberField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { asObject, eventNames, pointerOf } from './blocks-items-model';
import {
  CONTAINER_LAYOUT_LABELS,
  CONTAINER_LAYOUTS,
  CONTAINER_PATH,
  type ContainerLayoutName,
  containerLayoutOf,
  DEFAULT_HOLDER_SIZE,
  DEFAULT_LIT_LIGHT,
  DEFAULT_MACHINE_TICKS,
  DEFAULT_ROWS,
  DEFAULT_SPEED,
  defaultMachineMenu,
  INVENTORY_KIND_LABELS,
  INVENTORY_KINDS,
  type InventoryKind,
  ingredientFromText,
  ingredientText,
  inventoryKindOf,
  MACHINE_COMPARATOR_LABELS,
  MACHINE_MENU_LABELS,
  MACHINE_PATH,
  MACHINE_POWER_LABELS,
  MAX_RECIPE_TYPES,
  type MachineMenuName,
  machineRecipeTypes,
  offersKeepContents,
  RECIPES_PATH,
  recipeEntries,
  recipeTypeLabel,
  resultCountOf,
  resultIdOf,
  secondsToTicks,
  ticksToSeconds,
  withChoice,
  withContainerLayout,
  withDefaultOn,
  withInventory,
  withRecipeAdded,
  withRecipeRemoved,
  withRecipeType,
  withResult,
  withRows,
} from './inventory-model';
import { CheckField, EventSelect, ProblemsAt } from './parts';

type Setter = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

/** Props of {@link InventorySection}. */
export interface InventorySectionProps {
  element: Element;
  target: Target;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  /** Sets one path as one edit (`coalesce` merges typing). */
  set: Setter;
  /** Replaces the whole element data as one edit. */
  replace(data: Json): void;
}

/** A select over labelled choices; a value outside them is kept as an option. */
function ChoiceField(props: {
  label: string;
  value: string | undefined;
  labels: Readonly<Record<string, string>>;
  order: readonly string[];
  testId: string;
  onChange(value: string): void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={props.testId}
        value={props.value ?? ''}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.value !== undefined && !props.order.includes(props.value) && (
          <option value={props.value}>{props.value}</option>
        )}
        {props.order.map((value) => (
          <option key={value} value={value}>
            {props.labels[value] ?? value}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A number field shown in seconds and saved in ticks; empty clears it. */
function SecondsField(props: {
  label: string;
  ticks: Json | undefined;
  testId: string;
  onCommit(ticks: number | undefined): void;
}) {
  return (
    <NumberField
      label={props.label}
      value={typeof props.ticks === 'number' ? ticksToSeconds(props.ticks) : undefined}
      allowEmpty
      testId={props.testId}
      onCommit={(seconds) =>
        props.onCommit(seconds === undefined || seconds <= 0 ? undefined : secondsToTicks(seconds))
      }
    />
  );
}

const str = (value: Json | undefined): string => (typeof value === 'string' ? value : '');

export function InventorySection(props: InventorySectionProps) {
  const { element, target, problems, suggest, set, replace } = props;
  const data = element.data;
  const kind = inventoryKindOf(data);
  const events = eventNames(data);
  const components = asObject(asObject(data).components);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );
  const holds = (
    <ChoiceField
      label="Holds items"
      value={kind}
      labels={INVENTORY_KIND_LABELS}
      order={INVENTORY_KINDS}
      testId="block-inventory-holds"
      onChange={(value) => replace(withInventory(data, value as InventoryKind))}
    />
  );

  if (kind === 'none') {
    return (
      <Section title="Inventory" testId="block-inventory">
        {holds}
        <p className="text-muted text-xs">
          Storage opens a vanilla chest, hopper or dispenser screen, or holds items with no screen.
          A machine works items over time in a furnace screen with its own recipes.
        </p>
      </Section>
    );
  }

  if (kind === 'storage') {
    const container = components['msm:container'];
    const fields = asObject(container);
    const layout = containerLayoutOf(container);
    const setContainer = (next: Json) => set(CONTAINER_PATH, next);
    const sounds = target.blocks?.containerSounds;
    return (
      <Section title="Inventory" testId="block-inventory">
        {holds}
        <div className="flex flex-wrap items-end gap-2">
          <ChoiceField
            label="Layout"
            value={layout}
            labels={CONTAINER_LAYOUT_LABELS}
            order={CONTAINER_LAYOUTS}
            testId="block-container-layout"
            onChange={(value) =>
              setContainer(withContainerLayout(container, value as ContainerLayoutName))
            }
          />
          {layout === 'chest' && (
            <NumberField
              label="Rows (1 to 6)"
              value={fields.rows ?? DEFAULT_ROWS}
              integer
              allowEmpty
              testId="block-container-rows"
              onCommit={(value) =>
                set(
                  CONTAINER_PATH,
                  withRows(container, value),
                  typingKey('/components/msm:container/rows'),
                )
              }
            />
          )}
          {layout === 'none' && (
            <NumberField
              label="Slots (1 to 9)"
              value={fields.size ?? DEFAULT_HOLDER_SIZE}
              integer
              allowEmpty
              testId="block-container-size"
              onCommit={(value) =>
                set([...CONTAINER_PATH, 'size'], value, typingKey('/components/msm:container/size'))
              }
            />
          )}
        </div>
        {layout === 'none' && (
          <p className="text-muted text-xs">
            Using the block with an item puts it in; with an empty hand takes the last item out.
          </p>
        )}
        {offersKeepContents(container) && (
          <CheckField
            label="Keep contents when broken"
            checked={fields.keep_contents === true}
            testId="block-container-keep-contents"
            onChange={(checked) =>
              set([...CONTAINER_PATH, 'keep_contents'], checked ? true : undefined)
            }
          />
        )}
        <CheckField
          label="Hoppers can use it"
          checked={fields.hoppers !== false}
          testId="block-container-hoppers"
          onChange={(checked) => setContainer(withDefaultOn(container, 'hoppers', checked))}
        />
        <CheckField
          label="Comparators read it"
          checked={fields.comparator !== false}
          testId="block-container-comparator"
          onChange={(checked) => setContainer(withDefaultOn(container, 'comparator', checked))}
        />
        <div className="flex flex-wrap items-end gap-2">
          <IdField
            label="Open sound"
            value={str(fields.open_sound)}
            registry="sound_event"
            suggest={suggest}
            testId="block-container-open-sound"
            onCommit={(text) =>
              set([...CONTAINER_PATH, 'open_sound'], text === '' ? undefined : text)
            }
          />
          <IdField
            label="Close sound"
            value={str(fields.close_sound)}
            registry="sound_event"
            suggest={suggest}
            testId="block-container-close-sound"
            onCommit={(text) =>
              set([...CONTAINER_PATH, 'close_sound'], text === '' ? undefined : text)
            }
          />
        </div>
        {sounds !== undefined && (
          <p className="text-muted text-xs">
            Empty sounds use {sounds.open} and {sounds.close}.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <EventSelect
            label="On open"
            value={fields.on_open}
            events={events}
            testId="block-container-on-open"
            onChange={(value) => set([...CONTAINER_PATH, 'on_open'], value)}
          />
          <EventSelect
            label="On close"
            value={fields.on_close}
            events={events}
            testId="block-container-on-close"
            onChange={(value) => set([...CONTAINER_PATH, 'on_close'], value)}
          />
        </div>
        {at(CONTAINER_PATH)}
        {Object.keys(fields).map((key) => (
          <ProblemsAt key={key} problems={problems} pointer={pointerOf([...CONTAINER_PATH, key])} />
        ))}
      </Section>
    );
  }

  const machine = components['msm:machine'];
  const fields = asObject(machine);
  const setMachine = (next: Json) => set(MACHINE_PATH, next);
  const types = machineRecipeTypes(machine, element.id);
  const offered = [element.id, ...(target.blocks?.machineRecipeTypes ?? [])];
  const listed = [...offered, ...types.filter((type) => !offered.includes(type))];
  const menuDefault = defaultMachineMenu(types);
  const usesOwn = types.includes(element.id);
  const recipes = recipeEntries(data);
  const typeLabel = (type: string) =>
    type === element.id ? 'Its own recipes' : recipeTypeLabel(type);
  return (
    <Section title="Inventory" testId="block-inventory">
      {holds}
      <fieldset className="flex flex-col gap-1 text-sm" data-testid="block-machine-recipe-types">
        <legend className="text-muted text-xs">Recipes it uses</legend>
        {listed.map((type) => {
          const on = types.includes(type);
          return (
            <CheckField
              key={type}
              label={typeLabel(type)}
              checked={on}
              testId={`block-machine-type-${type === element.id ? 'own' : type.slice(type.indexOf(':') + 1)}`}
              onChange={(checked) => {
                if (
                  (!checked && types.length <= 1) ||
                  (checked && types.length >= MAX_RECIPE_TYPES)
                )
                  return;
                setMachine(withRecipeType(machine, element.id, type, checked));
              }}
            />
          );
        })}
      </fieldset>
      <div className="flex flex-wrap items-end gap-2">
        <ChoiceField
          label="Power"
          value={str(fields.power) || 'fuel'}
          labels={MACHINE_POWER_LABELS}
          order={Object.keys(MACHINE_POWER_LABELS)}
          testId="block-machine-power"
          onChange={(value) => setMachine(withChoice(machine, 'power', value, 'fuel'))}
        />
        <NumberField
          label="Speed"
          value={fields.speed ?? DEFAULT_SPEED}
          allowEmpty
          testId="block-machine-speed"
          onCommit={(value) =>
            set([...MACHINE_PATH, 'speed'], value, typingKey('/components/msm:machine/speed'))
          }
        />
        <SecondsField
          label="Default time (seconds)"
          ticks={fields.default_time ?? DEFAULT_MACHINE_TICKS}
          testId="block-machine-default-time"
          onCommit={(ticks) =>
            set(
              [...MACHINE_PATH, 'default_time'],
              ticks,
              typingKey('/components/msm:machine/default_time'),
            )
          }
        />
        <ChoiceField
          label="Screen"
          value={str(fields.menu) || menuDefault}
          labels={MACHINE_MENU_LABELS}
          order={Object.keys(MACHINE_MENU_LABELS)}
          testId="block-machine-menu"
          onChange={(value) =>
            setMachine(withChoice(machine, 'menu', value as MachineMenuName, menuDefault))
          }
        />
        <ChoiceField
          label="Comparator"
          value={str(fields.comparator) || 'contents'}
          labels={MACHINE_COMPARATOR_LABELS}
          order={Object.keys(MACHINE_COMPARATOR_LABELS)}
          testId="block-machine-comparator"
          onChange={(value) => setMachine(withChoice(machine, 'comparator', value, 'contents'))}
        />
        <NumberField
          label="Light while working"
          value={fields.lit_light ?? DEFAULT_LIT_LIGHT}
          integer
          allowEmpty
          testId="block-machine-lit-light"
          onCommit={(value) =>
            set(
              [...MACHINE_PATH, 'lit_light'],
              value,
              typingKey('/components/msm:machine/lit_light'),
            )
          }
        />
      </div>
      <p className="text-muted text-xs">
        One input, one fuel and one output slot, as a furnace. Times are in seconds (20 ticks).
      </p>
      <CheckField
        label="Hoppers can use it"
        checked={fields.hoppers !== false}
        testId="block-machine-hoppers"
        onChange={(checked) => setMachine(withDefaultOn(machine, 'hoppers', checked))}
      />
      <div className="flex flex-wrap items-end gap-2">
        <EventSelect
          label="On start"
          value={fields.on_start}
          events={events}
          testId="block-machine-on-start"
          onChange={(value) => set([...MACHINE_PATH, 'on_start'], value)}
        />
        <EventSelect
          label="On finish"
          value={fields.on_finish}
          events={events}
          testId="block-machine-on-finish"
          onChange={(value) => set([...MACHINE_PATH, 'on_finish'], value)}
        />
      </div>
      {at(MACHINE_PATH)}
      {Object.keys(fields).map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf([...MACHINE_PATH, key])} />
      ))}
      <div className="flex flex-col gap-1" data-testid="block-machine-recipes">
        <h4 className="font-medium text-xs">Recipes</h4>
        {!usesOwn && recipes.length === 0 ? (
          <p className="text-muted text-xs">
            Tick "Its own recipes" to give the machine recipes of its own.
          </p>
        ) : recipes.length === 0 ? (
          <p className="text-muted text-xs" data-testid="block-machine-recipes-empty">
            No recipes yet: add one, or the machine has nothing to make.
          </p>
        ) : null}
        {recipes.map((entry, index) => {
          const base = [...RECIPES_PATH, index];
          const field = (key: string) => [...base, key];
          const id = `block-machine-recipe-${index}`;
          return (
            <div key={index} className="flex flex-col gap-1" data-testid={id}>
              <div className="flex flex-wrap items-end gap-1">
                <IdField
                  label={`Recipe ${index + 1} ingredient`}
                  value={ingredientText(entry.ingredient)}
                  registry="item"
                  suggest={suggest}
                  testId={`${id}-ingredient`}
                  onCommit={(text) => set(field('ingredient'), ingredientFromText(text))}
                />
                <NumberField
                  label={`Recipe ${index + 1} count`}
                  value={entry.count ?? 1}
                  integer
                  allowEmpty
                  testId={`${id}-count`}
                  onCommit={(value) =>
                    set(
                      field('count'),
                      value === 1 ? undefined : value,
                      typingKey(`/recipes/${index}/count`),
                    )
                  }
                />
                <IdField
                  label={`Recipe ${index + 1} result`}
                  value={resultIdOf(entry)}
                  registry="item"
                  suggest={suggest}
                  testId={`${id}-result`}
                  onCommit={(text) => set(field('result'), withResult(entry, { id: text }))}
                />
                <NumberField
                  label={`Recipe ${index + 1} result count`}
                  value={resultCountOf(entry)}
                  integer
                  allowEmpty
                  testId={`${id}-result-count`}
                  onCommit={(value) =>
                    set(
                      field('result'),
                      withResult(entry, { count: value }),
                      typingKey(`/recipes/${index}/result`),
                    )
                  }
                />
                <SecondsField
                  label={`Recipe ${index + 1} time (seconds)`}
                  ticks={entry.time}
                  testId={`${id}-time`}
                  onCommit={(ticks) =>
                    set(field('time'), ticks, typingKey(`/recipes/${index}/time`))
                  }
                />
                <NumberField
                  label={`Recipe ${index + 1} experience`}
                  value={entry.experience}
                  allowEmpty
                  testId={`${id}-experience`}
                  onCommit={(value) =>
                    set(field('experience'), value, typingKey(`/recipes/${index}/experience`))
                  }
                />
                <button
                  type="button"
                  className={buttonClass}
                  aria-label={`Remove recipe ${index + 1}`}
                  data-testid={`${id}-remove`}
                  onClick={() => set(RECIPES_PATH, withRecipeRemoved(data, index))}
                >
                  Remove
                </button>
              </div>
              {['ingredient', 'count', 'result', 'time', 'experience', 'name'].map((key) => (
                <ProblemsAt key={key} problems={problems} pointer={pointerOf(field(key))} />
              ))}
              <ProblemsAt problems={problems} pointer={pointerOf(base)} />
            </div>
          );
        })}
        <div>
          <button
            type="button"
            className={buttonClass}
            data-testid="block-machine-recipe-add"
            onClick={() => set(RECIPES_PATH, withRecipeAdded(data))}
          >
            Add recipe
          </button>
        </div>
        <p className="text-muted text-xs">
          An ingredient is an item, an item tag (#) or items separated by commas. Empty time uses
          the default time. Machine recipes need the Fabric mod jar: vanilla data packs leave them
          out.
        </p>
        <ProblemsAt problems={problems} pointer={pointerOf(RECIPES_PATH)} />
      </div>
    </Section>
  );
}

export default InventorySection;
