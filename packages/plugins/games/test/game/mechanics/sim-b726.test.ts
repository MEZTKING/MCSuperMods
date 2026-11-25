/**
 * The mechanics of B726 played through in Try it's function engine (the brief's exit criterion
 * "a sim play-through per mechanic", un-skipped by B728): Try it runs the commands they write
 * (B727) and stands practice players beside its own (B728). The area's corner is set as a games
 * ground sets it, so each sample's world positions (the floor at y 64, the beds at x 40) land in
 * the 48 by 32 by 48 test area. `@msm/plugin-games` does not depend on `@msm/sim`, so the sim is
 * loaded by file path (`sim-support.ts`).
 */
import { describe, expect, it } from 'vitest';
import { KIT_SAMPLES, PIECES, sampleElement } from '../samples';
import { B726_PIECES, expandedSamples } from './samples-b726';
import { BEDS_TAG, play as playElements } from './sim-support';

const OTHERS = [...KIT_SAMPLES, ...PIECES, ...B726_PIECES].map(sampleElement);

/** The floor games: the snow floor (0 to 31 at y 64) at area 8 to 39, y 16. */
const FLOOR_CORNER = { x: -8, y: 48, z: -8 };
/** The bed game: the red bed (40, 64, 40) at area 24, 16, 24. */
const BEDS_CORNER = { x: 16, y: 48, z: 16 };

async function play(name: string, corner: { x: number; y: number; z: number }) {
  const game = expandedSamples([...PIECES, ...KIT_SAMPLES]).find(
    (one) => one.id === `demo:${name}`,
  );
  if (game === undefined) throw new Error(`no sample ${name}`);
  const others = OTHERS.filter((one) => one.kind !== 'msm:game');
  return playElements([game, ...others], corner, [BEDS_TAG]);
}

