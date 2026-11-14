/**
 * Sections shared by the Item, Block and Mob Studios for ADRs 0060 and 0061 (B239): the
 * "Triggers" section (the trigger components of ADR 0061 for the element's kind, each an event
 * picked from the element's events plus its interval, cooldown, chance or hand), shown inside
 * the shared events editor, and the "Fuel and compost" fields of an item or a block item
 * (ADR 0060 D4, editor-only `fuel` and `compost`).
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import type { ReactNode } from 'react';
import type { FormProblem } from '../../forms';
import { typingKey } from '../../forms/context';
import { NumberField, SelectField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import {
  asObject,
  COMPOST_CHANCES,
  choicesThrough,
  MIN_TRIGGER_INTERVAL,
  NEW_FUEL,
  pointerOf,
  TRIGGERS,
  type TriggerSpec,
  triggerTestId,
} from './blocks-items-model';
import { CheckField, EventSelect, ProblemsAt } from './parts';

type Setter = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

export interface TriggersSectionProps {
  /** The element kind, which picks the triggers ({@link TRIGGERS}). */
  kind: string;
  /** The element data. */
  data: Json;
  /** The element's schema node, for `choice` fields. */
  node: SchemaNode | undefined;
  events: readonly string[];
  problems: readonly FormProblem[];
  set: Setter;
  /** Notes shown under a trigger while it is set, by component id (for example a missing armour). */
  notes?: Readonly<Record<string, ReactNode>>;
}

function TriggerRow(props: TriggersSectionProps & { spec: TriggerSpec }) {
  const { spec, data, node, events, problems, set } = props;
  const components = asObject(asObject(data).components);
  const on = components[spec.component] !== undefined;
  const value = asObject(components[spec.component]);
  const base = ['components', spec.component];
  const stem = triggerTestId(spec.component);
  return (
    <li className="flex flex-col gap-1" data-testid={`${stem}-row`}>
      <div className="flex flex-wrap items-end gap-2">
        <EventSelect
          label={spec.label}
          value={value.event}
          events={events}
          testId={stem}
          onChange={(next) =>
            next === undefined ? set(base, undefined) : set([...base, 'event'], next)
          }
        />
        {on &&
          spec.fields.map((field) => {
            const testId = `${stem}-${field.testId}`;
            const label = `${spec.label}: ${field.label.charAt(0).toLowerCase()}${field.label.slice(1)}`;
            if (field.type === 'choice') {
              const schemaChoices = choicesThrough(node, data, [...base, field.key]);
              return (
                <SelectField
                  key={field.key}
                  label={label}
                  value={
                    typeof value[field.key] === 'string' ? (value[field.key] as string) : undefined
                  }
                  choices={schemaChoices.length > 0 ? schemaChoices : (field.choices ?? [])}
                  emptyLabel={`(default: ${field.defaultValue})`}
                  testId={testId}
                  onChange={(next) => set([...base, field.key], next)}
                />
              );
            }
            return (
              <NumberField
                key={field.key}
                label={label}
                value={value[field.key] ?? field.defaultValue}
                integer={field.type === 'int'}
                allowEmpty
                testId={testId}
                onCommit={(next) =>
                  set([...base, field.key], next, typingKey(pointerOf([...base, field.key])))
                }
              />
            );
          })}
      </div>
      <p className="text-muted text-xs">{spec.help}</p>
      {on && props.notes?.[spec.component]}
      <ProblemsAt problems={problems} pointer={pointerOf(base)} />
      <ProblemsAt problems={problems} pointer={pointerOf([...base, 'event'])} />
      {spec.fields.map((field) => (
        <ProblemsAt key={field.key} problems={problems} pointer={pointerOf([...base, field.key])} />
      ))}
    </li>
  );
}

/**
 * The "Triggers" section: each trigger of ADR 0061 for the kind, set by picking an event and
 * removed by picking none. Every pick or field edit is one undo step (typing coalesces).
 */
export function TriggersSection(props: TriggersSectionProps) {
  const specs = TRIGGERS[props.kind] ?? [];
  if (specs.length === 0) return null;
  const repeats = specs.some((spec) => spec.fields.some((field) => field.key === 'interval_ticks'));
  return (
    <Section title="Triggers" testId="msm-triggers">
      <ul className="flex flex-col gap-2">
        {specs.map((spec) => (
          <TriggerRow key={spec.component} {...props} spec={spec} />
        ))}
      </ul>
      {repeats && (
        <p className="text-muted text-xs">
          Repeating triggers run at most every {MIN_TRIGGER_INTERVAL} ticks; 20 ticks is one second.
          An empty field uses the default.
        </p>
      )}
    </Section>
  );
}

export interface FuelCompostFieldsProps {
  /** Where `fuel` and `compost` sit: `[]` for an item, `['item']` for a block item. */
  base: readonly string[];
  /** The element data. */
  data: Json;
  /** The element's schema node, for the compost choices. */
  node: SchemaNode | undefined;
  problems: readonly FormProblem[];
  set: Setter;
  /** The `data-testid` stem: `item` or `block-item`. */
  testId: string;
}

/**
 * "Fuel and compost": burns in a furnace (seconds) and the compost chance, written as the
 * editor-only `fuel` and `compost` fields that lower to vanilla components (ADR 0060 D4).
 */
export function FuelCompostFields(props: FuelCompostFieldsProps) {
  const { base, data, node, problems, set, testId } = props;
  let owner: Json | undefined = data;
  for (const key of base) owner = asObject(owner)[key];
  const fields = asObject(owner);
  const fuel = asObject(fields.fuel);
  const hasFuel = fields.fuel !== undefined;
  const schemaChances = choicesThrough(node, data, [...base, 'compost']);
  const chances = schemaChances.length > 0 ? schemaChances : COMPOST_CHANCES;
  return (
    <Section title="Fuel and compost" testId={`${testId}-fuel-compost`}>
      <div className="flex flex-wrap items-end gap-2">
        <CheckField
          label="Burns in a furnace"
          checked={hasFuel}
          testId={`${testId}-fuel-toggle`}
          onChange={(checked) => set([...base, 'fuel'], checked ? { ...NEW_FUEL } : undefined)}
        />
        {hasFuel && (
          <NumberField
            label="Burn time (seconds)"
            value={fuel.burn_seconds}
            testId={`${testId}-fuel-seconds`}
            onCommit={(value) =>
              set(
                [...base, 'fuel', 'burn_seconds'],
                value,
                typingKey(pointerOf([...base, 'fuel', 'burn_seconds'])),
              )
            }
          />
        )}
        <SelectField
          label="Compost chance"
          value={typeof fields.compost === 'string' ? fields.compost : undefined}
          choices={chances}
          emptyLabel="(not compostable)"
          testId={`${testId}-compost`}
          onChange={(value) => set([...base, 'compost'], value)}
        />
      </div>
      <p className="text-muted text-xs">
        Coal burns for 80 seconds and smelts eight items. The compost chance is how likely one item
        raises the composter's level.
      </p>
      <ProblemsAt problems={problems} pointer={pointerOf([...base, 'fuel'])} />
      <ProblemsAt problems={problems} pointer={pointerOf([...base, 'fuel', 'burn_seconds'])} />
      <ProblemsAt problems={problems} pointer={pointerOf([...base, 'compost'])} />
    </Section>
  );
}
