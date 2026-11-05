/**
 * Block Studio (B97) for `msm:block` element data (ADR 0025 D2, D5):
 *
 * - Appearance: model (suggestions, "Go to model") and display name.
 * - Mining: `msm:breakable` hardness, resistance, tool, minimum tier, requires tool.
 * - Light level (`msm:light_emitter`) and sound type.
 * - Drops: `loot` as drops itself, a loot table id, or none.
 * - Block item: on, or off as `"item": false`; stack size, rarity, creative tab.
 * - Behaviour: the trigger components (`msm:on_interact`, `msm:on_step` with cooldown,
 *   `msm:redstone`) pick events from the element's own events, and the shared events editor.
 *
 * Choices (sound types, tools, tiers, rarities) come from the schema. Everything else stays
 * behind "Advanced (all fields)".
 */

import { useState } from 'react';
import { typingKey } from '../../forms/context';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, Section } from '../worldgen/parts';
import { asObject, choicesAt, eventNames, pathSetter, pointerOf } from './blocks-items-model';
import { EventsEditor } from './EventsEditor';
import { CheckField, EventSelect, ModelField, ProblemsAt, TextField } from './parts';

type Drops = 'self' | 'table' | 'none';

const DROPS_LABELS: Readonly<Record<Drops, string>> = {
  self: 'Drops itself',
  table: 'Loot table',
  none: 'None',
};

