/**
 * The HUD Studio (B420, ADR 0091 D1, ADR 0089 D1, D2, D9) for `msm:hud` element data: the look
 * (bar, row of icons, text, or a number, which is a text element showing just the value), what
 * it shows (set by rules and scripts, saved data, a score, the player's or the vehicle's stat,
 * each with its fields) and its full value, where on screen (a picture of nine spots plus above
 * the hotbar, the order in the stack, the offset and a bar's size), colours and pictures (with
 * the app's missing picture warnings), when it shows, and the live layout preview
 * (`HudPreview.tsx`) placing every HUD element of the project with `hud-layout.ts`.
 *
 * Changing the look drops the fields only another type reads, so nothing is left unused. Very
 * easy (ADR 0083 D3) shows the look, the value, the place, the colours and the preview. Loaded
 * lazily by `./studios.tsx`.
 *
 * @packageDocumentation
 */

import type { Json, JsonObject } from '@msm/core';
import { Fragment } from 'react';
import { Button } from '../../components/ui/Button';
import { InMore } from '../../components/ui/MoreOptions';
import { typingKey } from '../../forms/context';
import { asObject, pathSetter, pointerOf } from '../blocks-items/blocks-items-model';
import { CheckField, ProblemsAt, TextField } from '../blocks-items/parts';
import { PlainIdField, plainIdWords } from '../plain-things';
import { NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { Section } from '../worldgen/parts';
import {
  HUD_ANCHOR_LABELS,
  HUD_DEFAULTS,
  HUD_LOOK_LABELS,
  HUD_LOOKS,
  HUD_PLAYER_STAT_LABELS,
  HUD_PLAYER_STATS,
  HUD_SHOW_CHOICES,
  HUD_SHOW_LABELS,
  HUD_SOURCE_LABELS,
  HUD_SOURCES,
  HUD_VEHICLE_STAT_LABELS,
  HUD_VEHICLE_STATS,
  hudLookOf,
  isValueObject,
  isVehicleCondition,
  missingSprites,
  newHudValue,
  projectVehicles,
  statHasWeapon,
  withHudLook,
  withShow,
} from './controls-model';
import { HudPreview } from './HudPreview';
import { DEFAULT_HUD_ANCHOR, HUD_ANCHOR_IDS, isHudAnchor } from './hud-layout';
import { ColourField, VehiclePicker, WordsSelect } from './parts';

type Set = (path: readonly (string | number)[], value: Json | undefined, coalesce?: string) => void;

/** The fields of one HUD value at `path` (`value`, or `max` given as another value). */
export function ValueFields(props: {
  path: readonly string[];
  value: Json | undefined;
  set: Set;
  namespace: string;
  name: string;
  testId: string;
  problems: StudioProps['problems'];
}) {
  const { path, set, testId } = props;
  const value = asObject(props.value);
  const source = typeof value.source === 'string' ? value.source : 'set';
  const field = (key: string, label: string, placeholder?: string) => (
    <TextField
      label={label}
      value={value[key]}
      testId={`${testId}-${key}`}
      {...(placeholder === undefined ? {} : { placeholder })}
      onCommit={(next) => set([...path, key], next, typingKey(pointerOf([...path, key])))}
    />
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <WordsSelect
          label="Comes from"
          value={source}
          choices={HUD_SOURCES}
          labels={HUD_SOURCE_LABELS}
          testId={`${testId}-source`}
          onChange={(next) => set(path, newHudValue(next ?? 'set', props.namespace, props.name))}
        />
        {source === 'data' && (
          <>
            <WordsSelect
              label="Whose"
              value={value.scope ?? 'player'}
              choices={['player', 'world']}
              labels={{ player: "The player's", world: "The world's" }}
              testId={`${testId}-scope`}
              onChange={(next) => set([...path, 'scope'], next ?? 'player')}
            />
            {field('namespace', 'Data namespace')}
            {field('key', 'Data key')}
          </>
        )}
        {source === 'score' && (
          <>
            {field('objective', 'Objective')}
            {field('holder', 'Whose score (empty: the player)', '@s')}
          </>
        )}
        {source === 'player' && (
          <WordsSelect
            label="Stat"
            value={value.stat}
            choices={HUD_PLAYER_STATS}
            labels={HUD_PLAYER_STAT_LABELS}
            testId={`${testId}-player-stat`}
            onChange={(next) => set([...path, 'stat'], next ?? 'health')}
          />
        )}
        {source === 'vehicle' && (
          <>
            <WordsSelect
              label="Stat"
              value={value.stat}
              choices={HUD_VEHICLE_STATS}
              labels={HUD_VEHICLE_STAT_LABELS}
              testId={`${testId}-vehicle-stat`}
              onChange={(next) => {
                const out: JsonObject = { ...value, stat: next ?? 'fuel' };
                if (!statHasWeapon(out.stat)) delete out.weapon;
                set(path, out);
              }}
            />
            {statHasWeapon(value.stat) && field('weapon', 'Weapon id (empty: the first)')}
          </>
        )}
      </div>
      {source === 'set' && (
        <p className="text-muted text-xs" data-testid={`${testId}-set-note`}>
          Nothing shows until a rule, a script or a “Set a HUD element” action gives it a value.
        </p>
      )}
      {source === 'player' && (
        <p className="text-muted text-xs">
          Read by the player’s own game, so it is always up to date.
        </p>
      )}
      {source === 'vehicle' && (
        <p className="text-muted text-xs">
          Of the vehicle the player rides; nothing shows on foot.
        </p>
      )}
      {['', 'source', 'scope', 'namespace', 'key', 'objective', 'holder', 'stat', 'weapon'].map(
        (key) => (
          <ProblemsAt
            key={key}
            problems={props.problems}
            pointer={pointerOf(key === '' ? path : [...path, key])}
          />
        ),
      )}
    </div>
  );
}

/** The anchor picker: a picture of nine spots on a screen and "Above the hotbar". */
export function AnchorPicker(props: { value: Json | undefined; onChange(anchor: string): void }) {
  const current = isHudAnchor(props.value) ? props.value : DEFAULT_HUD_ANCHOR;
  const spots = HUD_ANCHOR_IDS.filter((id) => id !== 'above_hotbar');
  const spot = (id: string, extra = '') => (
    // biome-ignore lint/a11y/useSemanticElements: a spot on a picture of the screen
    <button
      key={id}
      type="button"
      role="radio"
      aria-checked={current === id}
      aria-label={HUD_ANCHOR_LABELS[id]}
      title={HUD_ANCHOR_LABELS[id]}
      data-testid={`hud-anchor-${id}`}
      className={`flex items-center justify-center rounded ${extra} ${
        current === id ? 'bg-accent text-white' : 'bg-black/20 hover:bg-black/30'
      }`}
      onClick={() => props.onChange(id)}
    >
      <span className="block h-1.5 w-3 rounded-sm bg-current" aria-hidden />
    </button>
  );
  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label="Where on screen">
      <div
        className="grid w-40 grid-cols-3 gap-1 rounded border border-border p-1"
        style={{ aspectRatio: '16 / 9' }}
      >
        {spots.map((id) => spot(id))}
      </div>
      {spot('above_hotbar', 'w-40 py-1 text-xs')}
      <span className="text-muted text-xs" data-testid="hud-anchor-words">
        {HUD_ANCHOR_LABELS[current]}
      </span>
    </div>
  );
}

