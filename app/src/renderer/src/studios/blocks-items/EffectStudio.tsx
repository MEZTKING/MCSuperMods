/**
 * Effect Studio (B205) for `msm:effect` element data (ADR 0055 D2, D6):
 *
 * - Effect: display name, category, colour, optional particle and sound.
 * - Icon: the 18 by 18 texture `assets/<ns>/textures/mob_effect/<path>.png` (a fixed path, not
 *   a field): a thumbnail, a warning when it is missing, and "Paint icon".
 * - Stat changes: the attribute modifiers, scaled by the level as vanilla does.
 * - Behaviour: "When it starts" (`msm:on_start`), "While active" (`msm:on_tick` with its
 *   interval and "Stronger levels act faster") and "When it ends" (`msm:on_end`), each picking
 *   or creating an event of the shared events editor.
 * - A live preview: the icon with the name in its category's colour and a per-level summary.
 *
 * Choices come from the schema; everything else stays behind "Advanced (all fields)".
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { Paintbrush, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pngDataUrl } from '../../components/AssetList';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { projectHandlers } from '../scripting/script-model';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { ColourField } from '../worldgen/ColourField';
import { AdvancedToggle, Section } from '../worldgen/parts';
import {
  asObject,
  choicesAt,
  eventNames,
  pathSetter,
  pointerOf,
  projectEffects,
  suggestEventId,
} from './blocks-items-model';
import { EventsEditor } from './EventsEditor';
import {
  ATTRIBUTE_OPERATIONS,
  categoryColour,
  EFFECT_CATEGORIES,
  EFFECT_ICON_SIZE,
  effectDisplayName,
  effectIconPath,
  hasEffectIcon,
  modifierSummary,
  NEW_MODIFIER,
  OPERATION_LABELS,
  tickInterval,
} from './effect-model';
import { useBlocksItemsStudioHost } from './host';
import { CheckField, EventSelect, ProblemsAt, TextField } from './parts';

type JsonObject = { [key: string]: Json };

/** The three trigger components and their labels. */
const TRIGGERS = [
  {
    component: 'msm:on_start',
    label: 'When it starts',
    suffix: 'start',
    testId: 'effect-on-start',
  },
  { component: 'msm:on_tick', label: 'While active', suffix: 'tick', testId: 'effect-on-tick' },
  { component: 'msm:on_end', label: 'When it ends', suffix: 'end', testId: 'effect-on-end' },
] as const;

/** A thumbnail `data:` URL of `assetPath` from the host, or `null`. */
function useIconThumbnail(assetPath: string, present: boolean): string | null {
  const host = useBlocksItemsStudioHost();
  const [url, setUrl] = useState<string | null>(null);
  const load = host?.thumbnail;
  const revision = host?.revision ?? 0;
  useEffect(() => {
    setUrl(null);
    if (load === undefined || !present) return;
    let live = true;
    load(assetPath, EFFECT_ICON_SIZE * 2).then(
      (bytes) => {
        if (live) setUrl(pngDataUrl(bytes));
      },
      () => {
        if (live) setUrl(null);
      },
    );
    return () => {
      live = false;
    };
  }, [load, assetPath, present, revision]);
  return url;
}

/** The icon, or a swatch of the effect colour when there is no thumbnail. */
function IconImage(props: { url: string | null; colour: string; testId: string }) {
  return props.url !== null ? (
    <img
      src={props.url}
      alt="Effect icon"
      data-testid={props.testId}
      width={EFFECT_ICON_SIZE * 2}
      height={EFFECT_ICON_SIZE * 2}
      style={{ imageRendering: 'pixelated' }}
    />
  ) : (
    <span
      aria-hidden
      data-testid={`${props.testId}-placeholder`}
      className="inline-block rounded border border-border"
      style={{
        width: EFFECT_ICON_SIZE * 2,
        height: EFFECT_ICON_SIZE * 2,
        background: props.colour,
      }}
    />
  );
}