export function BlockStudio(props: StudioProps) {
  const { project, element, node, problems, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const events = eventNames(element.data);
  const components = asObject(data.components);
  const breakable = asObject(components['msm:breakable']);
  const choices = (path: readonly string[]) => choicesAt(node, element.data, path);
  const hasErrorAt = (path: readonly string[]) => {
    const pointer = pointerOf(path);
    return problems.some((problem) => problem.path === pointer && problem.severity === 'error');
  };
  const at = (path: readonly string[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  if (advanced) {
    return (
      <section aria-label="Block Studio" data-testid="block-studio" className="flex flex-col gap-3">
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="block-advanced-toggle" />
        {props.form}
      </section>
    );
  }

  const appearance = (
    <Section title="Appearance" testId="block-appearance">
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
        testId="block-display-name"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
    </Section>
  );

  const breakablePath = ['components', 'msm:breakable'];
  const mining = (
    <Section title="Mining" testId="block-mining">
      <div className="flex flex-wrap gap-2">
        <NumberField
          label="Hardness"
          value={breakable.hardness}
          allowEmpty
          testId="block-hardness"
          onCommit={(value) =>
            set([...breakablePath, 'hardness'], value, typingKey('/components/msm:breakable/hardness'))
          }
        />
        <NumberField
          label="Resistance"
          value={breakable.resistance}
          allowEmpty
          testId="block-resistance"
          onCommit={(value) =>
            set(
              [...breakablePath, 'resistance'],
              value,
              typingKey('/components/msm:breakable/resistance'),
            )
          }
        />
        <SelectField
          label="Tool"
          value={typeof breakable.tool === 'string' ? breakable.tool : undefined}
          choices={choices([...breakablePath, 'tool'])}
          emptyLabel="(any)"
          testId="block-tool"
          onChange={(value) => set([...breakablePath, 'tool'], value)}
        />
        <SelectField
          label="Minimum tier"
          value={typeof breakable.min_tier === 'string' ? breakable.min_tier : undefined}
          choices={choices([...breakablePath, 'min_tier'])}
          emptyLabel="(none)"
          testId="block-min-tier"
          onChange={(value) => set([...breakablePath, 'min_tier'], value)}
        />
      </div>
      <CheckField
        label="Requires the right tool for drops"
        checked={breakable.requires_tool === true}
        testId="block-requires-tool"
        onChange={(checked) => set([...breakablePath, 'requires_tool'], checked ? true : undefined)}
      />
      <p className="text-muted text-xs">
        Empty fields use the defaults: hardness 1.5, resistance 6. A tool or minimum tier also
        makes the right tool required.
      </p>
      {['hardness', 'resistance', 'tool', 'min_tier', 'requires_tool'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf([...breakablePath, key])} />
      ))}
    </Section>
  );

  const light = asObject(components['msm:light_emitter']);
  const soundChoices = choices(['sound_type']);
  const looks = (
    <Section title="Light and sound" testId="block-light-sound">
      <div className="flex flex-wrap gap-2">
        <NumberField
          label="Light level"
          value={light.level}
          integer
          allowEmpty
          testId="block-light"
          onCommit={(value) =>
            value === undefined
              ? set(['components', 'msm:light_emitter'], undefined)
              : set(
                  ['components', 'msm:light_emitter', 'level'],
                  value,
                  typingKey('/components/msm:light_emitter/level'),
                )
          }
        />
        <SelectField
          label="Sound type"
          value={typeof data.sound_type === 'string' ? data.sound_type : undefined}
          choices={soundChoices}
          emptyLabel="(default: stone)"
          testId="block-sound-type"
          onChange={(value) => set(['sound_type'], value)}
        />
      </div>
      {at(['components', 'msm:light_emitter', 'level'])}
      {at(['sound_type'])}
    </Section>
  );

  const drops: Drops =
    data.loot === 'self' ? 'self' : typeof data.loot === 'string' ? 'table' : 'none';
  const dropsSection = (
    <Section title="Drops" testId="block-drops">
      <SelectField
        label="Drops"
        value={drops}
        choices={['self', 'table', 'none']}
        testId="block-drops-mode"
        onChange={(value) => {
          if (value === drops) return;
          if (value === 'self') set(['loot'], 'self');
          else if (value === 'table') set(['loot'], '');
          else set(['loot'], undefined);
        }}
      />
      <p className="text-muted text-xs">{DROPS_LABELS[drops]}</p>
      {drops === 'table' && (
        <IdField
          label="Loot table"
          value={typeof data.loot === 'string' ? data.loot : ''}
          registry="loot_table"
          suggest={suggest}
          testId="block-loot-table"
          invalid={hasErrorAt(['loot'])}
          onCommit={(value) => set(['loot'], value)}
        />
      )}
      {drops === 'self' && data.item === false && (
        <p role="status" className="text-warning text-xs">
          The block has no item, so "Drops itself" generates no loot table.
        </p>
      )}
      {at(['loot'])}
    </Section>
  );

  const hasItem = data.item !== false;
  const item = asObject(data.item);
  const itemSection = (
    <Section title="Block item" testId="block-item">
      <CheckField
        label="Has a block item"
        checked={hasItem}
        testId="block-has-item"
        onChange={(checked) => set(['item'], checked ? undefined : false)}
      />
      {hasItem ? (
        <div className="flex flex-wrap gap-2">
          <NumberField
            label="Stack size"
            value={item.max_stack_size}
            integer
            allowEmpty
            testId="block-item-stack"
            onCommit={(value) =>
              set(['item', 'max_stack_size'], value, typingKey('/item/max_stack_size'))
            }
          />
          <SelectField
            label="Rarity"
            value={typeof item.rarity === 'string' ? item.rarity : undefined}
            choices={choices(['item', 'rarity'])}
            emptyLabel="(default: common)"
            testId="block-item-rarity"
            onChange={(value) => set(['item', 'rarity'], value)}
          />
          <IdField
            label="Creative tab"
            value={typeof item.creative_tab === 'string' ? item.creative_tab : ''}
            registry="creative_mode_tab"
            suggest={suggest}
            testId="block-item-tab"
            onCommit={(value) => set(['item', 'creative_tab'], value === '' ? undefined : value)}
          />
        </div>
      ) : (
        <p className="text-muted text-xs">
          The block registers no item, so it cannot be held or placed by players.
        </p>
      )}
      {at(['item'])}
      {['max_stack_size', 'rarity', 'creative_tab'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['item', key])} />
      ))}
    </Section>
  );

  const interact = asObject(components['msm:on_interact']);
  const step = asObject(components['msm:on_step']);
  const redstone = asObject(components['msm:redstone']);
  /** Sets one redstone field; removes the component when nothing is left. */
  const setRedstone = (key: string, value: number | string | undefined) => {
    const next = { ...redstone };
    if (value === undefined) delete next[key];
    else next[key] = value;
    if (Object.keys(next).length === 0) set(['components', 'msm:redstone'], undefined);
    else if (value === undefined) set(['components', 'msm:redstone', key], undefined);
    else
      set(
        ['components', 'msm:redstone', key],
        value,
        typeof value === 'number' ? typingKey(`/components/msm:redstone/${key}`) : undefined,
      );
  };
  const behaviour = (
    <Section title="Behaviour" testId="block-behaviour">
      <div className="flex flex-wrap items-end gap-2">
        <EventSelect
          label="On interact"
          value={interact.event}
          events={events}
          testId="block-on-interact"
          onChange={(value) =>
            value === undefined
              ? set(['components', 'msm:on_interact'], undefined)
              : set(['components', 'msm:on_interact', 'event'], value)
          }
        />
      </div>
      {at(['components', 'msm:on_interact', 'event'])}
      <div className="flex flex-wrap items-end gap-2">
        <EventSelect
          label="On step"
          value={step.event}
          events={events}
          testId="block-on-step"
          onChange={(value) =>
            value === undefined
              ? set(['components', 'msm:on_step'], undefined)
              : set(['components', 'msm:on_step', 'event'], value)
          }
        />
        {components['msm:on_step'] !== undefined && (
          <NumberField
            label="Step cooldown (ticks)"
            value={step.cooldown_ticks ?? 0}
            integer
            allowEmpty
            testId="block-on-step-cooldown"
            onCommit={(value) =>
              set(
                ['components', 'msm:on_step', 'cooldown_ticks'],
                value,
                typingKey('/components/msm:on_step/cooldown_ticks'),
              )
            }
          />
        )}
      </div>
      {at(['components', 'msm:on_step', 'event'])}
      {at(['components', 'msm:on_step', 'cooldown_ticks'])}
      <div className="flex flex-wrap items-end gap-2">
        <NumberField
          label="Redstone signal emitted"
          value={redstone.emit}
          integer
          allowEmpty
          testId="block-redstone-emit"
          onCommit={(value) => setRedstone('emit', value)}
        />
        <EventSelect
          label="On powered"
          value={redstone.on_powered}
          events={events}
          testId="block-on-powered"
          onChange={(value) => setRedstone('on_powered', value)}
        />
        <EventSelect
          label="On unpowered"
          value={redstone.on_unpowered}
          events={events}
          testId="block-on-unpowered"
          onChange={(value) => setRedstone('on_unpowered', value)}
        />
      </div>
      {['emit', 'on_powered', 'on_unpowered'].map((key) => (
        <ProblemsAt
          key={key}
          problems={problems}
          pointer={pointerOf(['components', 'msm:redstone', key])}
        />
      ))}
    </Section>
  );

  return (
    <section aria-label="Block Studio" data-testid="block-studio" className="flex flex-col gap-4">
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="block-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      {appearance}
      {mining}
      {looks}
      {dropsSection}
      {itemSection}
      {behaviour}
      <EventsEditor element={element} problems={problems} suggest={suggest} onChange={onChange} />
    </section>
  );
}
