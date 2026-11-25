/**
 * The mechanics `hearts`, `tracker` and `head_start` played through in Try it's function engine
 * (B725's exit criterion "a sim play-through per mechanic", un-skipped by B728): Try it runs the
 * commands they write (B727) and stands practice players beside its own (B728), so a kill, a
 * revive and a hunt play from the real lowered files. `@msm/plugin-games` does not depend on
 * `@msm/sim`, so the sim is loaded by file path (`sim-support.ts`).
 */
import { describe, expect, it } from 'vitest';
import { type GameSample, sampleElement } from '../samples';
import { MECHANIC_SAMPLES } from './samples';
import { play as playElements } from './sim-support';

/** Where the area's block 0, 0, 0 stands: the lifesteal and hunt samples name no places. */
const CORNER = { x: 0, y: 40, z: 0 };

const play = (name: string) =>
  playElements(
    [sampleElement(MECHANIC_SAMPLES.find((entry) => entry.name === name) as GameSample)],
    CORNER,
  );

const HEARTS = 'demo.msm_hearts';

describe('the mechanics in Try it', () => {
  it('hearts: starts with ten, loses one at a death that is not a kill, withdraws one', async () => {
    const { source, player, ticks, score } = await play('lifesteal');
    // The endless game starts once the player is in the world.
    ticks(40);
    expect(score(player, HEARTS)).toBe(10);
    source.chat('/kill @s');
    ticks(1);
    expect(score(player, HEARTS)).toBe(9);
    source.chat('/trigger demo.msm_withdraw');
    ticks(1);
    expect(score(player, HEARTS)).toBe(8);
  });

  it('hearts: at zero the player watches as a spectator, then is back when the time is up', async () => {
    const { source, player, ticks, tags } = await play('lifesteal');
    ticks(40);
    source.chat('/scoreboard players set @s demo.msm_hearts 1');
    source.chat('/kill @s');
    ticks(1);
    expect(tags()).toContain('demo.game.lifesteal.kept_out');
    expect(source.functions.state.games.gameMode(player)).toBe('spectator');
    ticks(3600 * 20 + 2);
    expect(tags()).not.toContain('demo.game.lifesteal.kept_out');
  }, 120_000);

  it('hearts: a kill moves a heart from the victim to the killer', async () => {
    const { source, ticks, score, said, act } = await play('lifesteal');
    source.practice.setUserAway(true);
    act({ do: 'join', who: 'Alex', at: { pos: [10.5, 40, 10.5] } });
    act({ do: 'join', who: 'Sam', at: { pos: [12.5, 40, 10.5] } });
    ticks(40);
    expect([score('Alex', HEARTS), score('Sam', HEARTS)]).toEqual([10, 10]);
    act({ do: 'knock_out', who: 'Sam', by: 'Alex' });
    ticks(1);
    expect([score('Alex', HEARTS), score('Sam', HEARTS)]).toEqual([11, 9]);
    expect(source.functions.state.games.maxHealth('Alex')).toBe(22);
    expect(said()).toContain('Alex took a heart from Sam.');
  });

  it('hearts: the revive item brings back the player out longest', async () => {
    const { source, ticks, tags, score, said, act } = await play('lifesteal');
    source.practice.setUserAway(true);
    for (const [who, x] of [
      ['Alex', 10.5],
      ['Sam', 12.5],
      ['Kai', 14.5],
    ] as const) {
      act({ do: 'join', who, at: { pos: [x, 40, 10.5] } });
    }
    ticks(40);
    source.chat('/scoreboard players set Sam demo.msm_hearts 1');
    act({ do: 'knock_out', who: 'Sam', by: 'Alex' });
    ticks(30);
    source.chat('/scoreboard players set Kai demo.msm_hearts 1');
    act({ do: 'knock_out', who: 'Kai', by: 'Alex' });
    ticks(30);
    expect(tags('Sam')).toContain('demo.game.lifesteal.ran_out');
    expect(tags('Kai')).toContain('demo.game.lifesteal.ran_out');
    source.chat(
      '/give Alex minecraft:beacon[minecraft:custom_name={"text":"Revive beacon","italic":false},minecraft:custom_data={msm_revive_demo:1b}] 1',
    );
    expect(act({ do: 'use', who: 'Alex', item: 'minecraft:beacon' }).ok).toBe(true);
    expect(tags('Sam')).not.toContain('demo.game.lifesteal.ran_out');
    expect(tags('Kai')).toContain('demo.game.lifesteal.ran_out');
    expect(score('Sam', HEARTS)).toBe(3);
    expect(said()).toContain('Sam was brought back with 3 hearts.');
  });

  it('tracker: the hunter’s compass points at the runner; other dimensions are said', async () => {
    const { source, ticks, tags, act } = await play('hunt');
    source.practice.setUserAway(true);
    act({ do: 'join', who: 'Alex', at: { pos: [10.5, 40, 10.5] } });
    act({ do: 'join', who: 'Sam', at: { pos: [30.5, 40, 20.5] } });
    source.chat('/function demo:msm_games/game/hunt/start');
    const [hunter, runner] = tags('Alex').has('demo.game.hunt.role.hunter')
      ? ['Alex', 'Sam']
      : ['Sam', 'Alex'];
    act({ do: 'walk', who: runner, to: { pos: [40.5, 40, 40.5] } });
    ticks(10 * 20);
    // The hunter is held by the head start (30 seconds) and has not moved.
    expect(source.practice.all().find((one) => one.name === hunter)?.pos.x).toBe(
      hunter === 'Alex' ? 10.5 : 30.5,
    );
    const holder = source.practice.all().find((one) => one.name === hunter);
    const compass = holder?.inventory.slots[0];
    expect(compass?.id).toBe('minecraft:compass');
    const tracker = compass?.components?.['minecraft:lodestone_tracker'] as
      | { target: { dimension: string; pos: number[] } }
      | undefined;
    expect(tracker?.target.dimension).toBe('minecraft:overworld');
    expect(tracker?.target.pos).toEqual([40, 40, 40]);
    expect(
      source.lines.some(
        (line) => line.onlyInMinecraft === true && line.text.includes('minecraft:the_nether'),
      ),
    ).toBe(true);
  });

  it('head start: the held player cannot move until the seconds are up', async () => {
    const { source, player, ticks, tags } = await play('spin');
    source.chat('/function demo:msm_games/game/spin/start');
    ticks(1);
    expect(tags(player)).toContain('demo.game.spin.held');
    ticks(10 * 20 + 2);
    expect(tags(player)).not.toContain('demo.game.spin.held');
  });
});
