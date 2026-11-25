/**
 * Fluid Studio (ADR 0099 D1, ADR 0101 D1) for `msm:fluid` element data, loaded lazily:
 *
 * - "Preview": the still and flowing pictures with the tint multiplied over them (the overlay and
 *   the bucket beside them), vanilla water's or lava's pictures from the user's game where the
 *   fluid has none of its own (`fluid-model.ts`).
 * - "Liquid": names (the liquid and its bucket), what it behaves like, the colour, light and
 *   explosion resistance.
 * - "Flow": sliders in blocks a second and blocks, and whether two sources make a new one, with
 *   the defaults of "Behaves like" shown while a field is unset.
 * - "Pictures": the still, flowing, overlay and bucket pictures.
 * - "Something inside": the event fired while a mob or player is in the liquid.
 * - "Mixing" (ADR 0108 D1, B538): what forms where the liquid meets water, lava or another
 *   liquid, one rule a row ("Mixes with", "Source becomes", "Flowing becomes").
 * - "Cauldron and bottle" (ADR 0108 D2, D3, B538): "Has a cauldron" (with "Fills in levels",
 *   never on a lava-like liquid) and "Has a bottle" (its food, picture, name and "When drunk").
 *
 * Everything else is in "Every setting".
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { FLUID_FLOW_DEFAULTS, fluidBucketId } from '@msm/plugin-blocks-items';
import { Plus, X } from 'lucide-react';
import { useId } from 'react';
import { thingName } from '../../components/thing-picker/thing-sources';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { InMore } from '../../components/ui/MoreOptions';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { IdField, NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { Section } from '../worldgen/parts';
import { asObject, pathSetter, pointerOf } from './blocks-items-model';
import { FluidPictures, fluidSpreadWords } from './FluidPicture';
import {
  FLOW_RANGES,
  FLUID_BEHAVIOUR_LABELS,
  FLUID_BEHAVIOURS,
  fluidPreviewOf,
  MIXING_WITH_LABELS,
  mixingRulesOf,
  speedWords,
  spreadWords,
  tintFromColour,
  withMixingRule,
} from './fluid-model';
import { CheckField, EventSelect, ProblemsAt, TextField } from './parts';

/** A labelled slider over a whole number. */
function Slider(props: {
  label: string;
  words: string;
  value: number;
  min: number;
  max: number;
  testId: string;
  onChange(value: number): void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={props.min}
          max={props.max}
          step={1}
          value={props.value}
          data-testid={props.testId}
          onChange={(event) => props.onChange(Number(event.target.value))}
        />
        <span data-testid={`${props.testId}-words`}>{props.words}</span>
      </div>
    </div>
  );
}

