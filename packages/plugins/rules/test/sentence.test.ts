/**
 * The plain-language sentences of rules (ADR 0082 D1; B365): names from the caller, words from
 * ids otherwise, actor words per trigger, nested logic, readings in text, and unknown ids from a
 * newer MSM shown as such instead of failing.
 */
import type { JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { namesFromElements } from '../src/compile';
import { humanizeId, ruleSentence } from '../src/sentence';
import { SAMPLES } from './samples';
import { PROJECT } from './support';

const names = namesFromElements(PROJECT);

describe('ruleSentence', () => {
  it('reads the example of ADR 0082 D2', () => {
    const rule: JsonObject = {
      do: [
        { count: 2, item: 'demo:ruby', step: 'give_item', who: 'player' },
        { sound: 'minecraft:block.note_block.chime', step: 'play_sound', where: 'here' },
      ],
      key: 'ruby_gift',
      only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
      when: { subject: 'demo:ruby_block', trigger: 'block_used' },
    };
    expect(ruleSentence(rule, names)).toBe(
      'When a player uses Ruby Block, if the player is sneaking, give the player 2 Ruby and play Chime here.',
    );
  });

  it('uses the trigger’s own words for its actors', () => {
    expect(
      ruleSentence({
        do: [{ direction: 'up', step: 'launch', strength: 1, who: 'other' }],
        key: 'pad',
        when: { subject: 'demo:plain_block', trigger: 'block_stepped_on' },
      }),
    ).toBe(
      'When something steps on Plain block, launch whoever stepped on it straight up with strength 1.',
    );
  });

  it('reads nested logic, "any of these", "not" and options', () => {
    expect(
      ruleSentence(
        {
          do: [
            {
              do: [
                { amount: 2, step: 'heal' },
                { seconds: 1, step: 'wait' },
              ],
              radius: 8,
              step: 'for_each_player',
            },
            { seconds: 30, step: 'set_weather', weather: 'thunder' },
          ],
          key: 'storm',
          only_if: {
            conditions: [
              { condition: 'is_raining', not: true },
              { condition: 'chance', percent: 10 },
            ],
            match: 'any',
          },
          when: { options: { interval_seconds: 1 }, trigger: 'world_every' },
        },
        names,
      ),
    ).toBe(
      'Every 1 second, if it is not raining or a 10% chance comes up, for each player within 8 blocks: (heal the player by 2 half hearts and wait 1 second) and set the weather to thunder for 30 seconds.',
    );
  });

  it('shows readings inside text in square brackets', () => {
    expect(
      ruleSentence({
        do: [
          {
            step: 'show_message',
            text: [
              'You clicked ',
              { counter: 'clicks', scope: 'player', value: 'counter' },
              ' times; half is ',
              {
                a: { counter: 'clicks', scope: 'player', value: 'counter' },
                b: 2,
                op: '/',
                value: 'math',
              },
            ],
          },
        ],
        key: 'count',
        when: { trigger: 'player_joined' },
      }),
    ).toBe(
      'When a player joins, show the player the message "You clicked [the player\'s clicks] times; half is [(the player\'s clicks divided by 2)]".',
    );
  });

  it('names any_ triggers without a subject "any"', () => {
    expect(ruleSentence({ do: [], key: 'a', when: { trigger: 'any_mob_died' } })).toBe(
      'When any mob dies, nothing.',
    );
  });

  it('shows unknown ids from a newer MSM without failing', () => {
    expect(
      ruleSentence({ do: [{ step: 'dance' }], key: 'a', when: { trigger: 'moon_rises' } }),
    ).toBe('When something unknown happens (moon_rises), an unknown step (dance).');
  });

  it('makes a sentence for every sample', () => {
    for (const sample of SAMPLES) {
      const sentence = ruleSentence(sample.rules[0] as JsonObject, names);
      expect(sentence, sample.name).toMatch(/^[A-Z].*\.$/);
      expect(sentence, sample.name).not.toMatch(/\{|\}|undefined|\s{2}/);
    }
  });
});

describe('humanizeId', () => {
  it('makes words from the last part of an id', () => {
    expect(humanizeId('minecraft:block.note_block.chime')).toBe('Chime');
    expect(humanizeId('mymod:ores/ruby_ore')).toBe('Ruby ore');
    expect(humanizeId('minecraft:stone')).toBe('Stone');
  });
});
