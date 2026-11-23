/**
 * The drawn still of a world card (ADR 0128 D3): a world example has no pictures of its own, so
 * its ordinary drawn still (`drawn-still.ts`) is only a plain tint, an empty grey frame. Instead
 * the card's land is made as its clip makes it (a silent {@link ClipPlayer} on the example's
 * generated ground) and drawn from the clip's camera at `stillAt` by `land-picture.ts`, without
 * WebGL, at the card's still size.
 *
 * - The land comes from a terrain worker of the stills' own, not the clips' (one clip at a time
 *   keeps its worker), made on first use and let go once no still is being drawn.
 * - One still is made at a time; each is cached as a promise by clip, target and size. A land
 *   that cannot be made rejects with the clip player's words, and is not kept, so a later look
 *   may try again.
 * - Loaded lazily by the gallery, only for cards on a generated ground.
 *
 * @packageDocumentation
 */

import type { ExampleProject, Target } from '@msm/plugin-api';
import type { RgbaImage } from '../components/texture-editor/pixels';
import { imageDataUrl } from '../components/texture-editor/png-canvas';
import { TerrainClient } from '../terrain/client';
import type { CameraPose } from '../tryit/render/camera';
import { cameraAt } from './camera-path';
import type { ShowcaseClip } from './clip';
import { ClipPlayer } from './clip-player';
import { CANVAS_CODEC, type StillCodec, type StillSize } from './drawn-still';
import { type ExampleFilesDeps, exampleFiles } from './example-files';
import { drawLand } from './land-picture';

/** How long a still waits for its land before giving up. */
export const LAND_STILL_WAIT_MS = 60_000;

/** What making a land still needs. */
export interface LandStillOptions {
  readonly deps: ExampleFilesDeps;
  readonly size: StillSize;
  readonly codec?: StillCodec;
  /** The terrain client (tests); default the stills' own worker. */
  readonly terrain?: TerrainClient;
  /** Draws the land (tests); default {@link drawLand}. */
  readonly draw?: (player: ClipPlayer, pose: CameraPose, size: StillSize) => RgbaImage;
}

const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
let shared: TerrainClient | null = null;
let busy = 0;

/** Forgets every land still (tests). */
export function clearLandStills(): void {
  cache.clear();
}

/** The camera of `clip` at its `stillAt` (its keys; the player's camera otherwise). */
export function stillPose(clip: ShowcaseClip, player: ClipPlayer): CameraPose {
  const camera = clip.camera;
  if (camera.type === 'keys' || camera.type === 'follow') {
    if (camera.keys.length > 0) return cameraAt(camera.keys, clip.stillAt);
  }
  return player.camera();
}

function stillsClient(): TerrainClient {
  shared ??= new TerrainClient();
  return shared;
}

/**
 * The land still of `clip` (a clip on a `generated` ground) as a PNG `data:` URL, `size.width`
 * by `size.height` pixels.
 */
export function landStill(
  clip: ShowcaseClip,
  example: ExampleProject,
  target: Target,
  options: LandStillOptions,
): Promise<string> {
  const { size } = options;
  const key = `${clip.id}\u0000${target.id}\u0000${size.width}x${size.height}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const ownClient = options.terrain === undefined;
  if (ownClient) busy += 1;
  const made = queue
    .then(() => makeLandStill(clip, example, target, options))
    .finally(() => {
      if (!ownClient) return;
      busy -= 1;
      if (busy === 0) {
        shared?.dispose();
        shared = null;
      }
    });
  queue = made.catch(() => undefined);
  cache.set(key, made);
  made.catch(() => {
    if (cache.get(key) === made) cache.delete(key);
  });
  return made;
}

async function makeLandStill(
  clip: ShowcaseClip,
  example: ExampleProject,
  target: Target,
  options: LandStillOptions,
): Promise<string> {
  if (clip.ground.kind !== 'generated') throw new Error('This card is not a world.');
  const files = await exampleFiles(example, target, options.deps);
  const player = new ClipPlayer({
    clip,
    example: files,
    terrain: options.terrain ?? stillsClient(),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      player.whenGround(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('The land took too long to make.')),
          LAND_STILL_WAIT_MS,
        );
      }),
    ]);
    // The first tick puts the setup in place, as the clip's first frame has it.
    player.stepTick();
    const pose = stillPose(clip, player);
    const image =
      options.draw?.(player, pose, options.size) ??
      drawLand(player.area.source.world, pose, options.size.width, options.size.height);
    return imageDataUrl((options.codec ?? CANVAS_CODEC).encode(image));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    player.dispose();
  }
}
