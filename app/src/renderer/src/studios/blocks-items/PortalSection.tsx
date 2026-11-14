/**
 * The Block Studio's Portal section (B337, ADR 0078 D1), loaded with `React.lazy` and shown
 * only for `type: portal` (format ADR 0077 D1), in three groups:
 *
 * - Frame: the frame block or `#tag`, "Exit portals are built of" for a tag frame, and "Light
 *   it with" (an item or `#tag`) or "Nothing: a trigger lights it" (`igniter: false`).
 * - Travel: the destination and "Comes back to" (project and vanilla dimensions), "Scale"
 *   (from the dimensions, or a number with "8:1 like the Nether"), "Arrive" (in a linked
 *   portal or on the ground), delay, cooldown, "Players only", "Wobble and overlay" and "On
 *   travel" (an event of the block; its actions are edited in the Events section).
 * - Looks: particle type, "Colour" for dust, particles per tick, and the ambient and travel
 *   sounds, each with "None".
 *
 * Every change is one undoable edit; clearing a group's last field removes the group. The
 * model is `portal-model.ts`; the default sounds and particle come from the target's block
 * facts (`Target.blocks.portal`).
 *
 * @packageDocumentation
 */

import type { Element, Json } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { useId } from 'react';
import { buttonClass } from '../../components/ui/Button';
import { type FormProblem, inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { asObject, eventNames, pointerOf } from './blocks-items-model';
import { particlesFirst } from './particle-model';
import { CheckField, EventSelect, ProblemsAt } from './parts';
import {
  ARRIVAL_LABELS,
  ARRIVALS,
  colourFromHex,
  colourHex,
  DEFAULT_PARTICLE_COUNT,
  DEFAULT_PORTAL_IGNITER,
  DEFAULT_PORTAL_RETURN_TO,
  dimensionChoices,
  groupEdit,
  isTagId,
  litByTriggerOnly,
  NETHER_SCALE,
  type PortalGroup,
  SCALE_MODE_LABELS,
  SCALE_MODES,
  type ScaleMode,
  scaleModeOf,
  takesColour,
  textOf,
  withFrame,
} from './portal-model';

type Setter = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

/** Props of {@link PortalSection}. */
export interface PortalSectionProps {
  element: Element;
  target: Target;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  /** Sets one path as one edit (`coalesce` merges typing). */
  set: Setter;
  /** Replaces the whole element data as one edit. */
  replace(data: Json): void;
}

/** A select over labelled choices; a value outside them is kept as an option. */
function ChoiceField(props: {
  label: string;
  value: string;
  labels: Readonly<Record<string, string>>;
  order: readonly string[];
  testId: string;
  onChange(value: string): void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={props.testId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {!props.order.includes(props.value) && <option value={props.value}>{props.value}</option>}
        {props.order.map((value) => (
          <option key={value} value={value}>
            {props.labels[value] ?? value}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A sound picker with "None" (`false`); empty uses the default. */
function SoundField(props: {
  label: string;
  value: Json | undefined;
  fallback: string | undefined;
  suggest(registry: string, prefix: string): string[];
  testId: string;
  onChange(value: Json | undefined): void;
}) {
  const none = props.value === false;
  return (
    <div className="flex flex-wrap items-end gap-2">
      {!none && (
        <IdField
          className="w-72"
          label={props.label}
          value={textOf(props.value)}
          registry="sound_event"
          suggest={props.suggest}
          testId={props.testId}
          onCommit={(text) => props.onChange(text === '' ? undefined : text)}
        />
      )}
      <CheckField
        label={none ? `${props.label}: none` : 'None'}
        checked={none}
        testId={`${props.testId}-none`}
        onChange={(checked) => props.onChange(checked ? false : undefined)}
      />
      {!none && textOf(props.value) === '' && props.fallback !== undefined && (
        <span className="text-muted text-xs">Empty: {props.fallback}</span>
      )}
    </div>
  );
}

export function PortalSection(props: PortalSectionProps) {
  const { element, target, problems, suggest, set, replace } = props;
  const data = element.data;
  const object = asObject(data);
  const travel = asObject(object.travel);
  const sounds = asObject(object.sounds);
  const particles = asObject(object.particles);
  const events = eventNames(data);
  const facts = target.blocks?.portal;
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );
  /** Sets one field of a group; clearing the group's last field removes the group. */
  const setIn = (group: PortalGroup, key: string, value: Json | undefined, typing = false) => {
    const edit = groupEdit(data, group, key, value);
    set(edit.path, edit.value, typing ? typingKey(`/${group}/${key}`) : undefined);
  };
  const frame = textOf(object.frame);
  const triggerOnly = litByTriggerOnly(data);
  const dimensions = dimensionChoices(suggest('dimension', ''));
  const scaleMode = scaleModeOf(data);
  const colour = colourHex(particles.color);

  const frameGroup = (
    <div className="flex flex-col gap-2" data-testid="block-portal-frame-group">
      <h4 className="font-medium text-xs">Frame</h4>
      <div className="flex flex-wrap items-end gap-2">
        <IdField
          className="w-72"
          label="Frame block or #tag"
          value={frame}
          registry="block"
          suggest={suggest}
          testId="block-portal-frame"
          onCommit={(text) => replace(withFrame(data, text))}
        />
        {isTagId(frame) && (
          <IdField
            className="w-72"
            label="Exit portals are built of"
            value={textOf(object.frame_block)}
            registry="block"
            suggest={suggest}
            testId="block-portal-frame-block"
            onCommit={(text) => set(['frame_block'], text === '' ? undefined : text)}
          />
        )}
      </div>
      {at(['frame'])}
      {at(['frame_block'])}
      <p className="text-muted text-xs">
        A standing rectangle of the frame, 2 to 21 blocks wide and 3 to 21 high inside; corners are
        not needed.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {!triggerOnly && (
          <IdField
            className="w-72"
            label="Light it with (item or #tag)"
            value={textOf(object.igniter)}
            registry="item"
            suggest={suggest}
            testId="block-portal-igniter"
            onCommit={(text) => set(['igniter'], text === '' ? undefined : text)}
          />
        )}
        <CheckField
          label="Nothing: a trigger lights it"
          checked={triggerOnly}
          testId="block-portal-igniter-none"
          onChange={(checked) => set(['igniter'], checked ? false : undefined)}
        />
      </div>
      <p className="text-muted text-xs">
        {triggerOnly
          ? 'Only a "Light a portal" action lights the frame, from any event of a block, item or effect.'
          : `Empty: ${DEFAULT_PORTAL_IGNITER}. A "Light a portal" action lights it too.`}
      </p>
      {at(['igniter'])}
    </div>
  );

  const travelGroup = (
    <div className="flex flex-col gap-2" data-testid="block-portal-travel-group">
      <h4 className="font-medium text-xs">Travel</h4>
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label="Destination"
          value={textOf(object.destination) || undefined}
          choices={dimensions}
          emptyLabel="(choose a dimension)"
          testId="block-portal-destination"
          onChange={(value) => set(['destination'], value)}
        />
        <SelectField
          label="Comes back to"
          value={textOf(object.return_to) || undefined}
          choices={dimensions}
          emptyLabel={`(default: ${DEFAULT_PORTAL_RETURN_TO})`}
          testId="block-portal-return-to"
          onChange={(value) => set(['return_to'], value)}
        />
      </div>
      {at(['destination'])}
      {at(['return_to'])}
      <div className="flex flex-wrap items-end gap-2">
        <ChoiceField
          label="Scale"
          value={scaleMode}
          labels={SCALE_MODE_LABELS}
          order={SCALE_MODES}
          testId="block-portal-scale-mode"
          onChange={(value) => {
            if (value === scaleMode) return;
            setIn('travel', 'scale', (value as ScaleMode) === 'number' ? 1 : undefined);
          }}
        />
        {scaleMode === 'number' && (
          <NumberField
            label="Blocks back home per block there"
            value={travel.scale}
            allowEmpty
            testId="block-portal-scale"
            onCommit={(value) => setIn('travel', 'scale', value, true)}
          />
        )}
        <button
          type="button"
          className={buttonClass}
          data-testid="block-portal-scale-nether"
          disabled={travel.scale === NETHER_SCALE}
          onClick={() => setIn('travel', 'scale', NETHER_SCALE)}
        >
          8:1 like the Nether
        </button>
      </div>
      <p className="text-muted text-xs">
        {scaleMode === 'dimensions'
          ? "From the two dimensions' types: 8 to 1 between the overworld and the Nether, else 1 to 1."
          : 'One block in the destination is this many blocks in the dimension it comes back to.'}
      </p>
      {at(['travel', 'scale'])}
      <div className="flex flex-wrap items-end gap-2">
        <ChoiceField
          label="Arrive"
          value={textOf(travel.arrival) || 'portal'}
          labels={ARRIVAL_LABELS}
          order={ARRIVALS}
          testId="block-portal-arrival"
          onChange={(value) => setIn('travel', 'arrival', value === 'portal' ? undefined : value)}
        />
        <NumberField
          label="Delay (ticks)"
          value={travel.delay_ticks}
          integer
          allowEmpty
          testId="block-portal-delay"
          onCommit={(value) => setIn('travel', 'delay_ticks', value, true)}
        />
        <NumberField
          label="Cooldown (ticks)"
          value={travel.cooldown_ticks}
          integer
          allowEmpty
          testId="block-portal-cooldown"
          onCommit={(value) => setIn('travel', 'cooldown_ticks', value, true)}
        />
      </div>
      <p className="text-muted text-xs">
        {travel.arrival === 'surface'
          ? 'Travellers land on the ground near the same place; no exit portal is built.'
          : 'Travellers arrive in a linked exit portal, built of the frame block when none is near.'}{' '}
        The delay is for survival players (empty: the game rule, 80 ticks in vanilla); creative
        players keep their game rule and other entities travel at once. Empty cooldown: vanilla's.
      </p>
      {['arrival', 'delay_ticks', 'cooldown_ticks'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['travel', key])} />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <CheckField
          label="Players only"
          checked={travel.players_only === true}
          testId="block-portal-players-only"
          onChange={(checked) => setIn('travel', 'players_only', checked ? true : undefined)}
        />
        <CheckField
          label="Wobble and overlay"
          checked={travel.overlay !== false}
          testId="block-portal-overlay"
          onChange={(checked) => setIn('travel', 'overlay', checked ? undefined : false)}
        />
      </div>
      <p className="text-muted text-xs">
        The wobble, overlay and entry sound are the Nether portal's own.
      </p>
      {['players_only', 'overlay'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['travel', key])} />
      ))}
      {at(['travel'])}
      <EventSelect
        label="On travel"
        value={object.on_travel}
        events={events}
        testId="block-portal-on-travel"
        onChange={(value) => set(['on_travel'], value)}
      />
      <p className="text-muted text-xs">
        Runs after arrival, with the traveller as both entities. Add the event and its actions in
        the Events section below.
      </p>
      {at(['on_travel'])}
    </div>
  );

  const looksGroup = (
    <div className="flex flex-col gap-2" data-testid="block-portal-looks-group">
      <h4 className="font-medium text-xs">Looks</h4>
      <div className="flex flex-wrap items-end gap-2">
        <IdField
          className="w-72"
          label="Particle type"
          value={textOf(particles.type)}
          registry="particle_type"
          suggest={particlesFirst(suggest)}
          testId="block-portal-particle"
          onCommit={(text) => setIn('particles', 'type', text === '' ? undefined : text)}
        />
        <NumberField
          label="Particles per tick"
          value={particles.count}
          integer
          allowEmpty
          testId="block-portal-particle-count"
          onCommit={(value) => setIn('particles', 'count', value, true)}
        />
      </div>
      <p className="text-muted text-xs">
        Empty type: {facts?.particle ?? "the game's portal particle"}. Empty count:{' '}
        {DEFAULT_PARTICLE_COUNT}; 0 shows none.
      </p>
      {takesColour(data) && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted">Colour</span>
            <input
              type="color"
              aria-label="Colour"
              data-testid="block-portal-colour"
              value={colour ?? '#8030e0'}
              onChange={(event) => {
                const value = colourFromHex(event.target.value);
                if (value !== undefined) setIn('particles', 'color', value, true);
              }}
            />
          </label>
          <button
            type="button"
            className={buttonClass}
            data-testid="block-portal-colour-clear"
            disabled={colour === undefined}
            onClick={() => setIn('particles', 'color', undefined)}
          >
            No colour
          </button>
          <span className="text-muted text-xs" data-testid="block-portal-colour-label">
            {colour === undefined
              ? 'No colour: the particle type above.'
              : `Coloured dust ${colour}.`}
          </span>
        </div>
      )}
      {['type', 'count', 'color'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['particles', key])} />
      ))}
      {at(['particles'])}
      <SoundField
        label="Ambient sound"
        value={sounds.ambient}
        fallback={facts?.ambientSound}
        suggest={suggest}
        testId="block-portal-ambient-sound"
        onChange={(value) => setIn('sounds', 'ambient', value)}
      />
      <SoundField
        label="Travel sound"
        value={sounds.travel}
        fallback={facts?.travelSound}
        suggest={suggest}
        testId="block-portal-travel-sound"
        onChange={(value) => setIn('sounds', 'travel', value)}
      />
      {['ambient', 'travel'].map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['sounds', key])} />
      ))}
      {at(['sounds'])}
    </div>
  );

  return (
    <Section title="Portal" testId="block-portal">
      <p className="text-muted text-xs">
        Players build the frame and light it; the portal block fills it and takes entities to the
        destination and back. Portals need the Fabric mod jar.
      </p>
      {frameGroup}
      {travelGroup}
      {looksGroup}
    </Section>
  );
}

export default PortalSection;
