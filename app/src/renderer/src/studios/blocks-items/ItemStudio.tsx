/**
 * Item Studio (B97) for `msm:item` element data (ADR 0025 D3, D5): model ("Go to model"),
 * display name, stack size (shown as 1 while `msm:durability` is set, as the runtime forces
 * it), rarity, creative tab, food, tool (type and tier), durability, `msm:on_use` with
 * cooldown, and the events editor shared with the Block Studio. Choices come from the schema;
 * everything else stays behind "Advanced (all fields)".
 */

import { useState } from 'react';
import { typingKey } from '../../forms/context';
import { projectHandlers } from '../scripting/script-model';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, Section } from '../worldgen/parts';
import { asObject, choicesAt, eventNames, pathSetter, pointerOf } from './blocks-items-model';
import { EventsEditor } from './EventsEditor';
import { CheckField, EventSelect, ModelField, ProblemsAt, TextField } from './parts';

/** New component values when a component is switched on (ADR 0025 D3 examples). */
const NEW_FOOD = { nutrition: 4, saturation: 0.3 };
const NEW_DURABILITY = { max: 250 };

export function ItemStudio(props: StudioProps) {
  const { project, element, node, problems, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const events = eventNames(element.data);
  const components = asObject(data.components);
  const choices = (path: readonly string[]) => choicesAt(node, element.data, path);
  const at = (path: readonly string[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );
  const hasErrorAt = (path: readonly string[]) => {
    const pointer = pointerOf(path);
    return problems.some((problem) => problem.path === pointer && problem.severity === 'error');
  };

  if (advanced) {
    return (
      <section aria-label="Item Studio" data-testid="item-studio" className="flex flex-col gap-3">
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="item-advanced-toggle" />
        {props.form}
      </section>
    );
  }

  const durable = components['msm:durability'] !== undefined;
  const general = (
    <Section title="Item" testId="item-general">
      <ModelField
        project={project}
        value={data.model}
        suggest={suggest}
        invalid={hasErrorAt(['model'])}
        onCommit={(value) => set(['model'], value)}
      />
      {at(['model'])}
      <TextField
        label="Display name"
        value={data.display_name}
        testId="item-display-name"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <div className="flex flex-wrap items-end gap-2">
        {durable ? (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted">Stack size</span>
            <output data-testid="item-stack-forced" aria-label="Stack size" className="text-sm">
              1
            </output>
          </div>
        ) : (
          <NumberField
            label="Stack size"
            value={data.max_stack_size}
            integer
            allowEmpty
            testId="item-stack"
            onCommit={(value) => set(['max_stack_size'], value, typingKey('/max_stack_size'))}
          />
        )}
        <SelectField
          label="Rarity"
          value={typeof data.rarity === 'string' ? data.rarity : undefined}
          choices={choices(['rarity'])}
          emptyLabel="(default: common)"
          testId="item-rarity"
          onChange={(value) => set(['rarity'], value)}
        />
        <IdField
          label="Creative tab"
          value={typeof data.creative_tab === 'string' ? data.creative_tab : ''}
          registry="creative_mode_tab"
          suggest={suggest}
          testId="item-tab"
          onCommit={(value) => set(['creative_tab'], value === '' ? undefined : value)}
        />
      </div>
      {durable && <p className="text-muted text-xs">Items with durability always stack to 1.</p>}
      {at(['max_stack_size'])}
      {at(['rarity'])}
      {at(['creative_tab'])}
    </Section>
  );

  const food = asObject(components['msm:food']);
  const hasFood = components['msm:food'] !== undefined;
  const foodPath = ['components', 'msm:food'];
  const foodSection = (
    <Section title="Food" testId="item-food">
      <CheckField
        label="Edible"
        checked={hasFood}
        testId="item-food-toggle"
        onChange={(checked) => set(foodPath, checked ? NEW_FOOD : undefined)}
      />
      {hasFood && (
        <div className="flex flex-wrap items-end gap-2">
          <NumberField
            label="Nutrition"
            value={food.nutrition}
            integer
            testId="item-food-nutrition"
            onCommit={(value) =>
              set([...foodPath, 'nutrition'], value, typingKey('/components/msm:food/nutrition'))
            }
          />
          <NumberField
            label="Saturation"
            value={food.saturation}
            testId="item-food-saturation"
            onCommit={(value) =>
              set([...foodPath, 'saturation'], value, typingKey('/components/msm:food/saturation'))
            }
          />
          <CheckField
            label="Can always eat"
            checked={food.can_always_eat === true}
            onChange={(checked) => set([...foodPath, 'can_always_eat'], checked ? true : undefined)}
          />
        </div>
      )}
      {['nutrition', 'saturation', 'can_always_eat'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf([...foodPath, key])} />
      ))}
    </Section>
  );

  const tool = asObject(components['msm:tool']);
  const hasTool = components['msm:tool'] !== undefined;
  const toolPath = ['components', 'msm:tool'];
  const toolTypes = choices([...toolPath, 'type']);
  const toolTiers = choices([...toolPath, 'tier']);
  const durability = asObject(components['msm:durability']);
  const toolSection = (
    <Section title="Tool and durability" testId="item-tool">
      <CheckField
        label="Tool"
        checked={hasTool}
        testId="item-tool-toggle"
        onChange={(checked) =>
          set(
            toolPath,
            checked
              ? {
                  type: toolTypes.includes('pickaxe') ? 'pickaxe' : (toolTypes[0] ?? ''),
                  tier: toolTiers.includes('iron') ? 'iron' : (toolTiers[0] ?? ''),
                }
              : undefined,
          )
        }
      />
      {hasTool && (
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            label="Tool type"
            value={typeof tool.type === 'string' ? tool.type : undefined}
            choices={toolTypes}
            testId="item-tool-type"
            onChange={(value) => {
              if (value !== undefined) set([...toolPath, 'type'], value);
            }}
          />
          <SelectField
            label="Tool tier"
            value={typeof tool.tier === 'string' ? tool.tier : undefined}
            choices={toolTiers}
            testId="item-tool-tier"
            onChange={(value) => {
              if (value !== undefined) set([...toolPath, 'tier'], value);
            }}
          />
        </div>
      )}
      {at([...toolPath, 'type'])}
      {at([...toolPath, 'tier'])}
      <CheckField
        label="Durability"
        checked={durable}
        testId="item-durability-toggle"
        onChange={(checked) =>
          set(['components', 'msm:durability'], checked ? NEW_DURABILITY : undefined)
        }
      />
      {durable && (
        <NumberField
          label="Uses"
          value={durability.max}
          integer
          testId="item-durability-max"
          onCommit={(value) =>
            set(
              ['components', 'msm:durability', 'max'],
              value,
              typingKey('/components/msm:durability/max'),
            )
          }
        />
      )}
      {at(['components', 'msm:durability', 'max'])}
    </Section>
  );

  const onUse = asObject(components['msm:on_use']);
  const behaviour = (
    <Section title="Behaviour" testId="item-behaviour">
      <div className="flex flex-wrap items-end gap-2">
        <EventSelect
          label="On use"
          value={onUse.event}
          events={events}
          testId="item-on-use"
          onChange={(value) =>
            value === undefined
              ? set(['components', 'msm:on_use'], undefined)
              : set(['components', 'msm:on_use', 'event'], value)
          }
        />
        {components['msm:on_use'] !== undefined && (
          <NumberField
            label="Use cooldown (ticks)"
            value={onUse.cooldown_ticks ?? 0}
            integer
            allowEmpty
            testId="item-on-use-cooldown"
            onCommit={(value) =>
              set(
                ['components', 'msm:on_use', 'cooldown_ticks'],
                value,
                typingKey('/components/msm:on_use/cooldown_ticks'),
              )
            }
          />
        )}
      </div>
      {at(['components', 'msm:on_use', 'event'])}
      {at(['components', 'msm:on_use', 'cooldown_ticks'])}
    </Section>
  );

  return (
    <section aria-label="Item Studio" data-testid="item-studio" className="flex flex-col gap-4">
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="item-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      {general}
      {foodSection}
      {toolSection}
      {behaviour}
      <EventsEditor
        element={element}
        problems={problems}
        suggest={suggest}
        onChange={onChange}
        handlers={projectHandlers(project)}
      />
    </section>
  );
}