/** A pair of numbers (`offset`, `size`) edited as one list. */
function PairFields(props: {
  value: Json | undefined;
  fallback: readonly [number, number];
  labels: readonly [string, string];
  testIds: readonly [string, string];
  onCommit(next: [number, number]): void;
}) {
  const raw = props.value;
  const current: [number, number] =
    Array.isArray(raw) && typeof raw[0] === 'number' && typeof raw[1] === 'number'
      ? [raw[0], raw[1]]
      : [props.fallback[0], props.fallback[1]];
  return (
    <>
      {([0, 1] as const).map((index) => (
        <NumberField
          key={index}
          label={props.labels[index]}
          value={current[index]}
          integer
          testId={props.testIds[index]}
          onCommit={(value) => {
            if (value === undefined) return;
            const next: [number, number] = [current[0], current[1]];
            next[index] = value;
            props.onCommit(next);
          }}
        />
      ))}
    </>
  );
}

/** The HUD Studio. */
export default function HudStudio(props: StudioProps) {
  const { project, element, problems, onChange, target } = props;

  const data: Json = element.data;
  const object = asObject(data);
  const set = pathSetter(data, onChange);
  const look = hudLookOf(data);
  const type = look === 'number' ? 'text' : look;
  const colon = element.id.indexOf(':');
  const namespace = element.id.slice(0, colon);
  const name =
    element.id
      .slice(colon + 1)
      .split('/')
      .pop() ?? 'value';
  const vehicles = projectVehicles(project);
  const missing = missingSprites(project, target, data);
  const at = (field: string) => (
    <ProblemsAt key={field} problems={problems} pointer={`/${field}`} />
  );
  // The pictures by name; their ids in the section's More options (ADR 0130 D2, D3).
  const sprite = (field: string, label: string) => (
    <Fragment key={field}>
      <PlainIdField
        label={label}
        value={typeof object[field] === 'string' ? (object[field] as string) : ''}
        registry="texture"
        emptyLabel="None"
        testId={`hud-${field.replaceAll('_', '-')}-plain`}
        onCommit={(value) => set([field], value === '' ? undefined : value)}
      />
      <InMore>
        <TextField
          label={label}
          value={object[field]}
          placeholder={`${namespace}:hud/${name}`}
          testId={`hud-${field.replaceAll('_', '-')}`}
          onCommit={(value) => set([field], value, typingKey(`/${field}`))}
        />
      </InMore>
    </Fragment>
  );

  return (
    <section aria-label="HUD Studio" data-testid="hud-studio" className="flex flex-col gap-4">
      <ProblemsAt problems={problems} pointer="" />
      <HudPreview project={project} elementId={element.id} data={data} target={target} />
      <Section title="What it looks like" testId="hud-look">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="What it looks like">
          {HUD_LOOKS.map((entry) => (
            // biome-ignore lint/a11y/useSemanticElements: a toggle button, not a bare radio
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={look === entry}
              data-testid={`hud-look-${entry}`}
              className={`rounded border px-2 py-1 text-xs ${
                look === entry ? 'border-accent bg-accent/10' : 'border-border'
              }`}
              onClick={() => {
                if (entry !== look) onChange('', withHudLook(data, entry));
              }}
            >
              {HUD_LOOK_LABELS[entry]}
            </button>
          ))}
        </div>
        {at('type')}
      </Section>
      <Section title="What it shows" testId="hud-value">
        <ValueFields
          path={['value']}
          value={object.value}
          set={set}
          namespace={namespace}
          name={name}
          testId="hud-value"
          problems={problems}
        />
        {type !== 'text' && (
          <div className="flex flex-col gap-2" data-testid="hud-max">
            {isValueObject(object.max) ? (
              <>
                <p className="text-xs">The full amount comes from another value:</p>
                <ValueFields
                  path={['max']}
                  value={object.max}
                  set={set}
                  namespace={namespace}
                  name={`${name}_max`}
                  testId="hud-max-value"
                  problems={problems}
                />
                <Button
                  className="self-start text-xs"
                  data-testid="hud-max-use-number"
                  onClick={() => set(['max'], undefined)}
                >
                  Use a number
                </Button>
              </>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <NumberField
                  label={`Full amount (${HUD_DEFAULTS.max} if empty)`}
                  value={object.max}
                  allowEmpty
                  testId="hud-max-number"
                  onCommit={(value) => set(['max'], value, typingKey('/max'))}
                />
                <Button
                  className="text-xs"
                  data-testid="hud-max-use-value"
                  onClick={() => set(['max'], newHudValue('data', namespace, `${name}_max`))}
                >
                  Use another value
                </Button>
              </div>
            )}
            {at('max')}
          </div>
        )}
      </Section>
      <Section title="Where on screen" testId="hud-where">
        <div className="flex flex-wrap items-start gap-4">
          <AnchorPicker
            value={object.anchor}
            onChange={(anchor) =>
              set(['anchor'], anchor === DEFAULT_HUD_ANCHOR ? undefined : anchor)
            }
          />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <NumberField
                label="Order (lower first)"
                value={object.order}
                integer
                allowEmpty
                testId="hud-order"
                onCommit={(value) => set(['order'], value, typingKey('/order'))}
              />
              <PairFields
                value={object.offset}
                fallback={[0, 0]}
                labels={['Move right', 'Move down']}
                testIds={['hud-offset-x', 'hud-offset-y']}
                onCommit={(next) =>
                  set(
                    ['offset'],
                    next[0] === 0 && next[1] === 0 ? undefined : next,
                    typingKey('/offset'),
                  )
                }
              />
            </div>
            {type === 'bar' && (
              <div className="flex flex-wrap items-end gap-2">
                <PairFields
                  value={object.size}
                  fallback={HUD_DEFAULTS.barSize}
                  labels={['Width', 'Height']}
                  testIds={['hud-size-width', 'hud-size-height']}
                  onCommit={(next) => set(['size'], next, typingKey('/size'))}
                />
              </div>
            )}
            <p className="text-muted text-xs">
              In screen pixels. Things in one place stack; the offset moves only this one.
            </p>
          </div>
        </div>
        {['anchor', 'order', 'offset', 'size'].map(at)}
      </Section>
      <Section title="Colours and pictures" testId="hud-style">
        {type === 'text' && (
          <div className="flex flex-wrap items-end gap-2">
            {look === 'text' && (
              <TextField
                label="Text ({value} and {max} are replaced)"
                value={object.text}
                testId="hud-text"
                onCommit={(value) => set(['text'], value, typingKey('/text'))}
              />
            )}
            <ColourField
              label="Colour"
              value={object.color}
              fallback={HUD_DEFAULTS.textColor}
              testId="hud-color"
              onCommit={(value) => set(['color'], value, typingKey('/color'))}
            />
            <CheckField
              label="Shadow"
              checked={object.shadow !== false}
              testId="hud-shadow"
              onChange={(checked) => set(['shadow'], checked ? undefined : false)}
            />
          </div>
        )}
        {type === 'bar' && (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <ColourField
                label="Filled part"
                value={object.fill_color}
                fallback={HUD_DEFAULTS.fillColor}
                testId="hud-fill-color"
                onCommit={(value) => set(['fill_color'], value, typingKey('/fill_color'))}
              />
              <ColourField
                label="Empty part"
                value={object.back_color}
                fallback={HUD_DEFAULTS.backColor}
                testId="hud-back-color"
                onCommit={(value) => set(['back_color'], value, typingKey('/back_color'))}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {sprite('sprite', 'Filled picture (instead of the colour)')}
              {sprite('back_sprite', 'Empty picture (instead of the colour)')}
            </div>
          </>
        )}
        {type === 'icons' && (
          <div className="flex flex-wrap items-end gap-2">
            {sprite('icon', 'Full icon')}
            {sprite('half_icon', 'Half icon (optional)')}
            {sprite('empty_icon', 'Empty icon (optional)')}
            <NumberField
              label={`Each icon is worth (${HUD_DEFAULTS.perIcon} if empty)`}
              value={object.per_icon}
              allowEmpty
              testId="hud-per-icon"
              onCommit={(value) => set(['per_icon'], value, typingKey('/per_icon'))}
            />
          </div>
        )}
        {type !== 'text' && (
          <InMore>
            <p className="text-muted text-xs">
              Pictures are your project’s GUI sprites: {namespace}:hud/{name} is the picture
              textures/gui/sprites/hud/{name}.png.
            </p>
          </InMore>
        )}
        {missing.length > 0 && (
          <ul
            className="flex flex-col gap-0.5 text-warning text-xs"
            data-testid="hud-missing-sprites"
          >
            {missing.map((entry) => (
              <li key={entry.field}>
                {`The picture “${plainIdWords(project, entry.sprite)}” is not in the project, so the game draws nothing there. Add the picture or pick another.`}
              </li>
            ))}
          </ul>
        )}
        {[
          'text',
          'color',
          'shadow',
          'fill_color',
          'back_color',
          'sprite',
          'back_sprite',
          'icon',
          'half_icon',
          'empty_icon',
          'per_icon',
        ].map(at)}
      </Section>
      <Section title="When it shows" testId="hud-show">
        <div className="flex flex-wrap items-end gap-2">
          <WordsSelect
            label="Shows"
            value={object.show ?? 'when_set'}
            choices={HUD_SHOW_CHOICES}
            labels={HUD_SHOW_LABELS}
            testId="hud-show-select"
            onChange={(value) => onChange('', withShow(data, value))}
          />
          {isVehicleCondition(object.show) && (
            <VehiclePicker
              value={object.vehicle}
              vehicles={vehicles}
              testId="hud-vehicle"
              onChange={(value) => set(['vehicle'], value)}
            />
          )}
        </div>
        <CheckField
          label="Starts hidden (a rule, a script or a “Show a HUD element” action shows it)"
          checked={object.starts_hidden === true}
          testId="hud-starts-hidden"
          onChange={(checked) => set(['starts_hidden'], checked ? true : undefined)}
        />
        {['show', 'vehicle', 'starts_hidden'].map(at)}
      </Section>
    </section>
  );
}
