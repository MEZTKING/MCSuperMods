import { describe, expect, it } from 'vitest';
import { MIXIN_EVENTS, mixinEventsOf } from '../src/java-project/index';

describe('the eject names every Mixin event', () => {
  it('finds the six events a script listens to and words each one', () => {
    const events = [
      'block.place',
      'world.explosion',
      'item.crafted',
      'item.picked_up',
      'player.ate',
      'player.advancement',
    ];
    const text = [...events, 'block.interact']
      .map((e) => `msm.events.on("${e}", () => {});`)
      .join('\n');
    expect(mixinEventsOf(text)).toEqual([...events].sort());
    for (const event of events) expect(MIXIN_EVENTS[event]).toBeTruthy();
  });
});
