/**
 * The Entity Studio's "Boss bar" section (B297, ADR 0071 D5): `msm:boss_bar` on or off, its
 * colour and style, darkening the sky, fog, boss music and the range.
 *
 * @packageDocumentation
 */

import { NumberField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import {
  ChoiceField,
  componentTools,
  DefaultCheck,
  FieldProblems,
  numberAt,
} from './MobKindSection';
import {
  BOSS_BAR_COLOUR_LABELS,
  BOSS_BAR_COLOURS,
  BOSS_BAR_OVERLAY_LABELS,
  BOSS_BAR_OVERLAYS,
  type MobSectionProps,
  newBossBar,
} from './mob-kinds';

const BOSS_BAR = 'msm:boss_bar';
const FIELDS = ['colour', 'overlay', 'darken_sky', 'fog', 'music', 'range'] as const;

/** The "Boss bar" section. */
export function BossBarSection(props: MobSectionProps) {
  const tools = componentTools(props, BOSS_BAR);
  const { value } = tools;
  return (
    <Section title="Boss bar" testId="entity-boss-bar">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-boss-bar-enabled"
          checked={tools.on}
          onChange={(event) => tools.toggle(event.target.checked, newBossBar)}
        />
        Shows a boss bar
      </label>
      {tools.on ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <ChoiceField
              label="Bar colour"
              value={typeof value.colour === 'string' ? value.colour : 'purple'}
              choices={BOSS_BAR_COLOURS}
              labels={BOSS_BAR_COLOUR_LABELS}
              testId="entity-boss-bar-colour"
              onChange={(next) => tools.setField('colour', next === 'purple' ? undefined : next)}
            />
            <ChoiceField
              label="Bar style"
              value={typeof value.overlay === 'string' ? value.overlay : 'progress'}
              choices={BOSS_BAR_OVERLAYS}
              labels={BOSS_BAR_OVERLAY_LABELS}
              testId="entity-boss-bar-overlay"
              onChange={(next) => tools.setField('overlay', next === 'progress' ? undefined : next)}
            />
            <NumberField
              label="Seen within (blocks)"
              value={numberAt(value, 'range')}
              allowEmpty
              testId="entity-boss-bar-range"
              onCommit={(next) => tools.setField('range', next, true)}
            />
          </div>
          <DefaultCheck
            label="Darkens the sky"
            value={value.darken_sky}
            fallback={false}
            testId="entity-boss-bar-darken"
            onChange={(next) => tools.setField('darken_sky', next)}
          />
          <DefaultCheck
            label="Fogs up the world"
            value={value.fog}
            fallback={false}
            testId="entity-boss-bar-fog"
            onChange={(next) => tools.setField('fog', next)}
          />
          <DefaultCheck
            label="Plays boss music"
            value={value.music}
            fallback={false}
            testId="entity-boss-bar-music"
            onChange={(next) => tools.setField('music', next)}
          />
          <p className="text-muted text-xs">
            The bar shows the mob’s health under its name. A boss never despawns. An empty range
            shows the bar to every player near enough to see the mob. Vanilla plays boss music only
            in the End.
          </p>
        </>
      ) : (
        <p className="text-muted text-xs">The mob has no boss bar.</p>
      )}
      <FieldProblems problems={props.problems} component={BOSS_BAR} keys={FIELDS} />
    </Section>
  );
}
