/**
 * The sample lines of a damage type and a chat type, as the game builds them (B600 2S10,
 * observed on both targets): a damage type's `message_id` picks `death.attack.<message_id>` with
 * the victim, the same key with the victim and the killer, and `death.attack.<message_id>.item`
 * with the victim, the killer and the killer's named item in square brackets;
 * `intentional_game_design` gives `death.attack.<message_id>.message` with a bracketed link.
 * A chat type fills its `translation_key` with its `parameters` in their order and lays its
 * `style` over the whole line; its narration does the same with its own key. The names are
 * samples; the components are MSM's own (about right).
 */

import type { Json } from '@msm/plugin-api';

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The sample people and things of the lines. */
export const SAMPLE = Object.freeze({
  victim: 'Ann',
  playerKiller: 'Bea',
  mobKiller: 'minecraft:zombie',
  itemName: 'Spiky',
  target: 'Bea',
  content: 'Hello there!',
});

/** One form of a death line. */
export interface DeathLine {
  /** `alone`, `mob`, `named_item` or `design` (the link form). */
  readonly form: 'alone' | 'mob' | 'named_item' | 'design';
  /** What the form is, in plain words. */
  readonly label: string;
  /** The language key the game picks. */
  readonly key: string;
  /** The line as a component (`translate` with its arguments). */
  readonly component: Json;
}

/** How a damage type's death message is chosen (`death_message_type`, `default` when absent). */
export function deathMessageType(damageType: Json | undefined): string {
  return isRecord(damageType) && typeof damageType.death_message_type === 'string'
    ? damageType.death_message_type
    : 'default';
}

/** The damage type's `message_id`, or `null` without one. */
export function messageIdOf(damageType: Json | undefined): string | null {
  return isRecord(damageType) && typeof damageType.message_id === 'string'
    ? damageType.message_id
    : null;
}

const player = (name: string): Json => ({ text: name });
const bracketed = (inner: Json): Json => ({
  translate: 'chat.square_brackets',
  fallback: '[%s]',
  with: [inner],
});

/** The death lines of a damage type, in the order the view shows them. */
export function deathLines(damageType: Json | undefined): DeathLine[] {
  const id = messageIdOf(damageType);
  if (id === null) return [];
  const base = `death.attack.${id}`;
  const victim = player(SAMPLE.victim);
  const mob: Json = {
    translate: `entity.${SAMPLE.mobKiller.replace(':', '.')}`,
    fallback: 'Zombie',
  };
  const lines: DeathLine[] = [
    {
      form: 'alone',
      label: 'On their own',
      key: base,
      component: { translate: base, with: [victim] },
    },
    {
      form: 'mob',
      label: 'Killed by a mob',
      key: base,
      component: { translate: base, with: [victim, mob] },
    },
    {
      form: 'named_item',
      label: 'Killed by a player holding a named item',
      key: `${base}.item`,
      component: {
        translate: `${base}.item`,
        with: [
          victim,
          player(SAMPLE.playerKiller),
          bracketed({ text: SAMPLE.itemName, italic: true }),
        ],
      },
    },
  ];
  if (deathMessageType(damageType) === 'intentional_game_design') {
    lines.push({
      form: 'design',
      label: 'When the game blames its own design',
      key: `${base}.message`,
      component: {
        translate: `${base}.message`,
        with: [victim, bracketed({ translate: `${base}.link` })],
      },
    });
  }
  return lines;
}

/** One decoration of a chat type (`chat` or `narration`). */
export interface ChatDecoration {
  readonly key: string;
  readonly parameters: readonly string[];
  /** The style object of the data, laid over the whole line (chat only). */
  readonly style: Json | null;
}

/** A decoration of the chat type's data, or `null` when it is missing or has no key. */
export function decorationOf(value: Json | undefined): ChatDecoration | null {
  if (!isRecord(value) || typeof value.translation_key !== 'string') return null;
  const parameters = Array.isArray(value.parameters)
    ? value.parameters.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    key: value.translation_key,
    parameters,
    style: isRecord(value.style) ? value.style : null,
  };
}

/** The sample words for each chat parameter. */
export interface ChatSample {
  readonly sender: string;
  readonly target: string;
  readonly content: string;
}

/**
 * The line of one decoration as a component: the key filled with the parameters in their order,
 * the style on the whole line. A parameter MSM does not know is named in angle brackets.
 */
export function chatLineComponent(decoration: ChatDecoration, sample: ChatSample): Json {
  const args = decoration.parameters.map((parameter): Json => {
    switch (parameter) {
      case 'sender':
        return { text: sample.sender };
      case 'target':
        return { text: sample.target };
      case 'content':
        return { text: sample.content };
      default:
        return { text: `<${parameter}>` };
    }
  });
  const line: Record<string, Json> = { translate: decoration.key, with: args };
  if (decoration.style !== null) {
    for (const [key, value] of Object.entries(decoration.style)) line[key] = value;
  }
  return line;
}
