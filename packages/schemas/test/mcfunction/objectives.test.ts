import { describe, expect, it } from 'vitest';
import { collectProjectObjectives } from '../../src/mcfunction/index';

describe('collectProjectObjectives', () => {
  it('collects objectives created anywhere, sorted and without duplicates', () => {
    expect(
      collectProjectObjectives([
        'scoreboard objectives add jumps minecraft.custom:minecraft.jump\nsay hi',
        'execute as @a run scoreboard objectives add timer dummy "Timer"',
        'scoreboard   objectives add jumps dummy',
        '\tscoreboard objectives add a.b-c+d dummy',
      ]),
    ).toEqual(['a.b-c+d', 'jumps', 'timer']);
  });

  it('skips comments, macros, removals and incomplete commands', () => {
    expect(
      collectProjectObjectives([
        '# scoreboard objectives add commented dummy',
        '$scoreboard objectives add $(name) dummy',
        'scoreboard objectives remove gone',
        'scoreboard objectives add',
        'tellraw @a "scoreboard objectives"',
      ]),
    ).toEqual([]);
  });
});
