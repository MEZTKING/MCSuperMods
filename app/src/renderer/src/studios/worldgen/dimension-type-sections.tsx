/**
 * The sections of the Dimension Type Studio (ADR 0100 D1): Sky (with the swatch of D4), Light,
 * Time, Rules, Height and Spawning. Each attribute field appears only when the target's
 * `worldgen.environmentAttributes` lists it; anything else stays in the Advanced form.
 */

import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { X } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { iconButtonClass } from '../../components/ui/Button';
import {
  type CompletionSource,
  type FormProblem,
  IdInput,
  idSuggestions,
  inputClass,
  ProblemList,
} from '../../forms';
import { typingKey } from '../../forms/context';
import { childPointer } from '../../forms/pointer';
import {
  AMBIENT_PARTICLES,
  type AttributeField,
  type AttributeTarget,
  attributeKey,
  attributeValue,
  BED_PRESETS,
  BED_RULES,
  type BedPreset,
  bedPresetOf,
  bedRule,
  flagChoice,
  hasAttribute,
  LIGHT_ATTRIBUTES,
  lightRange,
  lightValue,
  RULE_ATTRIBUTES,
  readColour,
  readNumber,
  SKY_ATTRIBUTES,
  shownAttributes,
  skySwatch,
  strawBedRule,
  writeColour,
} from './dimension-type-model';
import { Section, SubForm } from './parts';
import { asObject, choicesOf, entryValueNode, fieldOf, wildcardOf } from './worldgen-model';

type JsonObject = { [key: string]: Json };

/** What every section receives from the Studio. */
export interface DimensionSectionProps {
  /** The element data as an object. */
  data: JsonObject;
  /** The kind's schema node. */
  node: SchemaNode;
  target: AttributeTarget;
  /** Sets `value` at `path` (object keys), creating absent parents; `undefined` removes it. */
  setPath(path: readonly string[], value: Json | undefined, coalesce?: string): void;
  /** A sub-form's `onChange`. */
  subChange(pointer: string, value: Json | undefined, options?: { coalesce?: string }): void;
  /** The problems at exactly `path`. */
  problemsAt(path: readonly string[]): readonly FormProblem[];
  problems: readonly FormProblem[];
  completions: CompletionSource;
  suggest(registry: string, prefix: string): string[];
}

const LABEL = 'w-44 shrink-0';

function NumberRow({
  label,
  value,
  step,
  min,
  max,
  onChange,
  onClear,
  hint,
  testId,
}: {
  label: string;
  value: number | undefined;
  step?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  onChange(value: number): void;
  onClear?: (() => void) | undefined;
  hint?: string | undefined;
  testId?: string | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className={LABEL}>{label}</span>
        <input
          type="number"
          aria-label={label}
          data-testid={testId}
          className={`${inputClass} w-28`}
          step={step}
          min={min}
          max={max}
          value={value ?? ''}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (event.target.value !== '' && Number.isFinite(next)) onChange(next);
          }}
        />
      </label>
      {onClear !== undefined && value !== undefined && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          className={iconButtonClass}
          onClick={onClear}
        >
          <X size={12} aria-hidden />
        </button>
      )}
      {hint !== undefined && <span className="text-muted text-xs">{hint}</span>}
    </div>
  );
}

