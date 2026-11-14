/**
 * Potion Studio (B253, ADR 0063 D9) for `msm:potion` element data:
 *
 * - Preview: the four item names (potion, splash, lingering, arrow) and the registry ids the
 *   potion adds (its own, `long_` and `strong_`).
 * - Potion: display name and the optional name key part.
 * - Effects: one to eight rows of effect, time, level and the ambient, particles and icon
 *   switches; project effects are offered first.
 * - Brewing: the base potion and the ingredient; then the longer and stronger versions with
 *   their times, level and ingredients; the splash and lingering versions.
 * - The brewing chain: every brewing stand step the export writes, as "input + ingredient ->
 *   output", from the plugin's own step list.
 *
 * Every edit is one undo step; typing coalesces. Everything else stays behind "Advanced (all
 * fields)" and Raw JSON.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { ArrowRight, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { typingKey } from '../../forms/context';
import { IdField, NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, Section } from '../worldgen/parts';
import {
  asObject,
  pathSetter,
  pointerOf,
  projectEffects,
  withProjectIds,
} from './blocks-items-model';
import { CheckField, ProblemsAt, TextField } from './parts';
import {
  brewingSteps,
  DEFAULT_BREWING_BASE,
  DEFAULT_LONG_REAGENT,
  DEFAULT_STRONG_REAGENT,
  durationText,
  MAX_POTION_EFFECTS,
  NEW_EFFECT_DURATION,
  newLongVersion,
  newStrongVersion,
  potionIds,
  potionItemNames,
  stepSummary,
} from './potion-model';

/** A level field over an amplifier: level = amplifier + 1; level I removes the amplifier. */
function LevelField(props: {
  label: string;
  amplifier: Json | undefined;
  testId?: string;
  onCommit(amplifier: number | undefined): void;
}) {
  const level = (typeof props.amplifier === 'number' ? props.amplifier : 0) + 1;
  return (
    <NumberField
      label={props.label}
      value={level}
      integer
      {...(props.testId === undefined ? {} : { testId: props.testId })}
      onCommit={(next) => {
        if (next === undefined || next < 1) return;
        props.onCommit(next - 1);
      }}
    />
  );
}

/** A duration in ticks with the time in minutes and seconds beside it. */
function DurationField(props: {
  label: string;
  value: Json | undefined;
  testId?: string;
  onCommit(ticks: number): void;
}) {
  const text = durationText(props.value);
  return (
    <div className="flex items-end gap-1">
      <NumberField
        label={props.label}
        value={props.value}
        integer
        {...(props.testId === undefined ? {} : { testId: props.testId })}
        onCommit={(next) => {
          if (next !== undefined) props.onCommit(next);
        }}
      />
      {text !== '' && (
        <span className="pb-1 text-muted text-xs" aria-hidden>
          {text}
        </span>
      )}
    </div>
  );
}

