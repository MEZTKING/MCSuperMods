/**
 * Objective Studio (ADR 0117 D1, ADR 0113 D5; B555) for `msm:objective`, loaded lazily: the
 * score's name, what counts (changed only by rules, a criterion of the game, or a statistic of
 * the project), where it is shown ("Show in the sidebar", the player list, below names, or the
 * sidebar of one team colour), hearts or numbers, and how the numbers are written.
 *
 * Live view (ADR 0119 D1): "How the score looks", the sidebar, player list or name tag with
 * three example players' scores written by the number format, following every edit (about
 * right: the scores are examples). Try it shows the sidebar as the game plays (B558).
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { ReactNode } from 'react';
import { thingName } from '../../components/thing-picker/thing-sources';
import { InMore } from '../../components/ui/MoreOptions';
import { typingKey } from '../../forms/context';
import { CHAT_COLOURS } from '../../liveviews/data/lines/text-component';
import { LiveViewFrame } from '../../liveviews/frame/LiveViewFrame';
import { asObject, pathSetter } from '../blocks-items/blocks-items-model';
import { CheckField, TextField } from '../blocks-items/parts';
import { ChoiceField } from '../entities/MobKindSection';
import type { StudioProps } from '../types';
import { Section } from '../worldgen/parts';
import {
  criterionWords,
  displayWords,
  elementsOf,
  NUMBER_FORMAT_LABELS,
  numberFormatChoice,
  numberFormatFor,
  objectOf,
  RENDER_LABELS,
  STAT_KIND,
  scoreboardName,
  scoreText,
  TEAM_COLOUR_LABELS,
  TEAM_COLOURS,
  textOf,
} from './games-model';
import { CommandLines, GamesStudioShell } from './shell';

/** The example players of the live view, highest score first. */
export const EXAMPLE_SCORES: readonly { player: string; score: number }[] = Object.freeze([
  { player: 'Alex', score: 12 },
  { player: 'Steve', score: 7 },
  { player: 'You', score: 3 },
]);

/** One score as the number format writes it. */
function Score(props: { data: Json; score: number }) {
  const text = scoreText(props.data, props.score);
  return (
    <span
      data-testid="objective-live-score"
      style={{
        color: text.colour === null ? undefined : (CHAT_COLOURS[text.colour] ?? undefined),
        fontWeight: text.bold ? 700 : undefined,
        fontStyle: text.italic ? 'italic' : undefined,
      }}
    >
      {text.text}
    </span>
  );
}

/** The live view: where the score shows, with example scores. */
function ScoreLook(props: { data: Json }) {
  const data = objectOf(props.data);
  const display = textOf(data.display) || 'sidebar';
  const title = textOf(data.name) || 'Score';
  const hearts = data.render === 'hearts';
  let body: ReactNode;
  if (display === 'none') {
    body = (
      <p className="text-muted text-sm" data-testid="objective-live-hidden">
        This score is not shown anywhere. Your rules can still read and change it.
      </p>
    );
  } else if (display === 'list') {
    body = (
      <div
        className="flex flex-col gap-0.5 rounded bg-black/60 p-2"
        data-testid="objective-live-list"
      >
        {EXAMPLE_SCORES.map((row) => (
          <div key={row.player} className="flex justify-between gap-6 bg-white/10 px-1">
            <span>{row.player}</span>
            {hearts ? (
              <span className="text-[#ff5555]">{'♥'.repeat(Math.ceil(row.score / 2))}</span>
            ) : (
              <Score data={props.data} score={row.score} />
            )}
          </div>
        ))}
      </div>
    );
  } else if (display === 'below_name') {
    const first = EXAMPLE_SCORES[0] as { player: string; score: number };
    body = (
      <div className="flex flex-col items-center gap-0.5" data-testid="objective-live-below-name">
        <span className="rounded bg-black/50 px-2">{first.player}</span>
        <span className="rounded bg-black/50 px-2">
          <Score data={props.data} score={first.score} /> {title}
        </span>
      </div>
    );
  } else {
    body = (
      <div
        className="ml-auto flex min-w-40 flex-col bg-black/40 text-sm"
        data-testid="objective-live-sidebar"
      >
        <div className="bg-black/50 px-2 text-center" data-testid="objective-live-title">
          {title}
        </div>
        {EXAMPLE_SCORES.map((row) => (
          <div key={row.player} className="flex justify-between gap-4 px-2">
            <span>{row.player}</span>
            <Score data={props.data} score={row.score} />
          </div>
        ))}
      </div>
    );
  }
  const notes = ['The players and their scores are examples.'];
  if (display.startsWith('sidebar.team.')) {
    notes.push('Only players on a team of that colour see this sidebar.');
  }
  return (
    <LiveViewFrame title="How the score looks" fidelity="about_right" notes={notes}>
      <div className="flex rounded bg-[#3a5a2a] p-3 font-mono text-white">{body}</div>
    </LiveViewFrame>
  );
}

