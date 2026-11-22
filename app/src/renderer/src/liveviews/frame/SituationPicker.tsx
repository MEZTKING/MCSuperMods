/**
 * The situation picker (ADR 0120 D4; B608): one picker for loot tables, predicates and item
 * modifiers. "What happens to it?" offers presets in plain words; **Advanced** shows the fields
 * behind them, filled by the preset chosen, and any change there makes the situation the user's
 * own. The choice is kept with the view preferences (`view-prefs.ts`), never in the project.
 *
 * Keyboard: the presets are a radio group (arrow keys, Home and End move and choose; Tab leaves
 * the group), Advanced is a button that opens and closes the fields, every field is labelled.
 */

import type { Situation } from '@msm/sim';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import type { LiveViewPrefs } from '../view-prefs';
import {
  CONTEXT_SUGGESTIONS,
  CUSTOM_SITUATION,
  fieldsOfChoice,
  presetOf,
  presetsFor,
  type SituationFields,
  type SituationSubject,
  situationOf,
} from './situations';

/** What the picker shows and changes. */
export interface SituationChoice {
  /** The preset's id, or `custom`. */
  readonly preset: string;
  readonly fields: SituationFields;
}

/** What {@link useSituationChoice} gives a view. */
export interface SituationState extends SituationChoice {
  /** The situation for `@msm/sim`. */
  readonly situation: Situation;
  /** Chooses a preset or changes the fields. */
  choose(choice: SituationChoice): void;
}

/**
 * A view's situation: the stored choice (or the first preset that fits the view's contexts),
 * kept with the view preferences when the user changes it. The choice is also held here, so it
 * works where the host keeps no preferences (a bundle without a project folder).
 */
export function useSituationChoice(
  preferences: LiveViewPrefs,
  onPreferences: (patch: Partial<LiveViewPrefs>) => void,
  contexts?: readonly string[],
  subject: SituationSubject = {},
): SituationState {
  const stored = useMemo<SituationChoice>(() => {
    const fields = fieldsOfChoice(preferences.situation, preferences.situationFields, contexts);
    return { preset: presetOf(fields), fields };
    // `contexts` is compared by its contents.
  }, [preferences.situation, preferences.situationFields, (contexts ?? []).join('|')]);
  const [choice, setChoice] = useState(stored);
  useEffect(() => setChoice(stored), [stored]);
  const block = subject.block;
  const entity = subject.entity;
  const situation = useMemo(
    () =>
      situationOf(
        choice.fields,
        {
          ...(block === undefined ? {} : { block }),
          ...(entity === undefined ? {} : { entity }),
        },
        // A preset's stone or zombie is a sample: the thing the view shows takes its place.
        choice.preset !== CUSTOM_SITUATION,
      ),
    [choice.fields, choice.preset, block, entity],
  );
  return {
    ...choice,
    situation,
    choose(next) {
      setChoice(next);
      onPreferences(
        next.preset === CUSTOM_SITUATION
          ? { situation: CUSTOM_SITUATION, situationFields: next.fields }
          : { situation: next.preset, situationFields: null },
      );
    },
  };
}

/** Props of {@link SituationPicker}. */
export interface SituationPickerProps {
  readonly choice: SituationChoice;
  onChoose(choice: SituationChoice): void;
  /** The contexts whose presets are offered (all for none). */
  readonly contexts?: readonly string[];
  /** The words above the presets. */
  readonly label?: string;
}

type TextField = Exclude<
  keyof SituationFields,
  'killerIsPlayer' | 'explosion' | 'explosionDecays' | 'weather'
>;

/** The Advanced text fields: label and hint, in the order shown. */
const TEXT_FIELDS: readonly { key: TextField; label: string; hint?: string }[] = [
  { key: 'context', label: 'Context', hint: 'minecraft:block' },
  { key: 'tool', label: 'Tool', hint: 'minecraft:diamond_pickaxe' },
  { key: 'toolEnchantments', label: 'Tool enchantments', hint: 'minecraft:fortune 3' },
  { key: 'block', label: 'Block', hint: 'the one shown' },
  { key: 'blockState', label: 'Block state', hint: 'age=7, facing=north' },
  { key: 'entity', label: 'Entity', hint: 'the one shown' },
  { key: 'entityFlags', label: 'Entity flags', hint: 'is_on_fire, is_baby' },
  { key: 'killer', label: 'Killer', hint: 'minecraft:player' },
  { key: 'weapon', label: 'Weapon', hint: 'minecraft:diamond_sword' },
  { key: 'weaponEnchantments', label: 'Weapon enchantments', hint: 'minecraft:looting 3' },
  { key: 'damage', label: 'Damage type', hint: 'minecraft:player_attack' },
  { key: 'explosionPower', label: 'Explosion power', hint: '4' },
  { key: 'clock', label: 'Clock', hint: 'minecraft:overworld' },
  { key: 'ticks', label: 'Time (ticks)', hint: '6000' },
  { key: 'dimension', label: 'Dimension', hint: 'minecraft:overworld' },
  { key: 'biome', label: 'Biome', hint: 'minecraft:plains' },
  { key: 'position', label: 'Position', hint: '0 64 0' },
  { key: 'luck', label: 'Luck', hint: '0' },
];