export function PotionStudio(props: StudioProps) {
  const { project, element, problems, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const suggest = withProjectIds(props.suggest, 'mob_effect', projectEffects(project));
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  if (advanced) {
    return (
      <section
        aria-label="Potion Studio"
        data-testid="potion-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="potion-advanced-toggle" />
        {props.form}
      </section>
    );
  }

  const effects = Array.isArray(data.effects) ? data.effects : [];
  const brewing = data.brewing === undefined ? undefined : asObject(data.brewing);
  const long = data.long === undefined ? undefined : asObject(data.long);
  const strong = data.strong === undefined ? undefined : asObject(data.strong);
  const names = potionItemNames(element);
  const ids = potionIds(element);
  const steps = brewingSteps(element);

  const preview = (
    <Section title="Preview" testId="potion-preview">
      <ul className="flex flex-col gap-0.5 text-xs" data-testid="potion-preview-names">
        {names.map(({ key, text }) => (
          <li key={key} title={key}>
            {text}
          </li>
        ))}
      </ul>
      <p className="text-muted text-xs" data-testid="potion-preview-ids">
        Potion ids: {ids.join(', ')}
      </p>
      <p className="text-muted text-xs">
        Potions need the Fabric mod export: vanilla data packs leave them and their brewing out.
      </p>
    </Section>
  );

  const general = (
    <Section title="Potion" testId="potion-general">
      <TextField
        label="Display name"
        value={data.display_name}
        testId="potion-display-name"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <TextField
        label="Name key (optional; the game shows the display name)"
        value={data.name}
        testId="potion-name"
        placeholder={names[0]?.key.replace(/^item\.minecraft\.potion\.effect\./, '') ?? ''}
        onCommit={(value) => set(['name'], value, typingKey('/name'))}
      />
      {at(['name'])}
    </Section>
  );

  const effectsPath = ['effects'];
  const effectsSection = (
    <Section title="Effects" testId="potion-effects">
      <p className="text-muted text-xs">
        Each effect lasts its time in ticks (20 ticks are one second). Level I is the base level.
      </p>
      <ol className="flex flex-col gap-2">
        {effects.map((raw, index) => {
          const effect = asObject(raw);
          const rowName = `Effect ${index + 1}`;
          const row = [...effectsPath, index];
          return (
            <li key={index} className="flex flex-col gap-1" data-testid={`potion-effect-${index}`}>
              <div className="flex flex-wrap items-end gap-2">
                <IdField
                  label={`${rowName} effect`}
                  value={typeof effect.id === 'string' ? effect.id : ''}
                  registry="mob_effect"
                  suggest={suggest}
                  className="min-w-48"
                  testId={`potion-effect-${index}-id`}
                  onCommit={(value) => set([...row, 'id'], value)}
                />
                <DurationField
                  label={`${rowName} time (ticks)`}
                  value={effect.duration_ticks}
                  testId={`potion-effect-${index}-duration`}
                  onCommit={(value) =>
                    set(
                      [...row, 'duration_ticks'],
                      value,
                      typingKey(pointerOf([...row, 'duration_ticks'])),
                    )
                  }
                />
                <LevelField
                  label={`${rowName} level`}
                  amplifier={effect.amplifier}
                  testId={`potion-effect-${index}-level`}
                  onCommit={(value) =>
                    set(
                      [...row, 'amplifier'],
                      value === 0 && effect.amplifier === undefined ? undefined : value,
                      typingKey(pointerOf([...row, 'amplifier'])),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove ${rowName.toLowerCase()}`}
                  className={iconButtonClass}
                  disabled={effects.length <= 1}
                  onClick={() =>
                    set(
                      effectsPath,
                      effects.filter((_, other) => other !== index),
                    )
                  }
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <CheckField
                  label="Faint (like a beacon)"
                  checked={effect.ambient === true}
                  testId={`potion-effect-${index}-ambient`}
                  onChange={(checked) => set([...row, 'ambient'], checked ? true : undefined)}
                />
                <CheckField
                  label="Particles"
                  checked={effect.show_particles !== false}
                  testId={`potion-effect-${index}-particles`}
                  onChange={(checked) =>
                    set([...row, 'show_particles'], checked ? undefined : false)
                  }
                />
                <CheckField
                  label="Icon"
                  checked={effect.show_icon !== false}
                  testId={`potion-effect-${index}-icon`}
                  onChange={(checked) => set([...row, 'show_icon'], checked ? undefined : false)}
                />
              </div>
              {at([...row, 'id'])}
              {at([...row, 'duration_ticks'])}
              {at([...row, 'amplifier'])}
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid="potion-add-effect"
        disabled={effects.length >= MAX_POTION_EFFECTS}
        onClick={() => {
          const next = { id: 'minecraft:speed', duration_ticks: NEW_EFFECT_DURATION };
          if (effects.length === 0) set(effectsPath, [next]);
          else set([...effectsPath, effects.length], next);
        }}
      >
        <Plus size={12} aria-hidden />
        Add effect
      </Button>
      {at(effectsPath)}
    </Section>
  );

  const brewingSection = (
    <Section title="Brewing" testId="potion-brewing">
      <div className="flex flex-wrap items-end gap-2">
        <IdField
          label="Ingredient (empty: not brewed)"
          value={typeof brewing?.reagent === 'string' ? brewing.reagent : ''}
          registry="item"
          suggest={suggest}
          testId="potion-brewing-reagent"
          onCommit={(value) =>
            value === '' ? set(['brewing'], undefined) : set(['brewing', 'reagent'], value)
          }
        />
        {brewing !== undefined && (
          <IdField
            label={`Added to (default ${DEFAULT_BREWING_BASE})`}
            value={typeof brewing.base === 'string' ? brewing.base : ''}
            registry="potion"
            suggest={suggest}
            testId="potion-brewing-base"
            onCommit={(value) => set(['brewing', 'base'], value === '' ? undefined : value)}
          />
        )}
      </div>
      {at(['brewing', 'reagent'])}
      {at(['brewing', 'base'])}
      {brewing === undefined && (
        <p className="text-muted text-xs" data-testid="potion-not-brewed">
          Not brewed: the potion is only in the creative inventory, loot and commands until it has
          an ingredient.
        </p>
      )}

      <CheckField
        label="Longer version"
        checked={long !== undefined}
        testId="potion-long"
        onChange={(checked) => set(['long'], checked ? newLongVersion(element.data) : undefined)}
      />
      {long !== undefined && (
        <div className="flex flex-wrap items-end gap-2 pl-4">
          <DurationField
            label="Longer time (ticks)"
            value={long.duration_ticks}
            testId="potion-long-duration"
            onCommit={(value) =>
              set(['long', 'duration_ticks'], value, typingKey('/long/duration_ticks'))
            }
          />
          <IdField
            label={`Ingredient (default ${DEFAULT_LONG_REAGENT})`}
            value={typeof long.reagent === 'string' ? long.reagent : ''}
            registry="item"
            suggest={suggest}
            testId="potion-long-reagent"
            onCommit={(value) => set(['long', 'reagent'], value === '' ? undefined : value)}
          />
        </div>
      )}
      {at(['long', 'duration_ticks'])}
      {at(['long', 'reagent'])}

      <CheckField
        label="Stronger version"
        checked={strong !== undefined}
        testId="potion-strong"
        onChange={(checked) =>
          set(['strong'], checked ? newStrongVersion(element.data) : undefined)
        }
      />
      {strong !== undefined && (
        <div className="flex flex-wrap items-end gap-2 pl-4">
          <LevelField
            label="Stronger level"
            amplifier={strong.amplifier}
            testId="potion-strong-level"
            onCommit={(value) =>
              set(['strong', 'amplifier'], value ?? 0, typingKey('/strong/amplifier'))
            }
          />
          <DurationField
            label="Stronger time (ticks)"
            value={strong.duration_ticks}
            testId="potion-strong-duration"
            onCommit={(value) =>
              set(['strong', 'duration_ticks'], value, typingKey('/strong/duration_ticks'))
            }
          />
          <IdField
            label={`Ingredient (default ${DEFAULT_STRONG_REAGENT})`}
            value={typeof strong.reagent === 'string' ? strong.reagent : ''}
            registry="item"
            suggest={suggest}
            testId="potion-strong-reagent"
            onCommit={(value) => set(['strong', 'reagent'], value === '' ? undefined : value)}
          />
        </div>
      )}
      {at(['strong', 'amplifier'])}
      {at(['strong', 'duration_ticks'])}
      {at(['strong', 'reagent'])}

      <CheckField
        label="Splash version (gunpowder)"
        checked={data.splash !== false}
        testId="potion-splash"
        onChange={(checked) => set(['splash'], checked ? undefined : false)}
      />
      <CheckField
        label="Lingering version and tipped arrows (dragon's breath)"
        checked={data.lingering !== false}
        testId="potion-lingering"
        onChange={(checked) => set(['lingering'], checked ? undefined : false)}
      />
    </Section>
  );

  const chain = (
    <Section title="Brewing chain" testId="potion-chain">
      {steps.length === 0 ? (
        <p className="text-muted text-xs">No brewing stand steps.</p>
      ) : (
        <ol className="flex flex-col gap-0.5 text-xs" data-testid="potion-chain-steps">
          {steps.map((step) => {
            const words = stepSummary(step);
            return (
              <li key={step.file} className="flex flex-wrap items-center gap-1" title={step.file}>
                <span>{words.input}</span>
                <span className="text-muted">+ {words.reagent}</span>
                <ArrowRight size={12} aria-label="gives" />
                <span>{words.output}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );

  return (
    <section aria-label="Potion Studio" data-testid="potion-studio" className="flex flex-col gap-4">
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="potion-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      {preview}
      {general}
      {effectsSection}
      {brewingSection}
      {chain}
    </section>
  );
}