/** The Fluid Studio. */
export default function FluidStudio(props: StudioProps) {
  const { project, element, problems, suggest, onChange, target } = props;
  const behaviourId = useId();
  const colourId = useId();
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  const preview = fluidPreviewOf(element.data);
  const flow = asObject(data.flow);
  const defaults = FLUID_FLOW_DEFAULTS[preview.behaviour];
  const name =
    typeof data.display_name === 'string' && data.display_name.trim() !== ''
      ? data.display_name
      : 'Liquid';
  let bucketId = '';
  try {
    bucketId = fluidBucketId(element.id);
  } catch {
    bucketId = '';
  }
  const events = Object.keys(asObject(data.events));
  /** Sets one flow field; removes `flow` when nothing is left. */
  const setFlow = (key: string, value: number | boolean | undefined) => {
    const rest = { ...flow };
    if (value === undefined) delete rest[key];
    else rest[key] = value;
    if (Object.keys(rest).length === 0) set(['flow'], undefined);
    else set(['flow', key], value, typingKey(pointerOf(['flow', key])));
  };
  const texture = (slot: 'still' | 'flowing' | 'overlay' | 'bucket' | 'bottle') => {
    const value = asObject(data.textures)[slot];
    return typeof value === 'string' ? value : '';
  };
  const setTexture = (slot: string, value: string) => {
    const textures = { ...asObject(data.textures) };
    if (value === '') delete textures[slot];
    else textures[slot] = value;
    set(['textures'], Object.keys(textures).length === 0 ? undefined : textures);
  };

  const previewSection = (
    <Section title="Preview" testId="fluid-preview">
      <FluidPictures element={element} />
      {target.blocks?.fluidModel === 'two_fluids' && (
        <p className="text-muted text-xs" data-testid="fluid-two-fluids">
          Minecraft {target.mcVersion} keeps still and flowing liquid apart; both are made for you.
        </p>
      )}
    </Section>
  );

  const liquid = (
    <Section title="Liquid" testId="fluid-liquid">
      <TextField
        label="Name"
        value={data.display_name}
        testId="fluid-name"
        placeholder="Swamp Water"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <TextField
        label="Bucket name"
        value={data.bucket_display_name}
        testId="fluid-bucket-name"
        placeholder={`${name} Bucket`}
        onCommit={(value) => set(['bucket_display_name'], value, typingKey('/bucket_display_name'))}
      />
      {bucketId !== '' && (
        <InMore>
          <p className="text-muted text-xs" data-testid="fluid-also-makes">
            Also makes: {bucketId}
          </p>
        </InMore>
      )}
      <div className="flex min-w-0 flex-col gap-0.5 text-xs">
        <label htmlFor={behaviourId} className="text-muted">
          Behaves like
        </label>
        <select
          id={behaviourId}
          className={inputClass}
          data-testid="fluid-behaves-like"
          value={preview.behaviour}
          onChange={(event) =>
            set(['behaves_like'], event.target.value === 'water' ? undefined : event.target.value)
          }
        >
          {FLUID_BEHAVIOURS.map((value) => (
            <option key={value} value={value}>
              {FLUID_BEHAVIOUR_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      {at(['behaves_like'])}
      <div className="flex flex-wrap items-end gap-2">
        <CheckField
          label="Coloured"
          checked={preview.tint !== undefined}
          testId="fluid-tint-on"
          onChange={(checked) => set(['tint'], checked ? 0x3f76e4 : undefined)}
        />
        {preview.tint !== undefined && (
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <label htmlFor={colourId} className="text-muted">
              Colour
            </label>
            <input
              id={colourId}
              type="color"
              data-testid="fluid-tint"
              value={preview.tint}
              onChange={(event) => {
                const tint = tintFromColour(event.target.value);
                if (tint !== undefined) set(['tint'], tint, typingKey('/tint'));
              }}
            />
          </div>
        )}
        <NumberField
          label="Explosion resistance"
          value={data.explosion_resistance}
          allowEmpty
          testId="fluid-explosion-resistance"
          onCommit={(value) =>
            set(['explosion_resistance'], value, typingKey('/explosion_resistance'))
          }
        />
      </div>
      {at(['tint'])}
      <Slider
        label="Light"
        words={preview.light === 0 ? 'No light' : `Light level ${preview.light}`}
        value={preview.light}
        min={FLOW_RANGES.light.min}
        max={FLOW_RANGES.light.max}
        testId="fluid-light"
        onChange={(value) => set(['light'], value === 0 ? undefined : value, typingKey('/light'))}
      />
      {at(['light'])}
    </Section>
  );

  const flowSection = (
    <Section title="Flow" testId="fluid-flow">
      <Slider
        label="Speed"
        words={speedWords(preview.flow.tickDelay)}
        value={preview.flow.tickDelay}
        min={FLOW_RANGES.tickDelay.min}
        max={FLOW_RANGES.tickDelay.max}
        testId="fluid-flow-speed"
        onChange={(value) => setFlow('tick_delay', value)}
      />
      <Slider
        label="How far it spreads"
        words={spreadWords(preview.flow.dropOff)}
        value={FLOW_RANGES.dropOff.max + FLOW_RANGES.dropOff.min - preview.flow.dropOff}
        min={FLOW_RANGES.dropOff.min}
        max={FLOW_RANGES.dropOff.max}
        testId="fluid-flow-spread"
        // The slider grows with the distance, so it runs against `drop_off`.
        onChange={(value) =>
          setFlow('drop_off', FLOW_RANGES.dropOff.max + FLOW_RANGES.dropOff.min - value)
        }
      />
      <Slider
        label="Looks for a way down"
        words={`up to ${preview.flow.slopeDistance} ${preview.flow.slopeDistance === 1 ? 'block' : 'blocks'} away`}
        value={preview.flow.slopeDistance}
        min={FLOW_RANGES.slopeDistance.min}
        max={FLOW_RANGES.slopeDistance.max}
        testId="fluid-flow-slope"
        onChange={(value) => setFlow('slope_distance', value)}
      />
      <CheckField
        label="Two sources side by side make a new source"
        checked={preview.flow.infinite}
        testId="fluid-flow-infinite"
        onChange={(checked) => setFlow('infinite', checked)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted text-xs">
          Like {preview.behaviour === 'lava' ? 'lava' : 'water'} unless changed:{' '}
          {speedWords(defaults.tickDelay)}, {fluidSpreadWords(defaults.dropOff)}.
        </p>
        <Button
          className="text-xs"
          data-testid="fluid-flow-defaults"
          disabled={data.flow === undefined}
          onClick={() => set(['flow'], undefined)}
        >
          Use the defaults
        </Button>
      </div>
      {at(['flow'])}
      {(['tick_delay', 'slope_distance', 'drop_off', 'infinite'] as const).map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['flow', key])} />
      ))}
    </Section>
  );

  const pictures = (
    <Section title="Pictures" testId="fluid-pictures">
      {(
        [
          ['still', 'Still surface'],
          ['flowing', 'Flowing surface'],
          ['overlay', 'Overlay, beside glass (optional)'],
          ['bucket', 'Bucket'],
        ] as const
      ).map(([slot, label]) => (
        <IdField
          key={slot}
          label={label}
          value={texture(slot)}
          registry="texture"
          suggest={suggest}
          testId={`fluid-texture-${slot}`}
          onCommit={(value) => setTexture(slot, value)}
        />
      ))}
      {at(['textures'])}
      <p className="text-muted text-xs">
        Empty pictures use {preview.behaviour === 'lava' ? 'lava' : 'water'}'s from your game. A
        picture with an animation file beside it moves, as water does.
      </p>
    </Section>
  );

  const inside = (
    <Section title="Something inside" testId="fluid-inside">
      <EventSelect
        label="While a mob or player is in it"
        value={data.on_entity_inside}
        events={events}
        testId="fluid-on-entity-inside"
        onChange={(value) => set(['on_entity_inside'], value)}
      />
      {at(['on_entity_inside'])}
      <p className="text-muted text-xs">
        Runs at most twice a second for each mob or player. Make the event in Every setting, at the
        bottom.
      </p>
    </Section>
  );

  const rules = mixingRulesOf(element.data);
  const otherFluids = project.namespaces.flatMap((namespace) =>
    namespace.elements
      .filter((entry) => entry.kind === element.kind && entry.id !== element.id)
      .map((entry) => entry.id),
  );
  const setRules = (next: readonly Json[]) =>
    set(['mixing'], next.length === 0 ? undefined : [...next]);
  const mixing = (
    <Section title="Mixing" testId="fluid-mixing">
      <p className="text-muted text-xs">
        Where {name} meets another liquid, the part it touches turns into a block, as lava turns
        into obsidian or cobblestone where water meets it.
      </p>
      {rules.length === 0 && (
        <p className="text-muted text-xs" data-testid="fluid-mixing-none">
          {preview.behaviour === 'lava'
            ? 'No rules: it keeps the game’s own lava behaviour, which differs between Minecraft versions.'
            : 'No rules: it does not mix.'}
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {rules.map((rule, index) => (
          <MixingRow
            key={index}
            index={index}
            rule={rule}
            others={otherFluids}
            name={(id) => thingName(project, id)}
            suggest={suggest}
            onChange={(next) => setRules(withMixingRule(rules, index, next))}
            onRemove={() => setRules(rules.filter((_, at) => at !== index))}
          />
        ))}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid="fluid-mixing-add"
        disabled={rules.length >= 16}
        onClick={() =>
          setRules([
            ...rules,
            preview.behaviour === 'lava'
              ? { with: 'water', source: 'minecraft:obsidian', flowing: 'minecraft:cobblestone' }
              : { with: 'lava', source: 'minecraft:stone' },
          ])
        }
      >
        <Plus size={12} aria-hidden />
        Add a mixing rule
      </Button>
      {at(['mixing'])}
      {rules.map((_, index) => (
        <ProblemsAt key={index} problems={problems} pointer={pointerOf(['mixing', index])} />
      ))}
    </Section>
  );

  const hasCauldron = data.cauldron !== undefined;
  const hasBottle = data.bottle !== undefined;
  const bottle = asObject(data.bottle);
  const food = asObject(bottle.food);
  const cauldronBottle = (
    <Section title="Cauldron and bottle" testId="fluid-cauldron-bottle">
      <CheckField
        label="Has a cauldron"
        checked={hasCauldron}
        testId="fluid-cauldron-on"
        onChange={(checked) => set(['cauldron'], checked ? {} : undefined)}
      />
      {hasCauldron && (
        <>
          {preview.behaviour === 'lava' ? (
            <p className="text-muted text-xs" data-testid="fluid-cauldron-full-only">
              Like lava, its cauldron is always full: a bucket fills or empties it.
            </p>
          ) : (
            <CheckField
              label="Fills in levels (a bottle takes or adds one, as water does)"
              checked={asObject(data.cauldron).levels === true}
              testId="fluid-cauldron-levels"
              onChange={(checked) => set(['cauldron', 'levels'], checked ? true : undefined)}
            />
          )}
          <TextField
            label="Cauldron name"
            value={data.cauldron_display_name}
            testId="fluid-cauldron-name"
            placeholder={`${name} Cauldron`}
            onCommit={(value) =>
              set(['cauldron_display_name'], value, typingKey('/cauldron_display_name'))
            }
          />
          <p className="text-muted text-xs">
            Its bucket fills Minecraft's cauldron, and a mob or player inside gets the same event as
            in the liquid.
          </p>
        </>
      )}
      {at(['cauldron'])}
      <CheckField
        label="Has a bottle"
        checked={hasBottle}
        testId="fluid-bottle-on"
        onChange={(checked) => set(['bottle'], checked ? {} : undefined)}
      />
      {hasBottle && (
        <>
          <p className="text-muted text-xs">
            A glass bottle used on the liquid fills it. It is drunk like a potion and gives the
            glass bottle back.
          </p>
          <TextField
            label="Bottle name"
            value={data.bottle_display_name}
            testId="fluid-bottle-name"
            placeholder={`Bottle of ${name}`}
            onCommit={(value) =>
              set(['bottle_display_name'], value, typingKey('/bottle_display_name'))
            }
          />
          <IdField
            label="Bottle picture (empty: a potion bottle in its colour)"
            value={texture('bottle')}
            registry="texture"
            suggest={suggest}
            testId="fluid-texture-bottle"
            onCommit={(value) => setTexture('bottle', value)}
          />
          <CheckField
            label="Fills hunger when drunk"
            checked={bottle.food !== undefined}
            testId="fluid-bottle-food-on"
            onChange={(checked) =>
              set(['bottle', 'food'], checked ? { nutrition: 2, saturation: 0.3 } : undefined)
            }
          />
          {bottle.food !== undefined && (
            <div className="flex flex-wrap items-end gap-2">
              <NumberField
                label="Hunger restored"
                value={food.nutrition}
                integer
                testId="fluid-bottle-nutrition"
                onCommit={(value) =>
                  set(['bottle', 'food', 'nutrition'], value, typingKey('/bottle/food/nutrition'))
                }
              />
              <NumberField
                label="Saturation"
                value={food.saturation}
                testId="fluid-bottle-saturation"
                onCommit={(value) =>
                  set(['bottle', 'food', 'saturation'], value, typingKey('/bottle/food/saturation'))
                }
              />
            </div>
          )}
          <EventSelect
            label="When drunk"
            value={bottle.on_drink}
            events={events}
            testId="fluid-bottle-on-drink"
            onChange={(value) => set(['bottle', 'on_drink'], value)}
          />
          <p className="text-muted text-xs">Effects to give are in Every setting, at the bottom.</p>
        </>
      )}
      {at(['bottle'])}
      {at(['bottle', 'food'])}
      {at(['bottle', 'on_drink'])}
    </Section>
  );

  return (
    <section aria-label="Fluid Studio" data-testid="fluid-studio" className="flex flex-col gap-4">
      <ProblemsAt problems={problems} pointer="" />
      {previewSection}
      {liquid}
      {flowSection}
      {pictures}
      {inside}
      {mixing}
      {cauldronBottle}
    </section>
  );
}

/** One mixing rule: what it meets and the two blocks it can become. */
function MixingRow(props: {
  index: number;
  rule: { [key: string]: Json };
  others: readonly string[];
  name(id: string): string;
  suggest: StudioProps['suggest'];
  onChange(next: { [key: string]: Json }): void;
  onRemove(): void;
}) {
  const withId = useId();
  const { rule } = props;
  const meets = typeof rule.with === 'string' ? rule.with : 'water';
  const choices = ['water', 'lava', ...props.others];
  if (!choices.includes(meets)) choices.push(meets);
  const field = (key: 'source' | 'flowing', value: string) => {
    const next = { ...rule };
    if (value === '') delete next[key];
    else next[key] = value;
    props.onChange(next);
  };
  return (
    <li
      className="flex flex-wrap items-end gap-2 rounded border border-border p-2"
      data-testid={`fluid-mixing-${props.index}`}
    >
      <div className="flex min-w-0 flex-col gap-0.5 text-xs">
        <label htmlFor={withId} className="text-muted">
          Mixes with
        </label>
        <select
          id={withId}
          className={inputClass}
          data-testid={`fluid-mixing-${props.index}-with`}
          value={meets}
          onChange={(event) => props.onChange({ ...rule, with: event.target.value })}
        >
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {MIXING_WITH_LABELS[choice] ?? props.name(choice)}
            </option>
          ))}
        </select>
      </div>
      <IdField
        label="Source becomes"
        value={typeof rule.source === 'string' ? rule.source : ''}
        registry="block"
        suggest={props.suggest}
        testId={`fluid-mixing-${props.index}-source`}
        onCommit={(value) => field('source', value)}
      />
      <IdField
        label="Flowing becomes"
        value={typeof rule.flowing === 'string' ? rule.flowing : ''}
        registry="block"
        suggest={props.suggest}
        testId={`fluid-mixing-${props.index}-flowing`}
        onCommit={(value) => field('flowing', value)}
      />
      <button
        type="button"
        aria-label={`Remove mixing rule ${props.index + 1}`}
        data-testid={`fluid-mixing-${props.index}-remove`}
        className={iconButtonClass}
        onClick={props.onRemove}
      >
        <X size={12} aria-hidden />
      </button>
    </li>
  );
}
