import type { OutputFile } from '@msm/plugin-api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SessionFiles,
  sameFiles,
  TryItArea,
  toSimFiles,
} from '../../../src/renderer/src/tryit/session-source';
import { demoOutputs, fakeSession, NS, TARGET } from './tryit-fixture';

afterEach(() => {
  vi.useRealTimers();
});

const floor = (x: number, z: number) => ({ x, y: -1, z });
const up = { x: 0.5, y: 1, z: 0.5 };

function area(outputs: OutputFile[] = demoOutputs()): TryItArea {
  return new TryItArea({ files: toSimFiles(outputs), target: TARGET });
}

describe('toSimFiles and sameFiles', () => {
  it('turns JSON into stable text and keeps bytes', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const files = toSimFiles([
      { path: 'a.json', contents: { b: 1, a: 2 }, layer: 'resourcepack' } as OutputFile,
      { path: 'b.png', contents: bytes, layer: 'resourcepack' } as OutputFile,
    ]);
    expect(files.get('a.json')).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
    expect(files.get('b.png')).toBe(bytes);
    expect(sameFiles(files, new Map(files))).toBe(true);
    expect(sameFiles(files, new Map([...files, ['c', 'x']]))).toBe(false);
    expect(sameFiles(files, new Map([...files, ['b.png', new Uint8Array([1, 2, 4])]]))).toBe(false);
  });
});

describe('SessionFiles', () => {
  it('lowers, keeps the same map when nothing changed, and follows edits after a pause', async () => {
    vi.useFakeTimers();
    const fake = fakeSession();
    const seen: unknown[] = [];
    const files = new SessionFiles(fake.session, {
      onFiles: (lowered) => seen.push(lowered.files),
      debounceMs: 100,
    });
    await files.lowerNow();
    expect(seen).toHaveLength(1);
    // The same files again: nothing is handed on, the identity stays.
    fake.edit(demoOutputs());
    await vi.advanceTimersByTimeAsync(150);
    expect(fake.lowerings).toBe(2);
    expect(seen).toHaveLength(1);
    // Two quick edits lower once.
    fake.edit(demoOutputs({ names: { [`block.${NS}.ruby_block`]: 'Red Block' } }));
    fake.edit(demoOutputs({ names: { [`block.${NS}.ruby_block`]: 'Ruby Brick' } }));
    await vi.advanceTimersByTimeAsync(150);
    expect(fake.lowerings).toBe(3);
    expect(seen).toHaveLength(2);
    // A changed picture hands on a copy.
    files.bump();
    expect(seen).toHaveLength(3);
    expect(seen[2]).not.toBe(seen[1]);
    files.dispose();
  });

  it('reports a failed lowering', async () => {
    const fake = fakeSession();
    fake.session.lowerExpandedProject = async () => {
      throw new Error('no schemas');
    };
    const errors: unknown[] = [];
    const files = new SessionFiles(fake.session, {
      onFiles: () => {},
      onError: (e) => errors.push(e),
    });
    await files.lowerNow();
    expect(String(errors[0])).toContain('no schemas');
  });
});

describe('TryItArea', () => {
  it('keeps the world when an edit swaps a definition', () => {
    const made = area();
    made.act({ type: 'place', pos: floor(3, 3), face: 'up', hit: up, block: `${NS}:ruby_block` });
    made.setFiles(toSimFiles(demoOutputs({ names: { [`block.${NS}.ruby_block`]: 'Red Block' } })));
    expect(made.source.world.count).toBe(1);
    expect(made.source.catalogue.get(`${NS}:ruby_block`)?.displayName).toBe('Red Block');
  });

  it('takes a removed block out with a log line and falls back on a lost state', () => {
    const made = area();
    made.act({ type: 'place', pos: floor(3, 3), face: 'up', hit: up, block: `${NS}:berry` });
    made.act({ type: 'tool', tool: 'grow', pos: { x: 3, y: 0, z: 3 } });
    made.act({ type: 'tool', tool: 'grow', pos: { x: 3, y: 0, z: 3 } });
    expect(made.source.world.get({ x: 3, y: 0, z: 3 })?.properties.age).toBe('2');
    made.setFiles(toSimFiles(demoOutputs({ cropAge: 1 })));
    expect(made.source.world.get({ x: 3, y: 0, z: 3 })?.properties.age).toBe('0');
    made.setFiles(toSimFiles(demoOutputs({ withoutCrop: true })));
    expect(made.source.world.count).toBe(0);
    expect(made.lines.at(-1)?.text).toBe(
      'Berry is no longer in the project; it was taken out of the preview.',
    );
  });

  it('steps the mobs into the mob field and clears everything', () => {
    const made = area();
    made.act({
      type: 'use',
      pos: floor(10, 10),
      face: 'up',
      hit: up,
      item: `${NS}:golem_spawn_egg`,
    });
    expect(made.source.entities.count).toBe(1);
    // Shown at once, before any tick.
    expect(made.mobField.snapshots()).toHaveLength(1);
    made.clock.step();
    expect(made.mobField.snapshots()).toHaveLength(1);
    made.particles.emit('minecraft:flame', { x: 1, y: 1, z: 1, xd: 0, yd: 0, zd: 0 });
    expect(made.particles.size).toBe(1);
    made.act({ type: 'clear' });
    expect(made.source.entities.count).toBe(0);
    expect(made.mobField.snapshots()).toHaveLength(0);
    expect(made.particles.size).toBe(0);
    expect(made.source.pendingTimers).toBe(0);
  });

  it('tells its listeners once per batch of changes', async () => {
    const made = area();
    let heard = 0;
    made.subscribe(() => {
      heard += 1;
    });
    made.act({ type: 'place', pos: floor(3, 3), face: 'up', hit: up, block: `${NS}:ruby_block` });
    made.act({ type: 'place', pos: floor(5, 5), face: 'up', hit: up, block: `${NS}:ruby_block` });
    await Promise.resolve();
    expect(heard).toBe(1);
  });

  it('runs the clock: paused clocks still step', () => {
    const made = area();
    made.clock.pause();
    made.clock.advance(1000);
    expect(made.clock.tick).toBe(0);
    made.clock.step();
    expect(made.clock.tick).toBe(1);
    expect(made.source.ticksRun).toBe(1);
  });
});