describe('B726’s mechanics in Try it', () => {
  it('floor: a round rebuilds the floor and hands out the tool a tick after the start', async () => {
    const { source, tags, ticks } = await play('spleef', FLOOR_CORNER);
    source.chat('/tp @s 5 65 5');
    source.chat('/setblock 5 64 5 minecraft:air');
    source.chat('/function demo:msm_games/game/spleef/start');
    expect(tags()).toContain('demo.game.spleef.floor.ready');
    ticks(1);
    expect(tags()).not.toContain('demo.game.spleef.floor.ready');
    expect(source.functions.state.games.gameMode('Player')).toBe('adventure');
    expect(source.chat('/execute if block 5 64 5 minecraft:snow_block').result).toBe('ran');
  });

  it('fall out: a player below the height is out of the round', async () => {
    const { source, tags, ticks } = await play('spleef', FLOOR_CORNER);
    source.chat('/tp @s 5 65 5');
    source.chat('/function demo:msm_games/game/spleef/start');
    ticks(2);
    expect(tags()).toContain('demo.game.spleef.in');
    source.chat('/tp @s 5 50 5');
    ticks(1);
    expect(tags()).toContain('demo.game.spleef.out');
  });

  it('fall out, back: a player who falls is put back where the round started', async () => {
    const { source, player, score, ticks } = await play('layers', { x: -16, y: -16, z: -16 });
    source.chat('/tp @s 3 12 3');
    source.chat('/function demo:msm_games/game/layers/start');
    ticks(2);
    source.chat('/tp @s 3 -10 3');
    ticks(1);
    expect(score(player, 'demo.msm_fall_y')).toBe(12);
    expect(source.chat('/execute if entity @s[y=11,dy=2]').result).toBe('ran');
  });

  it('elimination: three deaths and the player is out', async () => {
    const { source, tags, ticks } = await play('beds', BEDS_CORNER);
    source.chat('/function demo:msm_games/game/beds/start');
    for (let i = 0; i < 3; i += 1) {
      source.chat('/setblock 40 64 40 minecraft:air');
      source.chat('/kill @s');
      ticks(2);
    }
    expect(tags()).toContain('demo.game.beds.out');
  });

  it('team base: a death while the bed stands waits five seconds, then comes back', async () => {
    const { source, tags, ticks } = await play('beds', BEDS_CORNER);
    source.chat('/setblock 40 64 40 minecraft:red_bed[part=foot]');
    source.chat('/function demo:msm_games/game/beds/start');
    source.chat('/team join demo.red @s');
    ticks(1);
    source.chat('/kill @s');
    ticks(1);
    expect(tags()).toContain('demo.game.beds.team_base.waiting');
    ticks(6 * 20);
    expect(tags()).not.toContain('demo.game.beds.team_base.waiting');
    expect(tags()).toContain('demo.game.beds.in');
  });

  it('team base: a broken bed means out at the next death, and the last team standing wins', async () => {
    const { source, tags, ticks, said, act } = await play('beds', BEDS_CORNER);
    source.practice.setUserAway(true);
    act({ do: 'join', who: 'Alex', at: { pos: [38.5, 65, 38.5] } });
    act({ do: 'join', who: 'Sam', at: { pos: [36.5, 65, 38.5] } });
    source.chat('/setblock 40 64 40 minecraft:red_bed[part=foot]');
    source.chat('/function demo:msm_games/game/beds/start');
    source.chat('/team join demo.red Alex');
    source.chat('/team join demo.blue Sam');
    ticks(1);
    act({ do: 'knock_out', who: 'Alex', by: 'Sam' });
    ticks(1);
    expect(tags('Alex')).toContain('demo.game.beds.team_base.waiting');
    ticks(6 * 20);
    expect(tags('Alex')).toContain('demo.game.beds.in');
    expect(act({ do: 'break', who: 'Sam', at: [40, 64, 40] }).ok).toBe(true);
    ticks(20);
    act({ do: 'knock_out', who: 'Alex', by: 'Sam' });
    ticks(2);
    expect(tags('Alex')).toContain('demo.game.beds.out');
    expect(said()).toContain('Sam won the round of Beds!');
  });

  it('generators: an iron generator fills its pile to the cap and stops', async () => {
    const { source, ticks } = await play('beds', BEDS_CORNER);
    source.chat('/function demo:msm_games/game/beds/start');
    source.chat('/team join demo.red @s');
    ticks(60 * 20);
    source.chat(
      '/execute store result score #n demo.msm_game run data get entity @e[type=minecraft:item,x=43.5,y=64,z=40.5,distance=..1.5,limit=1] Item.count',
    );
    expect(source.functions.state.score('#n', 'demo.msm_game')).toBe(48);
  });

  it('shop: a menu purchase takes the cost and gives the item', async () => {
    const { source, ticks } = await play('beds', BEDS_CORNER);
    source.chat('/function demo:msm_games/game/beds/start');
    source.chat('/give @s minecraft:iron_ingot 2');
    source.chat('/give @s minecraft:gold_ingot 1');
    source.chat('/scoreboard players enable @s demo.msm_shop');
    source.chat('/trigger demo.msm_shop set 201');
    ticks(1);
    expect(source.chat('/clear @s minecraft:end_stone 0').answer.join(' ')).toContain('12');
  });

  it('shop: a practice player who hits the menu may buy from it', async () => {
    const { source, ticks, act } = await play('beds', BEDS_CORNER);
    source.practice.setUserAway(true);
    act({ do: 'join', who: 'Alex' });
    act({ do: 'join', who: 'Sam' });
    source.chat('/function demo:msm_games/game/beds/start');
    source.chat('/team join demo.red Alex');
    source.chat('/tp Alex 43 64 44');
    ticks(1);
    expect(act({ do: 'type', who: 'Alex', line: '/trigger demo.msm_shop set 101' }).ok).toBe(false);
    expect(act({ do: 'hit_thing', who: 'Alex', type: 'interaction' }).ok).toBe(true);
    ticks(1);
    source.chat('/give Alex minecraft:iron_ingot 4');
    expect(act({ do: 'type', who: 'Alex', line: '/trigger demo.msm_shop set 101' }).ok).toBe(true);
    ticks(1);
    const alex = source.practice.all().find((one) => one.name === 'Alex');
    expect(alex?.inventory.count('minecraft:stone_sword')).toBe(1);
    expect(alex?.inventory.count('minecraft:iron_ingot')).toBe(0);
  });

  it('border: set at the start, shrinking a minute in, its size again at the end', async () => {
    const { source, ticks } = await play('spleef', FLOOR_CORNER);
    source.chat('/tp @s 5 65 5');
    source.chat('/function demo:msm_games/game/spleef/start');
    ticks(2);
    expect(source.chat('/worldborder get').answer.join(' ')).toContain('64');
    // A minute in it starts to shrink to 16 over two minutes: half a minute later it is 52 wide.
    ticks(90 * 20);
    expect(source.chat('/worldborder get').answer.join(' ')).toContain('52');
    source.chat('/function demo:msm_games/game/spleef/stop');
    expect(source.chat('/worldborder get').answer.join(' ')).toContain('64');
  });

  it('kit on: the kit at the start', async () => {
    const { source, ticks } = await play('spleef', FLOOR_CORNER);
    source.chat('/tp @s 5 65 5');
    source.chat('/function demo:msm_games/game/spleef/start');
    ticks(2);
    expect(source.chat('/clear @s minecraft:diamond_shovel 0').answer.join(' ')).toContain('2');
  });
});
