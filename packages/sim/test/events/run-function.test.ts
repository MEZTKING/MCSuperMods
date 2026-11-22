/**
 * The `run_function` event action in Try it (B613, ADR 0120 D8): the project's function runs
 * through the area's function engine as the runtime's `EventRunner` runs it: as the event's
 * player, else its mob, at the event's position, with the commands' own answers kept quiet. A
 * function the project does not have stays "Only in Minecraft"; one with macro lines is said not
 * to run (an event gives it no values).
 */
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { type CatalogueTarget, holderOf, PLAYER } from '../../src/index.js';
import { FAKE_TARGET } from '../blocks/helpers.js';
import { EV, evFiles, evSource, floorAt, UP } from './helpers.js';

const TARGET = {
  ...FAKE_TARGET,
  folders: {
    ...FAKE_TARGET.folders,
    data: { tags: 'tags', function: 'function', predicate: 'predicate' },
  },
} as unknown as CatalogueTarget;

const event = (...actions: Json[]): Json => ({ actions });

function files(): Map<string, string> {
  const out = evFiles({
    [`msm/${EV}/block/button.json`]: {
      format: 1,
      components: { 'msm:on_interact': { event: 'press' } },
      events: {
        press: event(
          { type: 'run_function', function: 'ev:pressed' },
          { type: 'run_function', function: 'ev:needs_values' },
          { type: 'run_function', function: 'other:elsewhere' },
        ),
      },
    },
    [`msm/${EV}/entity/ticker.json`]: {
      format: 1,
      category: 'creature',
      size: { width: 0.8, height: 1.6 },
      components: { 'msm:on_tick': { event: 'beat', interval_ticks: 20 } },
      events: { beat: event({ type: 'run_function', function: 'ev:beat' }) },
    },
  });
  out.set(
    'data/ev/function/pressed.mcfunction',
    'tag @s add pressed\nsetblock ~ ~1 ~ minecraft:stone\nsay Pressed\n',
  );
  out.set('data/ev/function/needs_values.mcfunction', '$say $(word)\n');
  out.set('data/ev/function/beat.mcfunction', 'tag @s add beating\n');
  return out;
}

describe('run_function as an event action', () => {
  it('runs as and at the player, quietly, and names what it cannot run', () => {
    const { source } = evSource({ files: files(), target: TARGET });
    source.act({ type: 'place', pos: floorAt(10, 10), face: 'up', hit: UP, block: `${EV}:button` });
    const before = source.trace.length;
    source.act({ type: 'use', pos: { x: 10, y: 0, z: 10 }, face: 'up', hit: UP });
    const made = source.trace.slice(before).filter((entry) => entry.action === 'run_function');
    expect(made.map((entry) => [entry.kind, entry.text])).toEqual([
      ['action', 'Ran function ev:pressed as you.'],
      [
        'skipped',
        'The function ev:needs_values has macro lines; an event gives it no values for them, so the game does not run it.',
      ],
      ['onlyInMinecraft', 'run function other:elsewhere'],
    ]);
    expect(source.functions.state.tags.get(holderOf(PLAYER))?.has('pressed')).toBe(true);
    // At the event's position (the block's centre), one block up.
    expect(source.world.get({ x: 10, y: 1, z: 10 })?.name).toBe('minecraft:stone');
    const texts = source.lines.map((line) => line.text);
    expect(texts.some((text) => text.includes('Pressed'))).toBe(true);
    // Quiet: the commands' own answers (the tag's "Added tag ...") are not logged.
    expect(texts.some((text) => text.startsWith('Added tag'))).toBe(false);
  });

  it('runs as the mob in a mob’s own event', () => {
    const { source } = evSource({ files: files(), target: TARGET });
    source.act({
      type: 'use',
      pos: floorAt(20, 20),
      face: 'up',
      hit: UP,
      item: `${EV}:ticker_spawn_egg`,
    });
    const id = source.entities.entities()[0]?.id as number;
    for (let i = 0; i < 40; i += 1) source.tick();
    const ran = source.trace.filter((entry) => entry.action === 'run_function');
    expect(ran.length).toBeGreaterThan(0);
    expect(ran[0]?.text).toBe('Ran function ev:beat as Ticker.');
    expect(source.functions.state.tags.get(holderOf({ kind: 'mob', id }))?.has('beating')).toBe(
      true,
    );
    expect(source.functions.state.tags.get(holderOf(PLAYER))?.has('beating') ?? false).toBe(false);
  });
});
