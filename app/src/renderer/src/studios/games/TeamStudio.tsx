/**
 * Team Studio (ADR 0117 D1, ADR 0113 D4; B555) for `msm:team`, loaded lazily: the team's name,
 * colour, "Hurt your own team", whether team mates see each other when invisible, whose name
 * tags and whom they push, and the text before and after its players' names.
 *
 * Live view (ADR 0119 D1): "How the team looks", a name tag, a chat line and a player list row
 * drawn in the team's colour with its prefix and suffix, following every edit (about right:
 * MSM's letters, not the game's font). Try it shows the colours on names (B558).
 *
 * @packageDocumentation
 */

import { typingKey } from '../../forms/context';
import { CHAT_COLOURS } from '../../liveviews/data/lines/text-component';
import { LiveViewFrame } from '../../liveviews/frame/LiveViewFrame';
import { asObject, pathSetter } from '../blocks-items/blocks-items-model';
import { CheckField, TextField } from '../blocks-items/parts';
import { ChoiceField } from '../entities/MobKindSection';
import type { StudioProps } from '../types';
import { Section } from '../worldgen/parts';
import {
  COLLISION_LABELS,
  NAME_TAG_LABELS,
  scoreboardName,
  TEAM_COLOUR_LABELS,
  TEAM_COLOURS,
  textOf,
} from './games-model';
import { CommandLines, GamesStudioShell } from './shell';

/** A team colour as CSS (no colour is white, as the game draws it). */
export function teamColourCss(colour: string): string {
  return CHAT_COLOURS[colour] ?? '#ffffff';
}

/** The live view: name tag, chat line and player list row. */
function TeamLook(props: { data: ReturnType<typeof asObject> }) {
  const { data } = props;
  const colour = teamColourCss(textOf(data.colour));
  const prefix = textOf(data.prefix);
  const suffix = textOf(data.suffix);
  const name = (player: string) => (
    <span data-testid="team-live-name">
      <span>{prefix}</span>
      <span style={{ color: colour }}>{player}</span>
      <span>{suffix}</span>
    </span>
  );
  return (
    <LiveViewFrame
      title="How the team looks"
      fidelity="about_right"
      notes={['Drawn in MSM’s own letters; the game’s font and name tags look a little different.']}
    >
      <div
        className="flex flex-col gap-2 rounded bg-[#1e1e1e] p-3 font-mono text-sm text-white"
        data-testid="team-live-look"
      >
        <div className="self-center rounded bg-black/50 px-2 py-0.5">{name('Alex')}</div>
        <div>
          {'<'}
          {name('Alex')}
          {'>'} Hello, team!
        </div>
        <div className="flex justify-between rounded bg-white/10 px-2 py-0.5">
          {name('Steve')}
          <span className="text-muted">
            {textOf(data.name) === '' ? 'My team' : textOf(data.name)}
          </span>
        </div>
      </div>
    </LiveViewFrame>
  );
}

/** The Team Studio. */
export default function TeamStudio(props: StudioProps) {
  const { element, onChange, target } = props;
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const scoreboard = target.scoreboard;
  const colours = scoreboard === undefined ? TEAM_COLOURS : [...scoreboard.teamColours, 'reset'];
  const name = scoreboardName(element.id);
  return (
    <GamesStudioShell studio={props} label="Team Studio" testId="team">
      <Section title="How the team looks" testId="team-live">
        <TeamLook data={data} />
      </Section>
      <Section title="Team" testId="team-general">
        <TextField
          label="Team name"
          value={data.name}
          testId="team-name"
          placeholder="Red team"
          onCommit={(value) => set(['name'], value, typingKey('/name'))}
        />
        <ChoiceField
          label="Colour"
          value={textOf(data.colour) || 'white'}
          choices={colours}
          labels={TEAM_COLOUR_LABELS}
          testId="team-colour"
          onChange={(value) => set(['colour'], value ?? 'white')}
        />
        <div className="flex flex-wrap gap-2">
          <TextField
            label="Before names"
            value={data.prefix}
            testId="team-prefix"
            placeholder="[Red] "
            onCommit={(value) => set(['prefix'], value, typingKey('/prefix'))}
          />
          <TextField
            label="After names"
            value={data.suffix}
            testId="team-suffix"
            onCommit={(value) => set(['suffix'], value, typingKey('/suffix'))}
          />
        </div>
      </Section>
      <Section title="Playing together" testId="team-options">
        <CheckField
          label="Hurt your own team"
          checked={data.friendly_fire !== false}
          testId="team-friendly-fire"
          onChange={(checked) => set(['friendly_fire'], checked)}
        />
        <CheckField
          label="See team mates who are invisible"
          checked={data.see_invisible_friends !== false}
          testId="team-see-invisible"
          onChange={(checked) => set(['see_invisible_friends'], checked)}
        />
        <ChoiceField
          label="Name tags they see"
          value={textOf(data.name_tags) || 'always'}
          choices={scoreboard?.nameTagVisibility ?? Object.keys(NAME_TAG_LABELS)}
          labels={NAME_TAG_LABELS}
          testId="team-name-tags"
          onChange={(value) => set(['name_tags'], value ?? 'always')}
        />
        <ChoiceField
          label="Whom they push"
          value={textOf(data.collision) || 'always'}
          choices={scoreboard?.collisionRules ?? Object.keys(COLLISION_LABELS)}
          labels={COLLISION_LABELS}
          testId="team-collision"
          onChange={(value) => set(['collision'], value ?? 'always')}
        />
        <p className="text-muted text-xs">
          The team is made when the world loads; players join it through your rules ("Join a team").
          Renaming the team later leaves the old one in worlds made before.
        </p>
        <CommandLines testId="team-commands" lines={[`/team join ${name} @s`, `/team leave @s`]} />
      </Section>
    </GamesStudioShell>
  );
}
