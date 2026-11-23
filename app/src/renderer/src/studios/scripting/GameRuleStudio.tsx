/**
 * Game rule Studio (ADR 0111 D5 as amended, ADR 0112 D1) for `msm:game_rule` element data,
 * loaded lazily: the rule's name and description in the game rule screen, the kind of value
 * ("Game rule kind": on or off, or a whole number), the category it is listed under, the value a
 * new world starts with ("Default") and, for a whole number, the lowest and highest values
 * `/gamerule` accepts. The chat line that sets it (`/gamerule <ns>:<path> <value>`) is shown
 * in More options. Switching the kind is one undo step that drops the other kind's fields.
 *
 * Everything else is in "Every setting".
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { InMore } from '../../components/ui/MoreOptions';
import { typingKey } from '../../forms/context';
import { asObject, pathSetter, pointerOf } from '../blocks-items/blocks-items-model';
import { ProblemsAt, TextField } from '../blocks-items/parts';
import { ChoiceField } from '../entities/MobKindSection';
import { NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { Section } from '../worldgen/parts';

type JsonObject = { [key: string]: Json };

/** The kinds of value (`GameRuleKind`), with their words. */
export const GAME_RULE_KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  boolean: 'On or off (true or false)',
  integer: 'A whole number',
});

/** The categories of the game rule screen (`GameRuleCategory`), with their words. */
export const GAME_RULE_CATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  player: 'Player',
  mobs: 'Mobs',
  spawning: 'Spawning',
  drops: 'Drops',
  updates: 'World updates',
  chat: 'Chat',
  misc: 'Miscellaneous',
});

/** The fields only an `integer` rule has. */
const INTEGER_ONLY = ['min', 'max'] as const;

/**
 * Game rule data with `kind` set: the default is kept when it fits the new kind (else dropped),
 * and `min` and `max` are dropped from a boolean rule.
 */
export function withGameRuleKind(data: Json | undefined, kind: string): JsonObject {
  const next: JsonObject = { ...asObject(data), kind };
  if (kind === 'boolean') {
    for (const key of INTEGER_ONLY) delete next[key];
    if (typeof next.default !== 'boolean') delete next.default;
  } else if (typeof next.default !== 'number') {
    delete next.default;
  }
  return next;
}

/** The Game rule Studio. */
export default function GameRuleStudio(props: StudioProps) {
  const { element, problems, onChange, target } = props;
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  const kind = data.kind === 'integer' ? 'integer' : 'boolean';
  const kinds = target.gameRules?.kinds ?? ['boolean', 'integer'];
  const categories = target.gameRules?.categories ?? Object.keys(GAME_RULE_CATEGORY_LABELS);
  const name =
    typeof data.display_name === 'string' && data.display_name.trim() !== ''
      ? data.display_name
      : 'This setting';

  const general = (
    <Section title="Game rule" testId="game-rule-general">
      <TextField
        label="Name"
        value={data.display_name}
        testId="game-rule-name"
        placeholder="Mobs drop gems"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <TextField
        label="Description"
        value={data.description}
        testId="game-rule-description"
        placeholder="Whether mobs drop gems when they die"
        onCommit={(value) => set(['description'], value, typingKey('/description'))}
      />
      {at(['description'])}
      <div className="flex flex-wrap items-end gap-2">
        <ChoiceField
          label="Game rule kind"
          value={kind}
          choices={kinds}
          labels={GAME_RULE_KIND_LABELS}
          testId="game-rule-kind"
          onChange={(next) => onChange('', withGameRuleKind(element.data, next ?? 'boolean'))}
        />
        <ChoiceField
          label="Category"
          value={typeof data.category === 'string' ? data.category : 'misc'}
          choices={categories}
          labels={GAME_RULE_CATEGORY_LABELS}
          testId="game-rule-category"
          onChange={(next) => set(['category'], next === 'misc' ? undefined : next)}
        />
      </div>
      {at(['kind'])}
      {at(['category'])}
      {kind === 'boolean' ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="game-rule-default-boolean"
            checked={data.default === true}
            onChange={(event) => set(['default'], event.target.checked ? true : undefined)}
          />
          Default: on in a new world
        </label>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <NumberField
            label="Default"
            value={data.default}
            integer
            allowEmpty
            testId="game-rule-default"
            onCommit={(value) => set(['default'], value, typingKey('/default'))}
          />
          <NumberField
            label="Lowest"
            value={data.min}
            integer
            allowEmpty
            testId="game-rule-min"
            onCommit={(value) => set(['min'], value, typingKey('/min'))}
          />
          <NumberField
            label="Highest"
            value={data.max}
            integer
            allowEmpty
            testId="game-rule-max"
            onCommit={(value) => set(['max'], value, typingKey('/max'))}
          />
        </div>
      )}
      {at(['default'])}
      {at(['min'])}
      {at(['max'])}
      <p className="text-muted text-xs" data-testid="game-rule-how">
        {kind === 'boolean'
          ? `${name} is a setting of each world, on or off. Empty default is off.`
          : `${name} is a setting of each world, a whole number. An empty default is 0, kept between the lowest and highest.`}{' '}
        Players change it in the world's game rules, or your rules can.
      </p>
      <InMore>
        <p className="text-muted text-xs" data-testid="game-rule-command">
          In chat:{' '}
          <code className="font-mono">
            /gamerule {element.id} {kind === 'boolean' ? 'true' : '5'}
          </code>
        </p>
      </InMore>
    </Section>
  );

  return (
    <section
      aria-label="Game rule Studio"
      data-testid="game-rule-studio"
      className="flex flex-col gap-4"
    >
      <ProblemsAt problems={problems} pointer="" />
      {general}
    </section>
  );
}
