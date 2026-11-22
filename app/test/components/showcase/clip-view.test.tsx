// @vitest-environment happy-dom
/**
 * The live clip view (B568, ADR 0118 D5–D7), over a stand-in for Try it's scene that keeps the
 * props it was given: the player's camera, alpha and area; `onFrame` advancing the clip only
 * after the first drawn frame; captions; the still taken in `onFrameDrawn` at `stillAt`, once;
 * the cover over a restart; `once` ending at the first restart; scripts from the scripting
 * service with the Script API; the player disposed on unmount.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import { ClipView } from '../../../src/renderer/src/showcase/ClipView';
import type { ShowcaseClip } from '../../../src/renderer/src/showcase/clip';
import { ClipPlayer, TICK_MS } from '../../../src/renderer/src/showcase/clip-player';
import { SHOWCASES } from '../../../src/renderer/src/showcase/showcases';
import { clearStills, stillKey, takenStill } from '../../../src/renderer/src/showcase/still-cache';
import type { TryItSceneProps } from '../../../src/renderer/src/tryit/render/TryItScene';
import { exampleById, filesOf, TARGETS, theRegistry } from './showcase-fixture';

const scene: { props: TryItSceneProps | null } = { props: null };

vi.mock('../../../src/renderer/src/tryit/render/TryItScene', () => ({
  TryItScene: (props: TryItSceneProps) => {
    scene.props = props;
    return <canvas data-testid="fake-scene" aria-label={props.label} />;
  },
}));

const woodSet = SHOWCASES[0] as ShowcaseClip;
const target = TARGETS[0];
if (target === undefined) throw new Error('no target');
const deps = { registry: theRegistry(), plugins: builtInPlugins };
const key = stillKey(woodSet.id, target.id, false);
const STILL = 'data:image/png;base64,c3RpbGw=';

beforeEach(async () => {
  scene.props = null;
  clearStills();
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,dGFrZW4=',
  );
  // Lowered once for the whole file (the cache is session-wide).
  await filesOf(woodSet.exampleId, target);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function view(extra: Partial<Parameters<typeof ClipView>[0]> = {}) {
  return render(
    <ClipView
      clip={woodSet}
      example={exampleById(woodSet.exampleId)}
      target={target as NonNullable<typeof target>}
      deps={deps}
      vanilla={null}
      stillKey={key}
      still={STILL}
      scripting={null}
      {...extra}
    />,
  );
}

async function sceneProps(): Promise<TryItSceneProps> {
  await waitFor(() => expect(scene.props).not.toBeNull(), { timeout: 10_000 });
  return scene.props as TryItSceneProps;
}

/** Runs `frames` frames of one tick each through the scene's callbacks. */
function frames(props: () => TryItSceneProps, count: number): void {
  act(() => {
    for (let one = 0; one < count; one += 1) {
      props().onFrame?.(TICK_MS);
      props().onFrameDrawn?.({} as never);
    }
  });
}

