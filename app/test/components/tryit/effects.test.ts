import type { BlockPos, BlockState, SimEffect } from '@msm/sim';
import { describe, expect, it, vi } from 'vitest';
import {
  CAPTION_TICKS,
  CHIP_TICKS,
  chipTicks,
  PortalHums,
  portalHumsFromFiles,
  type SoundOut,
  soundFileOf,
  TryItEffects,
  VANILLA_SOUND_NOTE,
} from '../../../src/renderer/src/tryit/effects';

function effectsWith(files: Map<string, string | Uint8Array> = new Map(), audio?: SoundOut) {
  let tick = 0;
  const reads: string[] = [];
  const effects = new TryItEffects({
    files,
    now: () => tick,
    listener: () => ({ x: 0, y: 0, z: 0 }),
    readProjectAsset: async (namespace, path) => {
      reads.push(`${namespace}/${path}`);
      return path.endsWith('.ogg') ? new Uint8Array([1, 2, 3]) : null;
    },
    audio: audio ?? null,
  });
  return {
    effects,
    reads,
    advance(ticks: number) {
      tick += ticks;
      effects.tick();
    },
  };
}

const sound = (id: string, extra: Partial<SimEffect> = {}): SimEffect => ({
  kind: 'sound',
  id,
  ...extra,
});

describe('chips', () => {
  it('stay as long as their words say, else the default', () => {
    expect(chipTicks('Glowing for 3 seconds')).toBe(60);
    expect(chipTicks('Speed for 1 second')).toBe(20);
    expect(chipTicks('Rally!')).toBe(CHIP_TICKS);
    expect(chipTicks('Slowness for 900 seconds')).toBe(600);
    const { effects, advance } = effectsWith();
    effects.chip({ kind: 'chip', id: 'Glowing for 3 seconds', target: 7 });
    effects.chip({ kind: 'chip', id: 'No luck this time.', target: 'player' });
    expect(effects.chips.map((chip) => chip.target)).toEqual([7, 'player']);
    advance(59);
    expect(effects.chips).toHaveLength(2);
    advance(1);
    expect(effects.chips).toHaveLength(0);
  });

  it('replaces the same words about the same one', () => {
    const { effects } = effectsWith();
    effects.chip({ kind: 'chip', id: 'Rally!', target: 'player' });
    effects.chip({ kind: 'chip', id: 'Rally!', target: 'player' });
    expect(effects.chips).toHaveLength(1);
  });
});

describe('sounds', () => {
  it('shows a Minecraft sound as a caption only, never playing it (L13)', () => {
    const audio = { play: vi.fn() };
    const { effects, advance } = effectsWith(new Map(), audio);
    effects.sound(sound('minecraft:block.note_block.chime'));
    expect(effects.captions).toEqual([
      expect.objectContaining({ text: 'Chime', played: false, note: VANILLA_SOUND_NOTE }),
    ]);
    expect(audio.play).not.toHaveBeenCalled();
    advance(CAPTION_TICKS);
    expect(effects.captions).toHaveLength(0);
  });

  it("plays a project sound from the project's sounds.json and assets", async () => {
    const audio = { play: vi.fn() };
    const files = new Map<string, string | Uint8Array>([
      [
        'assets/demo/sounds.json',
        JSON.stringify({ 'block.bell': { sounds: ['demo:block/bell', 'demo:block/bell2'] } }),
      ],
    ]);
    const { effects, reads } = effectsWith(files, audio);
    effects.sound(
      sound('demo:block.bell', { volume: 0.5, pitch: 1.5, position: { x: 4, y: 0, z: 0 } }),
    );
    expect(effects.captions[0]).toMatchObject({ text: 'Bell', played: true });
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    expect(reads).toEqual(['demo/sounds/block/bell.ogg']);
    const [key, , volume, pitch] = audio.play.mock.calls[0] as [string, Uint8Array, number, number];
    expect(key).toBe('demo/sounds/block/bell.ogg');
    // Volume 0.5 at 4 blocks of 16.
    expect(volume).toBeCloseTo(0.5 * 0.75);
    expect(pitch).toBe(1.5);
  });

  it('reads sounds.json from the assets when the files lack it, and says an unknown sound', async () => {
    const { effects, reads } = effectsWith();
    effects.sound(sound('demo:missing'));
    await vi.waitFor(() => expect(effects.captions).toHaveLength(1));
    expect(reads).toEqual(['demo/sounds.json']);
    expect(effects.captions[0]).toMatchObject({ played: false });
    expect(effects.captions[0]?.note).toContain('not in the project');
  });

  it('finds the file of an event entry and of a plain name', () => {
    const own = {
      a: { sounds: [{ name: 'demo:b', type: 'event' }] },
      b: { sounds: [{ name: 'x/y', stream: true }] },
    };
    expect(soundFileOf(own, 'demo:a', () => own)).toEqual({
      namespace: 'demo',
      path: 'sounds/x/y.ogg',
    });
    expect(soundFileOf(own, 'demo:none')).toBeNull();
  });
});

describe('portal hums', () => {
  const files = new Map<string, string | Uint8Array>([
    ['msm/demo/block/gate.json', JSON.stringify({ format: 1, type: 'portal' })],
    [
      'msm/demo/block/quiet.json',
      JSON.stringify({ format: 1, type: 'portal', sounds: { ambient: false } }),
    ],
    [
      'msm/demo/block/own.json',
      JSON.stringify({ format: 1, type: 'portal', sounds: { ambient: 'demo:hum' } }),
    ],
  ]);

  it("reads each portal's ambient sound, the default, or none", () => {
    expect(portalHumsFromFiles(files, 'minecraft:block.portal.ambient')).toEqual(
      new Map([
        ['demo:gate', 'minecraft:block.portal.ambient'],
        ['demo:own', 'demo:hum'],
      ]),
    );
  });

  it('hums near the player about once in a hundred ticks', () => {
    const blocks = new Map<string, { pos: BlockPos; state: BlockState }>();
    const put = (x: number, name: string) =>
      blocks.set(`${x}`, { pos: { x, y: 0, z: 0 }, state: { name, properties: {} } });
    put(0, 'demo:gate');
    put(1, 'demo:quiet');
    const world = {
      get: (pos: BlockPos) => blocks.get(`${pos.x}`)?.state ?? null,
      blocks: () => blocks.values(),
    };
    const hums = new PortalHums({ files, defaultSound: 'minecraft:block.portal.ambient' });
    const played: SimEffect[] = [];
    for (let i = 0; i < 2000; i += 1) hums.tick(world, { x: 0, y: 0, z: 0 }, (e) => played.push(e));
    expect(played.length).toBeGreaterThan(5);
    expect(played.length).toBeLessThan(60);
    expect(new Set(played.map((effect) => effect.id))).toEqual(
      new Set(['minecraft:block.portal.ambient']),
    );
    expect(played[0]).toMatchObject({ volume: 0.5, origin: { elementId: 'demo:gate' } });
    const far: SimEffect[] = [];
    for (let i = 0; i < 500; i += 1) hums.tick(world, { x: 100, y: 0, z: 0 }, (e) => far.push(e));
    expect(far).toHaveLength(0);
  });
});