const WEATHER: readonly { value: string; label: string }[] = [
  { value: '', label: 'Not said' },
  { value: 'clear', label: 'Clear' },
  { value: 'rain', label: 'Rain' },
  { value: 'thunder', label: 'Thunder' },
];

const inputClass = 'min-w-0 rounded border border-border bg-bg px-1';

/** The picker: presets, then Advanced. */
export function SituationPicker(props: SituationPickerProps) {
  const { choice, onChoose, contexts, label = 'What happens to it?' } = props;
  const presets = presetsFor(contexts);
  const [advanced, setAdvanced] = useState(false);
  const groupLabel = useId();
  const panelId = useId();
  const contextList = useId();
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = presets.findIndex((entry) => entry.id === choice.preset);
  const focusIndex = Math.max(0, checkedIndex);

  const pick = (index: number): void => {
    const entry = presets[index];
    if (entry === undefined) return;
    onChoose({ preset: entry.id, fields: entry.fields });
    radios.current[index]?.focus();
  };

  const onKey = (event: KeyboardEvent, index: number): void => {
    const last = presets.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
      next = index >= last ? 0 : index + 1;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      next = index <= 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    pick(next);
  };

  const change = (patch: Partial<SituationFields>): void => {
    const fields = { ...choice.fields, ...patch };
    onChoose({ preset: presetOf(fields), fields });
  };

  return (
    <div data-testid="situation-picker" className="flex flex-col gap-2 text-sm">
      <span id={groupLabel} className="font-medium">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={groupLabel} className="flex flex-wrap gap-1">
        {presets.map((entry, index) => {
          const checked = entry.id === choice.preset;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a row of buttons reads better than radios here
            <button
              key={entry.id}
              ref={(node) => {
                radios.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === focusIndex ? 0 : -1}
              data-testid={`situation-preset-${entry.id}`}
              onClick={() => pick(index)}
              onKeyDown={(event) => onKey(event, index)}
              className={`rounded border px-2 py-0.5 text-left ${
                checked ? 'border-accent bg-panel' : 'border-border'
              } cursor-pointer hover:border-accent`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      {choice.preset === CUSTOM_SITUATION && (
        <span data-testid="situation-custom" className="text-xs text-muted">
          Your own situation (changed under Advanced).
        </span>
      )}
      <div>
        <Button
          data-testid="situation-advanced"
          aria-expanded={advanced}
          aria-controls={panelId}
          onClick={() => setAdvanced((open) => !open)}
        >
          Advanced
        </Button>
      </div>
      {advanced && (
        <div
          id={panelId}
          data-testid="situation-fields"
          className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2"
        >
          <datalist id={contextList}>
            {CONTEXT_SUGGESTIONS.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          {TEXT_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-0.5 text-xs">
              {field.label}
              <input
                data-testid={`situation-field-${field.key}`}
                className={inputClass}
                value={choice.fields[field.key]}
                placeholder={field.hint}
                {...(field.key === 'context' ? { list: contextList } : {})}
                onChange={(event) => change({ [field.key]: event.target.value })}
              />
            </label>
          ))}
          <label className="flex flex-col gap-0.5 text-xs">
            Weather
            <select
              data-testid="situation-field-weather"
              className={inputClass}
              value={choice.fields.weather}
              onChange={(event) => change({ weather: event.target.value })}
            >
              {WEATHER.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <span className="flex flex-col gap-0.5 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                data-testid="situation-field-killerIsPlayer"
                checked={choice.fields.killerIsPlayer}
                onChange={(event) => change({ killerIsPlayer: event.target.checked })}
              />
              The killer is a player
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                data-testid="situation-field-explosion"
                checked={choice.fields.explosion}
                onChange={(event) => change({ explosion: event.target.checked })}
              />
              An explosion did it
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                data-testid="situation-field-explosionDecays"
                checked={choice.fields.explosionDecays}
                onChange={(event) => change({ explosionDecays: event.target.checked })}
              />
              The explosion thins out the drops
            </label>
          </span>
        </div>
      )}
    </div>
  );
}