function ColourRow({
  field,
  value,
  onChange,
}: {
  field: AttributeField;
  value: Json | undefined;
  onChange(value: Json | undefined): void;
}) {
  const id = useId();
  const argb = field.control === 'argb';
  const shown = readColour(value, argb);
  const other = value !== undefined && shown === null;
  const testId = `dimension-attr-${field.id.slice(field.id.lastIndexOf('/') + 1)}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid={testId}>
      <label htmlFor={id} className={LABEL}>
        {field.label}
      </label>
      {other ? (
        <span className="text-muted text-xs">Set by a modifier; edit it under Advanced.</span>
      ) : (
        <>
          <input
            id={id}
            type="color"
            className="h-7 w-10 cursor-pointer rounded border border-border bg-bg p-0.5"
            value={shown?.hex ?? '#000000'}
            onChange={(event) => onChange(writeColour(event.target.value, argb, shown?.alpha))}
          />
          <code className="font-mono text-xs">{shown === null ? 'not set' : shown.hex}</code>
          {argb && shown !== null && (
            <label className="flex items-center gap-1 text-xs">
              Opacity
              <input
                type="number"
                aria-label={`${field.label} opacity`}
                className={`${inputClass} w-16`}
                min={0}
                max={255}
                step={1}
                value={shown.alpha}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (event.target.value !== '' && Number.isInteger(next)) {
                    onChange(writeColour(shown.hex, true, next));
                  }
                }}
              />
            </label>
          )}
          {value !== undefined && (
            <button
              type="button"
              aria-label={`Clear ${field.label}`}
              className={iconButtonClass}
              onClick={() => onChange(undefined)}
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </>
      )}
      {field.hint !== undefined && <span className="text-muted text-xs">{field.hint}</span>}
    </div>
  );
}

function FlagRow({
  label,
  value,
  onChange,
  testId,
  hint,
}: {
  label: string;
  value: Json | undefined;
  onChange(value: boolean | undefined): void;
  testId?: string;
  hint?: string | undefined;
}) {
  const choice = flagChoice(value);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className={LABEL}>{label}</span>
      {choice === null ? (
        <span className="text-muted text-xs">Set by a modifier; edit it under Advanced.</span>
      ) : (
        <select
          aria-label={label}
          data-testid={testId}
          className={`${inputClass} w-auto`}
          value={choice}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : event.target.value === 'yes')
          }
        >
          <option value="">As usual</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      )}
      {hint !== undefined && <span className="text-muted text-xs">{hint}</span>}
    </div>
  );
}

/** One attribute field of any control. */
function AttributeRow({ field, props }: { field: AttributeField; props: DimensionSectionProps }) {
  const attributes = asObject(props.data.attributes);
  const key = attributeKey(attributes, field.id);
  const value = attributeValue(attributes, field.id);
  const path = ['attributes', key];
  const set = (next: Json | undefined, typing?: boolean) =>
    props.setPath(
      path,
      next,
      typing === true ? typingKey(childPointer('/attributes', key)) : undefined,
    );
  const testId = `dimension-attr-${field.id.slice(field.id.lastIndexOf('/') + 1)}`;
  let row: ReactNode;
  if (field.control === 'rgb' || field.control === 'argb') {
    row = <ColourRow field={field} value={value} onChange={(next) => set(next, true)} />;
  } else if (field.control === 'flag') {
    row = (
      <FlagRow
        label={field.label}
        value={value}
        testId={testId}
        hint={field.hint}
        onChange={(next) => set(next)}
      />
    );
  } else {
    const plain = readNumber(value);
    row =
      value !== undefined && plain === undefined ? (
        <p className="text-muted text-xs">
          {field.label}: set by a modifier; edit it under Advanced.
        </p>
      ) : (
        <NumberRow
          label={field.label}
          value={plain}
          step={field.step}
          min={field.min}
          max={field.max}
          hint={field.hint}
          testId={testId}
          onChange={(next) => set(next, true)}
          onClear={() => set(undefined)}
        />
      );
  }
  return (
    <>
      {row}
      <ProblemList problems={props.problemsAt(path)} />
    </>
  );
}

/** The sky swatch (ADR 0100 D4): sky colour to fog colour, with the sun and moon. */
export function SkySwatchView({ data }: { data: Json | undefined }) {
  const swatch = skySwatch(data);
  const words =
    swatch.skybox === 'none'
      ? 'No sky: only fog.'
      : swatch.skybox === 'end'
        ? 'The End sky.'
        : `${swatch.sun.shown ? 'Sun up' : 'Sun down'}${swatch.moon.shown ? ', moon up' : ''}.`;
  return (
    <figure className="flex items-center gap-3" data-testid="dimension-sky-swatch">
      <svg
        width="120"
        height="64"
        viewBox="0 0 1 0.5"
        role="img"
        aria-label={`Sky preview. ${words}`}
        className="rounded border border-border"
      >
        <defs>
          <linearGradient id="dimension-sky-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={swatch.top} />
            <stop offset="1" stopColor={swatch.horizon} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="1" height="0.5" fill="url(#dimension-sky-gradient)" />
        {swatch.sun.shown && (
          <rect
            data-testid="dimension-sky-sun"
            x={swatch.sun.x - 0.04}
            y={swatch.sun.y - 0.04}
            width="0.08"
            height="0.08"
            fill="#fff4b0"
          />
        )}
        {swatch.moon.shown && (
          <rect
            data-testid="dimension-sky-moon"
            x={swatch.moon.x - 0.03}
            y={swatch.moon.y - 0.03}
            width="0.06"
            height="0.06"
            fill="#e8ecf4"
          />
        )}
      </svg>
      <figcaption className="text-muted text-xs">{words}</figcaption>
    </figure>
  );
}

function ChoiceRow({
  label,
  value,
  choices,
  onChange,
  testId,
}: {
  label: string;
  value: Json | undefined;
  choices: readonly string[];
  onChange(value: string | undefined): void;
  testId?: string;
}) {
  const current = typeof value === 'string' ? value : '';
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className={LABEL}>{label}</span>
      <select
        aria-label={label}
        data-testid={testId}
        className={`${inputClass} w-auto`}
        value={current}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      >
        <option value="">As usual</option>
        {current !== '' && !choices.includes(current) && <option value={current}>{current}</option>}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}

const SKYBOX_LABEL = 'Sky picture';

export function SkySection(props: DimensionSectionProps) {
  const { data, node, target } = props;
  const skyboxField = fieldOf(node, 'skybox', data);
  const attributesField = fieldOf(node, 'attributes', data);
  const particlesNode = hasAttribute(target, AMBIENT_PARTICLES)
    ? entryValueNode(wildcardOf(attributesField?.type)?.type, AMBIENT_PARTICLES)
    : undefined;
  const attributes = asObject(data.attributes);
  const particlesKey = attributeKey(attributes, AMBIENT_PARTICLES);
  return (
    <Section title="Sky" testId="dimension-sky">
      <SkySwatchView data={data} />
      {skyboxField !== undefined && (
        <ChoiceRow
          label={SKYBOX_LABEL}
          testId="dimension-skybox"
          value={data.skybox}
          choices={choicesOf(skyboxField.type)}
          onChange={(value) => props.setPath(['skybox'], value)}
        />
      )}
      {attributesField !== undefined &&
        shownAttributes(SKY_ATTRIBUTES, target).map((field) => (
          <AttributeRow key={field.id} field={field} props={props} />
        ))}
      {attributesField !== undefined && particlesNode !== undefined && (
        <div className="flex flex-col gap-1" data-testid="dimension-ambient-particles">
          <h4 className="text-sm">Ambient particles</h4>
          <SubForm
            node={particlesNode}
            value={attributes[particlesKey]}
            pointer={childPointer('/attributes', particlesKey)}
            label="Ambient particles"
            problems={props.problems}
            completions={props.completions}
            onChange={props.subChange}
          />
        </div>
      )}
    </Section>
  );
}

/** A yes or no field of the dimension type itself (not an attribute). */
function FieldFlag({
  props,
  keyName,
  label,
}: {
  props: DimensionSectionProps;
  keyName: string;
  label: string;
}) {
  if (fieldOf(props.node, keyName, props.data) === undefined) return null;
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <span className={LABEL}>{label}</span>
        <input
          type="checkbox"
          aria-label={label}
          data-testid={`dimension-field-${keyName}`}
          checked={props.data[keyName] === true}
          onChange={(event) => props.setPath([keyName], event.target.checked)}
        />
      </label>
      <ProblemList problems={props.problemsAt([keyName])} />
    </>
  );
}

/** A number field of the dimension type itself. */
function FieldNumber({
  props,
  keyName,
  label,
  step,
  hint,
}: {
  props: DimensionSectionProps;
  keyName: string;
  label: string;
  step?: number;
  hint?: string;
}) {
  const field = fieldOf(props.node, keyName, props.data);
  if (field === undefined) return null;
  return (
    <>
      <NumberRow
        label={label}
        testId={`dimension-field-${keyName}`}
        value={readNumber(props.data[keyName])}
        step={step}
        hint={hint}
        onChange={(value) => props.setPath([keyName], value, typingKey(`/${keyName}`))}
        onClear={field.optional ? () => props.setPath([keyName], undefined) : undefined}
      />
      <ProblemList problems={props.problemsAt([keyName])} />
    </>
  );
}

export function LightSection(props: DimensionSectionProps) {
  const { data, node, target } = props;
  const cardinal = fieldOf(node, 'cardinal_light', data);
  return (
    <Section title="Light" testId="dimension-light">
      <FieldNumber props={props} keyName="ambient_light" label="Ambient light" step={0.05} />
      <FieldFlag props={props} keyName="has_skylight" label="Sky light" />
      <FieldFlag props={props} keyName="has_ceiling" label="Ceiling (a roof of bedrock)" />
      {cardinal !== undefined && (
        <ChoiceRow
          label="Light on block sides"
          testId="dimension-cardinal_light"
          value={data.cardinal_light}
          choices={choicesOf(cardinal.type)}
          onChange={(value) => props.setPath(['cardinal_light'], value)}
        />
      )}
      {fieldOf(node, 'attributes', data) !== undefined &&
        shownAttributes(LIGHT_ATTRIBUTES, target).map((field) => (
          <AttributeRow key={field.id} field={field} props={props} />
        ))}
    </Section>
  );
}

export function TimeSection(props: DimensionSectionProps) {
  const { data, node, suggest } = props;
  const fixedField = fieldOf(node, 'has_fixed_time', data);
  const clockField = fieldOf(node, 'default_clock', data);
  const timelinesField = fieldOf(node, 'timelines', data);
  const fixed = data.has_fixed_time === true;
  return (
    <Section title="Time" testId="dimension-time">
      {fixedField !== undefined && (
        <label className="flex items-center gap-2 text-sm">
          <span className={LABEL}>Time of day</span>
          <select
            aria-label="Time of day"
            data-testid="dimension-time-mode"
            className={`${inputClass} w-auto`}
            value={fixed ? 'fixed' : 'clock'}
            onChange={(event) =>
              props.setPath(['has_fixed_time'], event.target.value === 'fixed' ? true : undefined)
            }
          >
            <option value="clock">Day and night (follows the clock)</option>
            <option value="fixed">Fixed: the sun stands still</option>
          </select>
        </label>
      )}
      {fixed && (
        <p className="text-muted text-xs">
          Set where the sun and moon stand with the Sun angle and Moon angle in Sky.
        </p>
      )}
      {clockField !== undefined && (
        <div className="flex items-center gap-2 text-sm">
          <span className={LABEL}>Clock</span>
          <IdInput
            value={typeof data.default_clock === 'string' ? data.default_clock : ''}
            label="Clock"
            testId="dimension-default_clock"
            placeholder="minecraft:overworld"
            suggestions={(text) => idSuggestions(suggest, 'world_clock', text)}
            onCommit={(text) =>
              props.setPath(['default_clock'], text.trim() === '' ? undefined : text.trim())
            }
            className="w-56"
          />
        </div>
      )}
      <ProblemList problems={props.problemsAt(['default_clock'])} />
      {timelinesField !== undefined &&
        (data.timelines === undefined || typeof data.timelines === 'string') && (
          <div className="flex items-center gap-2 text-sm">
            <span className={LABEL}>Timelines</span>
            <IdInput
              value={typeof data.timelines === 'string' ? data.timelines : ''}
              label="Timelines"
              testId="dimension-timelines"
              placeholder="#minecraft:in_overworld"
              suggestions={(text) => idSuggestions(suggest, 'timeline', text)}
              onCommit={(text) =>
                props.setPath(['timelines'], text.trim() === '' ? undefined : text.trim())
              }
              className="w-56"
            />
          </div>
        )}
      <ProblemList problems={props.problemsAt(['timelines'])} />
    </Section>
  );
}

export function RulesSection(props: DimensionSectionProps) {
  const { data, node, target } = props;
  if (fieldOf(node, 'attributes', data) === undefined) return null;
  const attributes = asObject(data.attributes);
  const [bed, straw] = BED_RULES;
  const bedKey = attributeKey(attributes, bed);
  const bedValue = attributeValue(attributes, bed);
  const preset = bedPresetOf(bedValue);
  const showBeds = hasAttribute(target, bed);
  const strawShown = hasAttribute(target, straw);
  const setBeds = (next: BedPreset | '') => {
    const strawKey = attributeKey(attributes, straw);
    if (next === '') {
      props.setPath(['attributes', bedKey], undefined);
      if (strawShown) props.setPath(['attributes', strawKey], undefined);
      return;
    }
    const merged: JsonObject = { ...attributes, [bedKey]: bedRule(next) };
    if (strawShown) merged[strawKey] = strawBedRule(next);
    props.setPath(['attributes'], merged);
  };
  return (
    <Section title="Rules" testId="dimension-rules">
      {showBeds && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className={LABEL}>Beds</span>
          <select
            aria-label="Beds"
            data-testid="dimension-beds"
            className={`${inputClass} w-auto`}
            value={bedValue === undefined ? '' : (preset ?? 'other')}
            onChange={(event) => {
              const value = event.target.value;
              if (value !== 'other') setBeds(value as BedPreset | '');
            }}
          >
            <option value="">As usual</option>
            {BED_PRESETS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
            {bedValue !== undefined && preset === null && (
              <option value="other">Own rule (edit it under Advanced)</option>
            )}
          </select>
        </label>
      )}
      {shownAttributes(RULE_ATTRIBUTES, target).map((field) => (
        <AttributeRow key={field.id} field={field} props={props} />
      ))}
    </Section>
  );
}

export function HeightSection(props: DimensionSectionProps) {
  return (
    <Section title="Height" testId="dimension-height">
      <FieldNumber
        props={props}
        keyName="min_y"
        label="Lowest block (min y)"
        step={16}
        hint="A multiple of 16."
      />
      <FieldNumber
        props={props}
        keyName="height"
        label="Height"
        step={16}
        hint="A multiple of 16; the top is min y + height - 1."
      />
      <FieldNumber
        props={props}
        keyName="logical_height"
        label="Logical height"
        step={1}
        hint="Portals and chorus fruit stay below it."
      />
      <FieldNumber
        props={props}
        keyName="coordinate_scale"
        label="Distance scale"
        step={1}
        hint="8 makes one block here eight in the overworld, as in the Nether."
      />
    </Section>
  );
}

export function SpawningSection(props: DimensionSectionProps) {
  const { data, node } = props;
  const levelField = fieldOf(node, 'monster_spawn_light_level', data);
  const range = lightRange(data.monster_spawn_light_level);
  return (
    <Section title="Spawning" testId="dimension-spawning">
      {levelField !== undefined &&
        (range === null ? (
          <p className="text-muted text-xs">
            The monster light test is not a plain range; edit it under Advanced.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={LABEL}>Monsters spawn at light</span>
            <input
              type="number"
              aria-label="Lowest monster spawn light"
              data-testid="dimension-spawn-light-min"
              className={`${inputClass} w-16`}
              min={0}
              max={15}
              value={range[0]}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (event.target.value !== '' && Number.isInteger(next)) {
                  props.setPath(['monster_spawn_light_level'], lightValue(next, range[1]));
                }
              }}
            />
            to
            <input
              type="number"
              aria-label="Highest monster spawn light"
              data-testid="dimension-spawn-light-max"
              className={`${inputClass} w-16`}
              min={0}
              max={15}
              value={range[1]}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (event.target.value !== '' && Number.isInteger(next)) {
                  props.setPath(['monster_spawn_light_level'], lightValue(range[0], next));
                }
              }}
            />
          </div>
        ))}
      <ProblemList problems={props.problemsAt(['monster_spawn_light_level'])} />
      <FieldNumber
        props={props}
        keyName="monster_spawn_block_light_limit"
        label="Block light limit"
        step={1}
        hint="Monsters spawn only where torches and other blocks light it this much or less."
      />
    </Section>
  );
}