/** The Objective Studio. */
export default function ObjectiveStudio(props: StudioProps) {
  const { element, onChange, target, project } = props;
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const scoreboard = target.scoreboard;
  const criterion = textOf(data.criterion) || 'dummy';
  const prefix = target.stats?.criterionPrefix;
  const stats =
    prefix === undefined
      ? []
      : elementsOf(project, STAT_KIND).map((stat) => ({
          criterion: `${prefix}${stat.id.replace(':', '.')}`,
          name: thingName(project, stat.id),
        }));
  const plain = scoreboard?.criteria ?? ['dummy'];
  const criterionChoices = [...plain, ...stats.map((stat) => stat.criterion)];
  const criterionLabels: Record<string, string> = Object.fromEntries([
    ...plain.map((entry) => [entry, criterionWords(entry)]),
    ...stats.map((stat) => [stat.criterion, `Your statistic: ${stat.name}`]),
  ]);
  if (!criterionChoices.includes(criterion)) criterionLabels[criterion] = criterionWords(criterion);
  const displays = ['none', ...(scoreboard?.displaySlots ?? ['sidebar', 'list', 'below_name'])];
  const displayLabels = Object.fromEntries(displays.map((slot) => [slot, displayWords(slot)]));
  const format = numberFormatChoice(element.data);
  const formatObject = objectOf(data.number_format);
  const name = scoreboardName(element.id);
  return (
    <GamesStudioShell studio={props} label="Objective Studio" testId="objective">
      <Section title="How the score looks" testId="objective-live">
        <ScoreLook data={element.data} />
      </Section>
      <Section title="Score" testId="objective-general">
        <TextField
          label="Score name"
          value={data.name}
          testId="objective-name"
          placeholder="Points"
          onCommit={(value) => set(['name'], value, typingKey('/name'))}
        />
        <ChoiceField
          label="What counts"
          value={criterion}
          choices={criterionChoices}
          labels={criterionLabels}
          testId="objective-criterion"
          onChange={(value) => set(['criterion'], value ?? 'dummy')}
        />
        <InMore>
          <TextField
            label="Or any criterion, as the game writes it"
            value={data.criterion}
            testId="objective-criterion-text"
            placeholder="minecraft.mined:minecraft.stone"
            onCommit={(value) => set(['criterion'], value ?? 'dummy', typingKey('/criterion'))}
          />
        </InMore>
        <ChoiceField
          label="Where it shows"
          value={textOf(data.display) || 'sidebar'}
          choices={displays}
          labels={displayLabels}
          testId="objective-display"
          onChange={(value) => set(['display'], value ?? 'none')}
        />
      </Section>
      <Section title="Numbers" testId="objective-numbers">
        <ChoiceField
          label="In the player list"
          value={textOf(data.render) || 'integer'}
          choices={scoreboard?.renderTypes ?? Object.keys(RENDER_LABELS)}
          labels={RENDER_LABELS}
          testId="objective-render"
          onChange={(value) => set(['render'], value ?? 'integer')}
        />
        <ChoiceField
          label="Numbers"
          value={format}
          choices={Object.keys(NUMBER_FORMAT_LABELS)}
          labels={NUMBER_FORMAT_LABELS}
          testId="objective-number-format"
          onChange={(value) => set(['number_format'], numberFormatFor(value ?? 'plain'))}
        />
        {format === 'fixed' && (
          <TextField
            label="Text in place of the number"
            value={formatObject.text}
            testId="objective-number-text"
            onCommit={(value) =>
              set(['number_format', 'text'], value ?? '', typingKey('/number_format/text'))
            }
          />
        )}
        {format === 'styled' && (
          <div className="flex flex-wrap items-end gap-2">
            <ChoiceField
              label="Colour"
              value={textOf(formatObject.colour) || undefined}
              choices={TEAM_COLOURS.filter((colour) => colour !== 'reset')}
              labels={TEAM_COLOUR_LABELS}
              emptyLabel="The usual colour"
              testId="objective-number-colour"
              onChange={(value) => set(['number_format', 'colour'], value)}
            />
            <CheckField
              label="Bold"
              checked={formatObject.bold === true}
              testId="objective-number-bold"
              onChange={(checked) => set(['number_format', 'bold'], checked ? true : undefined)}
            />
            <CheckField
              label="Italic"
              checked={formatObject.italic === true}
              testId="objective-number-italic"
              onChange={(checked) => set(['number_format', 'italic'], checked ? true : undefined)}
            />
          </div>
        )}
        <p className="text-muted text-xs">
          The score is made when the world loads; your rules set it, add to it and read it.
        </p>
        <CommandLines
          testId="objective-commands"
          lines={[`/scoreboard players add @s ${name} 1`, `/scoreboard players get @s ${name}`]}
        />
      </Section>
    </GamesStudioShell>
  );
}
