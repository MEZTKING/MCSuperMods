/**
 * Block Studio (B97) for `msm:block` element data (ADR 0025 D2, D5):
 *
 * - Appearance: model (suggestions, "Go to model") and display name.
 * - Shape (ADR 0059): `msm:shape` preset, custom boxes, "From model" (one undo step),
 *   walk-through and see-through toggles, the layer the model's textures give, and a live
 *   outline of the boxes.
 * - Mining: `msm:breakable` hardness, resistance, tool, minimum tier, requires tool.
 * - Light level (`msm:light_emitter`) and sound type.
 * - Drops: `loot` as drops itself, a loot table id, or none.
 * - Block item: on, or off as `"item": false`; stack size, rarity, creative tab, and "Fuel and
 *   compost" (ADR 0060 D4).
 * - Behaviour: the trigger components (`msm:on_interact`, `msm:on_step` with cooldown,
 *   `msm:redstone`) pick events from the element's own events, and the shared events editor
 *   with its "Triggers" section (ADR 0061 D2: on break, on place, on random tick, on entity
 *   inside).
 *
 * Choices (sound types, tools, tiers, rarities) come from the schema. Everything else stays
 * behind "Advanced (all fields)".
 */

import type { Json } from '@msm/core';
import { isSeeThroughBlock } from '@msm/plugin-blocks-items';
import { useEffect, useState } from 'react';
import { buttonClass } from '../../components/ui/Button';
import { typingKey } from '../../forms/context';
import { projectHandlers } from '../scripting/script-model';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, Section } from '../worldgen/parts';
import {
  asObject,
  choicesAt,
  choicesThrough,
  effectiveBoxes,
  eventNames,
  isFullCube,
  isWalkThrough,
  MAX_SHAPE_BOXES,
  type PixelBox,
  pathSetter,
  pointerOf,
  projectEffects,
  SHAPE_PATH,
  SHAPE_PRESET_LABELS,
  SHAPE_PRESETS,
  type ShapePreset,
  shapeFromModel,
  shapePreset,
  shapeWithBoxes,
  shapeWithPreset,
  writtenBoxes,
} from './blocks-items-model';
import { EventsEditor } from './EventsEditor';
import { useBlocksItemsStudioHost } from './host';
import { CheckField, EventSelect, ModelField, ProblemsAt, ShapePreview, TextField } from './parts';
import { FuelCompostFields, TriggersSection } from './triggers';

type TextureLayer = 'solid' | 'cutout' | 'translucent';

/** The words of ADR 0059 D4 for each texture layer. */
const LAYER_LABELS: Readonly<Record<TextureLayer, string>> = {
  solid: 'solid',
  cutout: 'cut-out',
  translucent: 'see-through',
};

/** The corner fields of a box, in `[x1, y1, z1, x2, y2, z2]` order. */
const BOX_FIELDS: readonly string[] = ['from x', 'from y', 'from z', 'to x', 'to y', 'to z'];

/**
 * The layer each project texture of `model` draws in, from the host; `null` while unknown or
 * without a host. Reloads when the model or asset bytes change.
 */
function useTextureLayers(
  model: string,
): readonly { texture: string; layer: TextureLayer }[] | null {
  const host = useBlocksItemsStudioHost();
  const [layers, setLayers] = useState<readonly { texture: string; layer: TextureLayer }[] | null>(
    null,
  );
  const read = host?.textureLayers;
  const revision = host?.revision;
  useEffect(() => {
    // `revision` changes when asset bytes may have changed.
    void revision;
    if (read === undefined || model === '') {
      setLayers(null);
      return;
    }
    let live = true;
    read(model).then(
      (found) => {
        if (live) setLayers(found);
      },
      () => {
        if (live) setLayers(null);
      },
    );
    return () => {
      live = false;
    };
  }, [read, model, revision]);
  return layers;
}

type Drops = 'self' | 'table' | 'none';

const DROPS_LABELS: Readonly<Record<Drops, string>> = {
  self: 'Drops itself',
  table: 'Loot table',
  none: 'None',
};

