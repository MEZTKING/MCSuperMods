// @vitest-environment happy-dom
/**
 * A clip on a generated ground (B588, ADR 0119 D12): the example's own world files as the terrain
 * worker reads them, with no vanilla file; nothing set up or stepped before the land is in, in
 * full and at the ground's `bottom`; a ground that cannot be made is a problem and never plays;
 * the land comes back on a loop's restart; and the view keeps the still over the picture until
 * the land is in. The showcase's terrain client is the real engine in a worker run in the test's
 * thread (`localWorker`).
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import { ClipView } from '../../../src/renderer/src/showcase/ClipView';
import type { ShowcaseClip } from '../../../src/renderer/src/showcase/clip';
import {
  ClipPlayer,
  exampleTerrainFiles,
  showcaseTerrainClient,
  TICK_MS,
} from '../../../src/renderer/src/showcase/clip-player';
import { SHOWCASES } from '../../../src/renderer/src/showcase/showcases';
import { clearStills, stillKey } from '../../../src/renderer/src/showcase/still-cache';
import type { TryItSceneProps } from '../../../src/renderer/src/tryit/render/TryItScene';
import type { LocalWorker } from '../terrain/fake-engine';
import { exampleById, filesOf, TARGETS, theRegistry } from './showcase-fixture';

const worker = vi.hoisted(() => ({ local: null as LocalWorker | null, made: 0 }));

vi.mock('../../../src/renderer/src/terrain/client', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../src/renderer/src/terrain/client')>();
  const engine = await import('@msm/terrain');
  const { localWorker } = await import('../terrain/fake-engine');
  class LocalTerrainClient extends original.TerrainClient {
    constructor() {
      super({
        createWorker: () => {
          worker.made += 1;
          worker.local = localWorker(engine);
          return worker.local.worker;
        },
      });
    }
  }
  return { ...original, TerrainClient: LocalTerrainClient };
});

const scene: { props: TryItSceneProps | null } = { props: null };
vi.mock('../../../src/renderer/src/tryit/render/TryItScene', () => ({
  TryItScene: (props: TryItSceneProps) => {
    scene.props = props;
    return <canvas data-testid="fake-scene" aria-label={props.label} />;
  },
}));

const islands = SHOWCASES.find((clip) => clip.id === 'world-islands') as ShowcaseClip;
const target = TARGETS[0] as NonNullable<(typeof TARGETS)[0]>;
const players: ClipPlayer[] = [];

afterEach(() => {
  for (const player of players.splice(0)) player.dispose();
  cleanup();
  scene.props = null;
});

/** Runs the terrain worker until `done` or `rounds` rounds have gone by. */
async function runWorker(done: () => boolean, rounds = 400): Promise<void> {
  for (let i = 0; i < rounds && !done(); i += 1) {
    await worker.local?.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function playerFor(clip: ShowcaseClip): Promise<ClipPlayer> {
  const player = new ClipPlayer({ clip, example: await filesOf(clip.exampleId, target) });
  players.push(player);
  return player;
}

/** How many blocks of each kind the area holds. */
function census(player: ClipPlayer): Record<string, number> {
  const world = player.area.source.world;
  const counts: Record<string, number> = {};
  for (let y = 0; y < world.sizeY; y += 1) {
    for (let z = 0; z < world.sizeZ; z += 1) {
      for (let x = 0; x < world.sizeX; x += 1) {
        const name = world.get({ x, y, z })?.name;
        if (name !== undefined) counts[name] = (counts[name] ?? 0) + 1;
      }
    }
  }
  return counts;
}

describe('the example’s world files', () => {
  it('are the lowered world files by folder and id, with no vanilla file, made once', async () => {
    const example = await filesOf(islands.exampleId, target);
    const files = exampleTerrainFiles(example);
    expect(exampleTerrainFiles(example)).toBe(files);
    expect(files.vanilla).toBeNull();
    expect(Object.keys(files.project['worldgen/world_preset'] ?? {})).toEqual([
      'showcase:coral_isles',
    ]);
    expect(Object.keys(files.project['worldgen/noise_settings'] ?? {})).toEqual([
      'showcase:coral_isles/terrain',
    ]);
    expect(files.facts.dataFolders).toEqual(target.worldgen.terrainPreview?.dataFolders ?? []);
  });
});

describe('a clip on a generated ground', () => {
  it('waits for the land, at its bottom, before it sets up and steps', async () => {
    const player = await playerFor(islands);
    expect(player.groundIn).toBe(false);
    expect(player.ready).toBe(false);
    expect(player.stepTick()).toBe(false);
    player.advance(TICK_MS * 20);
    expect(player.tick).toBe(0);
    await runWorker(() => player.groundIn);
    expect(player.problems).toEqual([]);
    expect(player.ready).toBe(true);
    expect(player.area.ground).toBe('generated');
    expect(player.area.generatedWindow).toMatchObject({ x0: -224, y0: 54, z0: -192 });
    expect(player.area.generated?.state.stage).toBe('features');
    // The setup runs with the first tick: the player stands where the clip puts them.
    expect(player.stepTick()).toBe(true);
    const feet = player.area.source.player.position;
    expect([feet.x, feet.z]).toEqual([islands.player.x, islands.player.z]);
    // The shared client made one worker for the session.
    expect(showcaseTerrainClient()).toBe(showcaseTerrainClient());
    expect(worker.made).toBe(1);
  }, 30_000);

  it('gives the land back when it starts over', async () => {
    const player = await playerFor(islands);
    await runWorker(() => player.groundIn);
    player.stepTick();
    const before = census(player);
    expect(before['minecraft:water'] ?? 0).toBeGreaterThan(0);
    expect(before['minecraft:sand'] ?? 0).toBeGreaterThan(0);
    player.playToEnd();
    player.stepTick();
    expect(player.loops).toBe(1);
    expect(census(player)).toEqual(before);
    player.playToEnd();
    expect(player.problems).toEqual([]);
  }, 30_000);

  it('never plays a ground that cannot be made, and says why', async () => {
    const ground = islands.ground as Extract<ShowcaseClip['ground'], { kind: 'generated' }>;
    const lost: ShowcaseClip = {
      ...islands,
      id: 'lost',
      ground: { ...ground, preset: './no_such_world' },
    };
    const player = await playerFor(lost);
    await runWorker(() => player.problems.length > 0, 100);
    expect(player.problems).toHaveLength(1);
    expect(player.problems[0]).toMatch(
      /^The land could not be made in full: worldgen\/world_preset\/showcase:no_such_world/,
    );
    expect(player.ready).toBe(false);
    expect(player.stepTick()).toBe(false);
  }, 30_000);
});

describe('ClipView on a generated ground', () => {
  it('keeps the still over the picture until the land is in', async () => {
    clearStills();
    const still = 'data:image/png;base64,c3RpbGw=';
    render(
      <ClipView
        clip={islands}
        example={exampleById(islands.exampleId)}
        target={target}
        deps={{ registry: theRegistry(), plugins: builtInPlugins }}
        vanilla={null}
        stillKey={stillKey(islands.id, target.id, false)}
        still={still}
        scripting={null}
      />,
    );
    await waitFor(() => expect(scene.props).not.toBeNull(), { timeout: 10_000 });
    const props = () => scene.props as TryItSceneProps;
    const frame = (): void =>
      act(() => {
        props().onFrame?.(TICK_MS);
        props().onFrameDrawn?.({} as never);
      });
    frame();
    frame();
    expect(screen.getByTestId('showcase-clip-cover').getAttribute('src')).toBe(still);
    expect(screen.queryByTestId('showcase-captions')).toBeNull();
    await act(async () => {
      await runWorker(() => false, 60);
    });
    for (let i = 0; i < 10; i += 1) frame();
    expect(screen.queryByTestId('showcase-clip-cover')).toBeNull();
    expect(screen.getByTestId('showcase-captions').textContent).toContain(
      'Islands rise out of a wide sea',
    );
  }, 30_000);
});