export function EffectStudio(props: StudioProps) {
  const { project, element, node, problems, suggest, onChange } = props;
  const host = useBlocksItemsStudioHost();
  const [advanced, setAdvanced] = useState(false);
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const events = eventNames(element.data);
  const components = asObject(data.components);
  const icon = effectIconPath(element.id);
  const iconPresent = hasEffectIcon(project, element.id);
  const thumbnail = useIconThumbnail(icon.assetPath, iconPresent);
  const schemaChoices = (path: readonly (string | number)[], fallback: readonly string[]) => {
    const found = choicesAt(
      node,
      element.data,
      path.map((key) => String(key)),
    );
    return found.length > 0 ? found : [...fallback];
  };
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  if (advanced) {
    return (
      <section
        aria-label="Effect Studio"
        data-testid="effect-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="effect-advanced-toggle" />
        {props.form}
      </section>
    );
  }

  const colourHex = typeof data.color === 'number' ? data.color : undefined;
  const swatch =
    colourHex === undefined ? 'transparent' : `#${colourHex.toString(16).padStart(6, '0')}`;
  const name = effectDisplayName(element);
  const modifiers = Array.isArray(data.attribute_modifiers) ? data.attribute_modifiers : [];

  const general = (
    <Section title="Effect" testId="effect-general">
      <TextField
        label="Display name"
        value={data.display_name}
        testId="effect-display-name"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <SelectField
        label="Category"
        value={typeof data.category === 'string' ? data.category : undefined}
        choices={schemaChoices(['category'], EFFECT_CATEGORIES)}
        testId="effect-category"
        onChange={(value) => {
          if (value !== undefined) set(['category'], value);
        }}
      />
      {at(['category'])}
      <ColourField
        label="Colour"
        value={data.color}
        testId="effect-colour"
        onChange={(value) => {
          if (value !== undefined) set(['color'], value);
        }}
      />
      <p className="text-muted text-xs">
        The colour tints the swirling particles around the holder and the potion bar.
      </p>
      {at(['color'])}
      <div className="flex flex-wrap items-end gap-2">
        <IdField
          label="Particle (instead of the swirl)"
          value={typeof data.particle === 'string' ? data.particle : ''}
          registry="particle_type"
          suggest={suggest}
          testId="effect-particle"
          onCommit={(value) => set(['particle'], value === '' ? undefined : value)}
        />
        <IdField
          label="Sound when added"
          value={typeof data.sound === 'string' ? data.sound : ''}
          registry="sound_event"
          suggest={suggest}
          testId="effect-sound"
          onCommit={(value) => set(['sound'], value === '' ? undefined : value)}
        />
      </div>
      {at(['particle'])}
      {at(['sound'])}
    </Section>
  );

  const iconSection = (
    <Section title="Icon" testId="effect-icon">
      <div className="flex items-center gap-2">
        <IconImage url={thumbnail} colour={swatch} testId="effect-icon-image" />
        <code className="font-mono text-xs">
          {icon.namespace}:{icon.path}
        </code>
        <Button
          className="text-xs"
          data-testid="effect-paint-icon"
          disabled={host === null}
          title={host === null ? 'Not available here' : undefined}
          onClick={() =>
            host?.paintTexture(icon.namespace, icon.path, {
              width: EFFECT_ICON_SIZE,
              height: EFFECT_ICON_SIZE,
            })
          }
        >
          <Paintbrush size={12} aria-hidden />
          Paint icon
        </Button>
      </div>
      {!iconPresent && (
        <p role="status" className="text-warning text-xs" data-testid="effect-icon-missing">
          No icon yet: the game shows a blank square. Paint {icon.path} ({EFFECT_ICON_SIZE} ×{' '}
          {EFFECT_ICON_SIZE}) with "Paint icon", or with "New texture…" and the kind "Effect icon"
          in the sidebar.
        </p>
      )}
    </Section>
  );

  const modifiersPath = ['attribute_modifiers'];
  const operations = schemaChoices([...modifiersPath, 0, 'operation'], ATTRIBUTE_OPERATIONS);
  const statSection = (
    <Section title="Stat changes" testId="effect-modifiers">
      <p className="text-muted text-xs">
        Each amount is for level I and grows with the level, as vanilla effects do.
      </p>
      {modifiers.length === 0 && <p className="text-muted text-xs">No stat changes.</p>}
      <ol className="flex flex-col gap-2">
        {modifiers.map((raw, index) => {
          const modifier = asObject(raw);
          const rowName = `Stat change ${index + 1}`;
          return (
            <li
              key={index}
              className="flex flex-col gap-1"
              data-testid={`effect-modifier-${index}`}
            >
              <div className="flex flex-wrap items-end gap-2">
                <IdField
                  label={`${rowName} stat`}
                  value={typeof modifier.attribute === 'string' ? modifier.attribute : ''}
                  registry="attribute"
                  suggest={suggest}
                  className="min-w-48"
                  onCommit={(value) => set([...modifiersPath, index, 'attribute'], value)}
                />
                <NumberField
                  label={`${rowName} amount`}
                  value={modifier.amount}
                  onCommit={(value) => {
                    if (value !== undefined)
                      set(
                        [...modifiersPath, index, 'amount'],
                        value,
                        typingKey(pointerOf([...modifiersPath, index, 'amount'])),
                      );
                  }}
                />
                <OperationSelect
                  label={`${rowName} operation`}
                  value={typeof modifier.operation === 'string' ? modifier.operation : undefined}
                  choices={operations}
                  onChange={(value) => set([...modifiersPath, index, 'operation'], value)}
                />
                <button
                  type="button"
                  aria-label={`Remove ${rowName.toLowerCase()}`}
                  className={iconButtonClass}
                  onClick={() =>
                    set(
                      modifiersPath,
                      modifiers.length === 1
                        ? undefined
                        : modifiers.filter((_, at) => at !== index),
                    )
                  }
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
              {at([...modifiersPath, index, 'attribute'])}
              {at([...modifiersPath, index, 'amount'])}
              {at([...modifiersPath, index, 'operation'])}
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid="effect-add-modifier"
        onClick={() =>
          modifiers.length === 0
            ? set(modifiersPath, [{ ...NEW_MODIFIER }])
            : set([...modifiersPath, modifiers.length], { ...NEW_MODIFIER })
        }
      >
        <Plus size={12} aria-hidden />
        Add stat change
      </Button>
      {at(modifiersPath)}
    </Section>
  );

  /** The data with a new event `<id>_<suffix>` and `component` pointing at it (one edit). */
  const withNewEvent = (component: string, suffix: string): JsonObject => {
    const base = suggestEventId(element.id, events).replace(/_event(_\d+)?$/, '');
    let id = `${base}_${suffix}`;
    for (let n = 2; events.includes(id); n++) id = `${base}_${suffix}_${n}`;
    const existing = asObject(components[component]);
    return {
      ...data,
      components: { ...components, [component]: { ...existing, event: id } },
      events: { ...asObject(data.events), [id]: { actions: [] } },
    };
  };

  const onTick = components['msm:on_tick'];
  const tick = asObject(onTick);
  const tickPath = ['components', 'msm:on_tick'];
  const behaviour = (
    <Section title="Behaviour" testId="effect-behaviour">
      <p className="text-muted text-xs">
        In these events the holder is both "self" and "other": "Hurt", "Heal" and "Apply effect" act
        on it.
      </p>
      {TRIGGERS.map(({ component, label, suffix, testId }) => {
        const value = asObject(components[component]).event;
        const path = ['components', component];
        return (
          <div key={component} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-end gap-2">
              <EventSelect
                label={label}
                value={value}
                events={events}
                testId={testId}
                onChange={(next) =>
                  next === undefined ? set(path, undefined) : set([...path, 'event'], next)
                }
              />
              {components[component] === undefined && (
                <Button
                  className="text-xs"
                  data-testid={`${testId}-new`}
                  aria-label={`New event for ${label.toLowerCase()}`}
                  onClick={() => onChange('', withNewEvent(component, suffix))}
                >
                  <Plus size={12} aria-hidden />
                  New event
                </Button>
              )}
              {component === 'msm:on_tick' && onTick !== undefined && (
                <>
                  <NumberField
                    label="Every (ticks, default 20)"
                    value={tick.interval_ticks}
                    integer
                    allowEmpty
                    testId="effect-tick-interval"
                    onCommit={(next) =>
                      set(
                        [...tickPath, 'interval_ticks'],
                        next,
                        typingKey('/components/msm:on_tick/interval_ticks'),
                      )
                    }
                  />
                  <CheckField
                    label="Stronger levels act faster"
                    checked={tick.faster_per_level === true}
                    testId="effect-tick-faster"
                    onChange={(checked) =>
                      set([...tickPath, 'faster_per_level'], checked ? true : undefined)
                    }
                  />
                </>
              )}
            </div>
            {at([...path, 'event'])}
            {component === 'msm:on_tick' && at([...tickPath, 'interval_ticks'])}
          </div>
        );
      })}
    </Section>
  );

  const levels = [1, 2];
  const preview = (
    <Section title="Preview" testId="effect-preview">
      <div className="flex items-center gap-2 rounded border border-border bg-bg p-2">
        <IconImage url={thumbnail} colour={swatch} testId="effect-preview-icon" />
        <span
          data-testid="effect-preview-name"
          className="font-medium text-sm"
          style={{ color: categoryColour(data.category) }}
        >
          {name}
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 text-xs" data-testid="effect-preview-levels">
        {levels.map((level) => {
          const interval = tickInterval(onTick, level);
          const parts = [
            ...modifiers.map((modifier) => modifierSummary(modifier, level)),
            ...(interval === undefined ? [] : [`acts every ${interval} ticks`]),
          ];
          return (
            <li key={level}>
              <span className="text-muted">Level {level === 1 ? 'I' : 'II'}: </span>
              {parts.length === 0 ? 'no stat changes or tick actions' : parts.join(', ')}
            </li>
          );
        })}
      </ul>
    </Section>
  );

  return (
    <section aria-label="Effect Studio" data-testid="effect-studio" className="flex flex-col gap-4">
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="effect-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      {preview}
      {general}
      {iconSection}
      {statSection}
      {behaviour}
      <EventsEditor
        element={element}
        problems={problems}
        suggest={suggest}
        onChange={onChange}
        handlers={projectHandlers(project)}
        effects={projectEffects(project)}
      />
    </section>
  );
}

/** A select over attribute operations, shown in words with the format id. */
function OperationSelect(props: {
  label: string;
  value: string | undefined;
  choices: readonly string[];
  onChange(value: string): void;
}) {
  const current = props.value ?? '';
  const options =
    current === '' || props.choices.includes(current)
      ? [...props.choices]
      : [current, ...props.choices];
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <span className="text-muted" aria-hidden>
        {props.label}
      </span>
      <select
        aria-label={props.label}
        className={inputClass}
        value={current}
        onChange={(event) => {
          if (event.target.value !== '') props.onChange(event.target.value);
        }}
      >
        {current === '' && <option value="">(choose)</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {OPERATION_LABELS[option] === undefined
              ? option
              : `${OPERATION_LABELS[option]} (${option})`}
          </option>
        ))}
      </select>
    </div>
  );
}