export function BlockStudio(props: StudioProps) {
  const { project, element, node, problems, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  // The block item object last unticked in this session, per element, so ticking "Has a block
  // item" again restores its stack size, rarity and creative tab.
  const [lastItem, setLastItem] = useState<{ id: string; item: Json } | null>(null);
  // Why "From model" found no shape, for the element it was asked for.
  const [fromModelError, setFromModelError] = useState<{ id: string; reason: string } | null>(null);
  const data = asObject(element.data);
  const layers = useTextureLayers(typeof data.model === 'string' ? data.model : '');
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

  const shape = components['msm:shape'];
  const hasShape = shape !== undefined;
  const preset = shapePreset(shape);
  const custom =
    hasShape && (preset === 'custom' || (preset === undefined && writtenBoxes(shape).length > 0));
  const boxes = custom ? writtenBoxes(shape) : effectiveBoxes(shape);
  const walkThrough = isWalkThrough(shape);
  const seeThrough = isSeeThroughBlock(element.data);
  const shapeObject = asObject(shape);
  /** Whether the block would be see-through without an explicit `see_through`. */
  const defaultSeeThrough = (() => {
    const { see_through: _seeThrough, ...rest } = shapeObject;
    return isSeeThroughBlock({ ...data, components: { ...components, 'msm:shape': rest } });
  })();
  const setBoxes = (next: PixelBox[]) => set([...SHAPE_PATH, 'boxes'], next);
  const fromModelReason =
    fromModelError !== null && fromModelError.id === element.id ? fromModelError.reason : null;
  const holes = layers?.filter((entry) => entry.layer !== 'solid') ?? [];
  const shapeSection = (
    <Section title="Shape" testId="block-shape">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <SelectField
              label="Shape"
              value={preset ?? (hasShape ? 'custom' : undefined)}
              choices={SHAPE_PRESETS}
              emptyLabel="(full solid cube)"
              testId="block-shape-preset"
              onChange={(value) =>
                value === undefined
                  ? set(SHAPE_PATH, undefined)
                  : set(SHAPE_PATH, shapeWithPreset(shape, value as ShapePreset))
              }
            />
            <button
              type="button"
              className={buttonClass}
              data-testid="block-shape-from-model"
              title="Read the boxes from the block's model (its elements, or a vanilla slab, carpet or cross parent)"
              onClick={() => {
                const found = shapeFromModel(
                  project,
                  typeof data.model === 'string' ? data.model : '',
                );
                if (!found.ok) {
                  setFromModelError({ id: element.id, reason: found.reason });
                  return;
                }
                setFromModelError(null);
                set(SHAPE_PATH, shapeWithBoxes(shape, found));
              }}
            >
              From model
            </button>
          </div>
          <p className="text-muted text-xs" data-testid="block-shape-preset-label">
            {preset !== undefined
              ? SHAPE_PRESET_LABELS[preset]
              : hasShape
                ? SHAPE_PRESET_LABELS.custom
                : 'Full solid cube (no shape set)'}
            . A half block here is a fixed shape, not a stackable vanilla slab.
          </p>
          {fromModelReason !== null && (
            <p
              role="status"
              className="text-warning text-xs"
              data-testid="block-shape-from-model-error"
            >
              {fromModelReason}
            </p>
          )}
          {custom && (
            <div className="flex flex-col gap-1" data-testid="block-shape-boxes">
              {boxes.map((box, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-end gap-1"
                  data-testid={`block-shape-box-${index}`}
                >
                  {BOX_FIELDS.map((field, axis) => (
                    <NumberField
                      key={field}
                      label={`Box ${index + 1} ${field}`}
                      value={box[axis]}
                      testId={`block-shape-box-${index}-${axis}`}
                      onCommit={(value) => {
                        if (value === undefined) return;
                        set(
                          [...SHAPE_PATH, 'boxes', index, axis],
                          value,
                          typingKey(`/components/msm:shape/boxes/${index}/${axis}`),
                        );
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`Remove box ${index + 1}`}
                    data-testid={`block-shape-box-${index}-remove`}
                    disabled={boxes.length <= 1}
                    onClick={() => setBoxes(boxes.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className={buttonClass}
                  data-testid="block-shape-add-box"
                  disabled={boxes.length >= MAX_SHAPE_BOXES}
                  onClick={() => setBoxes([...boxes, [0, 0, 0, 16, 16, 16]])}
                >
                  Add box
                </button>
              </div>
              <p className="text-muted text-xs">
                Boxes are in pixels from 0 to 16, as in a model: from x, y, z to x, y, z. At most{' '}
                {MAX_SHAPE_BOXES}.
              </p>
            </div>
          )}
          <CheckField
            label="Walk-through (no collision, like plants)"
            checked={walkThrough}
            testId="block-shape-walk-through"
            onChange={(checked) =>
              set(
                [...SHAPE_PATH, 'collision'],
                checked ? false : preset === 'cross' ? true : undefined,
              )
            }
          />
          <CheckField
            label="See-through (light passes, neighbours stay visible, like glass)"
            checked={seeThrough}
            testId="block-shape-see-through"
            onChange={(checked) =>
              set(
                [...SHAPE_PATH, 'see_through'],
                checked === defaultSeeThrough ? undefined : checked,
              )
            }
          />
          <div className="text-muted text-xs" data-testid="block-shape-layers">
            {layers === null ? (
              <p>
                Textures choose how they draw: no transparent pixels draw solid, fully transparent
                pixels cut-out, partly transparent pixels see-through.
              </p>
            ) : layers.length === 0 ? (
              <p>The model uses no project textures, so the layer cannot be shown here.</p>
            ) : (
              <ul aria-label="Texture layers">
                {layers.map((entry) => (
                  <li key={entry.texture} data-testid={`block-shape-layer-${entry.texture}`}>
                    {entry.texture}: {LAYER_LABELS[entry.layer]}
                  </li>
                ))}
              </ul>
            )}
            {holes.length > 0 && !seeThrough && (
              <p role="status" className="text-warning" data-testid="block-shape-layer-warning">
                Transparent pixels on a solid block show holes into the world: turn on
                "See-through".
              </p>
            )}
          </div>
        </div>
        <ShapePreview boxes={boxes} walkThrough={walkThrough} />
      </div>
      {at(SHAPE_PATH)}
      {['preset', 'boxes', 'collision', 'see_through'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf([...SHAPE_PATH, key])} />
      ))}
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
            set(
              [...breakablePath, 'hardness'],
              value,
              typingKey('/components/msm:breakable/hardness'),
            )
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
        Empty fields use the defaults: hardness 1.5, resistance 6. A tool or minimum tier also makes
        the right tool required.
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
      <div role="radiogroup" aria-label="Drops" className="flex flex-wrap gap-3 text-sm">
        {(['self', 'table', 'none'] as const).map((mode) => (
          <label key={mode} className="flex items-center gap-1">
            <input
              type="radio"
              name={`block-drops-${element.id}`}
              data-testid={`block-drops-${mode}`}
              checked={drops === mode}
              onChange={() => {
                if (mode === drops) return;
                if (mode === 'self') set(['loot'], 'self');
                else if (mode === 'table') set(['loot'], '');
                else set(['loot'], undefined);
              }}
            />
            {DROPS_LABELS[mode]}
          </label>
        ))}
      </div>
      <p className="text-muted text-xs">
        "None" generates no loot table, so the block drops nothing unless the game already has a
        loot table for its id.
      </p>
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
        onChange={(checked) => {
          if (checked) {
            const restored =
              lastItem !== null && lastItem.id === element.id ? lastItem.item : undefined;
            set(['item'], restored);
            return;
          }
          if (data.item !== undefined && data.item !== false) {
            setLastItem({ id: element.id, item: data.item });
          }
          set(['item'], false);
        }}
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
            // `item` is a union (BlockItem | false): follow it to the struct member.
            choices={choicesThrough(node, element.data, ['item', 'rarity'])}
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
      ) : null}
      {hasItem && (
        <FuelCompostFields
          base={['item']}
          data={element.data}
          node={node}
          problems={problems}
          set={set}
          testId="block-item"
        />
      )}
      {!hasItem && (
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
      {shapeSection}
      {mining}
      {looks}
      {dropsSection}
      {itemSection}
      {behaviour}
      <EventsEditor
        element={element}
        problems={problems}
        suggest={suggest}
        onChange={onChange}
        handlers={projectHandlers(project)}
        effects={projectEffects(project)}
        triggers={
          <TriggersSection
            kind={element.kind}
            data={element.data}
            node={node}
            events={events}
            problems={problems}
            set={set}
            notes={{
              'msm:on_entity_inside':
                isWalkThrough(shape) || !isFullCube(effectiveBoxes(shape)) ? undefined : (
                  <p
                    role="status"
                    className="text-warning text-xs"
                    data-testid="trigger-on-entity-inside-full"
                  >
                    Entities can only be inside a block that is not a full cube or is walk-through:
                    change the Shape, or this trigger never fires.
                  </p>
                ),
            }}
          />
        }
      />
    </section>
  );
}