describe('ClipView', () => {
  it('draws the player’s area with Smaller picture and the clip’s name', async () => {
    view();
    const props = await sceneProps();
    expect(props.smaller).toBe(true);
    expect(props.label).toBe('Clip: A set of wood');
    expect(props.files.size).toBeGreaterThan(0);
    expect(props.folders).toEqual(target?.folders.resource);
    expect(props.vanilla).toBeNull();
    expect(props.particles).toBeTruthy();
    expect(props.mobs).toBeTruthy();
    expect(typeof props.readProjectAsset).toBe('function');
    const camera = typeof props.camera === 'function' ? props.camera() : props.camera;
    expect(camera.eye).toEqual({ x: 23.5, y: 11.5, z: 33 });
    expect(typeof props.partialTick === 'function' ? props.partialTick() : 0).toBe(0);
    // The still covers the picture until the first frame is drawn.
    expect(screen.getByTestId('showcase-clip-cover').getAttribute('src')).toBe(STILL);
  });

  it('starts with the first drawn frame, shows captions and takes the still once', async () => {
    view();
    await sceneProps();
    const props = () => scene.props as TryItSceneProps;
    // Frames before the first one is drawn do not move the clip.
    act(() => props().onFrame?.(TICK_MS * 5));
    act(() => props().onFrameDrawn?.({} as never));
    expect(screen.queryByTestId('showcase-clip-cover')).toBeNull();
    frames(props, 10);
    expect(screen.getByTestId('showcase-captions').textContent).toContain(
      'Build with your own planks and slabs',
    );
    expect(takenStill(key)).toBeNull();
    frames(props, woodSet.stillAt - 10);
    expect(takenStill(key)).toBe('data:image/png;base64,dGFrZW4=');
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledTimes(1);
    frames(props, 20);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledTimes(1);
  });

  it('covers the picture with the still over a restart', async () => {
    view();
    await sceneProps();
    const props = () => scene.props as TryItSceneProps;
    frames(props, 1);
    frames(props, woodSet.length);
    // The restart ran in the last frame's `onFrame`; one more drawn frame keeps the cover.
    act(() => {
      props().onFrame?.(TICK_MS);
    });
    expect(screen.getByTestId('showcase-clip-cover')).toBeTruthy();
    frames(props, 2);
    expect(screen.queryByTestId('showcase-clip-cover')).toBeNull();
  });

  it('with `once`, ends at the first restart and stops there', async () => {
    const onEnd = vi.fn();
    view({ once: true, onEnd });
    await sceneProps();
    const props = () => scene.props as TryItSceneProps;
    frames(props, woodSet.length + 3);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('runs scripts through the scripting service, and waits for them', async () => {
    const rules: ShowcaseClip = {
      ...woodSet,
      id: 'rules-fixture',
      exampleId: 'example_msm_rules',
      setup: [],
      steps: [],
      captions: [],
    };
    // Never answers: the clip waits for its scripts.
    const transpile = vi.fn(() => new Promise<never>(() => {}));
    render(
      <ClipView
        clip={rules}
        example={exampleById(rules.exampleId)}
        target={target as NonNullable<typeof target>}
        deps={deps}
        vanilla={null}
        stillKey={stillKey(rules.id, 'x', false)}
        still={null}
        scripting={{ transpile }}
      />,
    );
    await waitFor(() => expect(scene.props?.label).toBe('Clip: A set of wood'), {
      timeout: 20_000,
    });
    await waitFor(() => expect(transpile).toHaveBeenCalled());
    const props = () => scene.props as TryItSceneProps;
    frames(props, 40);
    const camera = props().camera;
    const pose = typeof camera === 'function' ? camera() : camera;
    expect(pose.eye).toEqual(woodSet.camera.type === 'keys' ? woodSet.camera.keys[0]?.eye : null);
  }, 30_000);

  it('disposes the player on unmount', async () => {
    const dispose = vi.spyOn(ClipPlayer.prototype, 'dispose');
    const { unmount } = view();
    await sceneProps();
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps its player when the host passes a fresh deps object', async () => {
    const dispose = vi.spyOn(ClipPlayer.prototype, 'dispose');
    const { rerender } = view();
    const first = await sceneProps();
    rerender(
      <ClipView
        clip={woodSet}
        example={exampleById(woodSet.exampleId)}
        target={target as NonNullable<typeof target>}
        deps={{ ...deps }}
        vanilla={null}
        stillKey={key}
        still={STILL}
        scripting={null}
      />,
    );
    expect(dispose).not.toHaveBeenCalled();
    expect(scene.props?.grid).toBe(first.grid);
  });

  it('reports a canvas without WebGL', async () => {
    const lost = vi.fn();
    view({ onWebGLUnavailable: lost });
    const props = await sceneProps();
    act(() => props.onWebGLUnavailable?.());
    expect(lost).toHaveBeenCalledTimes(1);
  });
});
