/**
 * Statistic Studio (ADR 0111 D6 as amended, ADR 0112 D1) for `msm:stat` element data, loaded
 * lazily: the statistic's name in the Statistics screen and how its number is shown ("Shown as":
 * a count, a distance in centimetres shown as metres, or a time in ticks shown as seconds and
 * minutes). Outside Very easy it also shows the scoreboard criterion the statistic is counted
 * under (`statCriterion`, `minecraft.custom:<ns>.<path>`), to copy into `/scoreboard`.
 *
 * Everything else stays behind "Advanced (all fields)".
 *
 * @packageDocumentation
 */

import { statCriterion } from '@msm/plugin-scripting';
import { useState } from 'react';
import { typingKey } from '../../forms/context';
import { asObject, pathSetter, pointerOf } from '../blocks-items/blocks-items-model';
import { ProblemsAt, TextField } from '../blocks-items/parts';
import { ChoiceField } from '../entities/MobKindSection';
import type { StudioProps } from '../types';
import { useVeryEasy } from '../very-easy';
import { AdvancedToggle, Section } from '../worldgen/parts';

/** The formatters (`StatFormatter`), with their words. */
export const STAT_FORMAT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  default: 'A count (1, 2, 3…)',
  distance: 'A distance (counted in centimetres, shown in metres)',
  time: 'A time (counted in ticks, shown in seconds and minutes)',
});

/** The scoreboard criterion of statistic `id`, or `undefined` for an unsafe id. */
export function statCriterionOf(id: string, target: StudioProps['target']): string | undefined {
  try {
    return statCriterion(id, target);
  } catch {
    return undefined;
  }
}

/** The Statistic Studio. */
export default function StatStudio(props: StudioProps) {
  const { element, problems, onChange, target } = props;
  const [advanced, setAdvanced] = useState(false);
  const veryEasy = useVeryEasy();
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  if (advanced) {
    return (
      <section
        aria-label="Statistic Studio"
        data-testid="stat-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="stat-advanced-toggle" />
        {props.form}
      </section>
    );
  }

  const formats = target.stats?.formats ?? Object.keys(STAT_FORMAT_LABELS);
  const criterion = statCriterionOf(element.id, target);

  const general = (
    <Section title="Statistic" testId="stat-general">
      <TextField
        label="Name"
        value={data.display_name}
        testId="stat-name"
        placeholder="Gems found"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <ChoiceField
        label="Shown as"
        value={typeof data.formatter === 'string' ? data.formatter : 'default'}
        choices={formats}
        labels={STAT_FORMAT_LABELS}
        testId="stat-format"
        onChange={(next) => set(['formatter'], next === 'default' ? undefined : next)}
      />
      {at(['formatter'])}
      <p className="text-muted text-xs">
        A count kept for each player, shown in the game's Statistics screen. Your rules add to it
        and check it.
      </p>
      {!veryEasy && criterion !== undefined && (
        <p className="text-muted text-xs" data-testid="stat-criterion">
          Scoreboard criterion: <code className="font-mono">{criterion}</code>
        </p>
      )}
    </Section>
  );

  return (
    <section
      aria-label="Statistic Studio"
      data-testid="stat-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="stat-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      {general}
    </section>
  );
}
