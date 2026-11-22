/**
 * One live showcase clip (ADR 0118 D2, D5–D7; B568): the lazy chunk of the showcase. It lowers
 * the example (`example-files.ts`, cached), plays it with a {@link ClipPlayer} and draws it with
 * Try it's `TryItScene`, unchanged, with Smaller picture.
 *
 * - The camera is the player's (`player.camera()`), `partialTick` is `player.alpha`, and the clip
 *   advances by the frame's elapsed time in `onFrame` (whole ticks, never the wall clock).
 * - The grid, particles, mobs and vehicles are the player's area's; the fluids are
 *   `fluidLooks` of its catalogue; pictures the files lack come from the example's bundle.
 * - Scripts run through the preload's scripting service with `SCRIPT_API`, as Try it's.
 * - The still is taken inside `onFrameDrawn` once the clip reaches `stillAt` (B565 Z5: later
 *   the canvas is blank), once per clip per session (`still-cache.ts`).
 * - The still (taken or drawn) covers the picture until the first frame and while the one
 *   rebuild of a loop's restart is drawn (`player.loops` has just grown).
 * - With `once`, the clip ends at its first restart (`onEnd`), for the play button under
 *   reduced motion or with clips turned off.
 * - The player and its area are disposed on unmount; the canvas then loses its WebGL context.
 *
 * @packageDocumentation
 */

import type { ExampleProject, Target } from '@msm/plugin-api';
import { SCRIPT_API } from '@msm/plugin-scripting';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VanillaAssetReader } from '../preview/model-chain';
import { fluidLooks } from '../tryit/fluids/fluid-pass';
import { TryItScene } from '../tryit/render/TryItScene';
import type { TranspileOutcome, TryItScripts } from '../tryit/session-source';
import type { ShowcaseClip } from './clip';
import { ClipPlayer } from './clip-player';
import { type ExampleFiles, type ExampleFilesDeps, exampleFiles } from './example-files';
import { hasStill, keepStill } from './still-cache';

/** The part of the scripting service a clip uses (ADR 0031 D2). */
export interface ClipScripting {
  transpile(source: string, name: string): Promise<TranspileOutcome>;
}

/** Props of {@link ClipView}. */
export interface ClipViewProps {
  readonly clip: ShowcaseClip;
  readonly example: ExampleProject;
  readonly target: Target;
  readonly deps: ExampleFilesDeps;
  /** The user's extracted client jar, or `null` (vanilla blocks then draw as MSM's fallbacks). */
  readonly vanilla: VanillaAssetReader | null;
  /** Vanilla block states for props; keep the same map between renders (a new one rebuilds). */
  readonly vanillaBlockstates?: ReadonlyMap<string, string>;
  /** Where the taken still is kept (`stillKey`). */
  readonly stillKey: string;
  /** The picture shown until the first frame and over a restart (taken, else drawn). */
  readonly still: string | null;
  /** Plays to the end once, then calls {@link onEnd}. */
  readonly once?: boolean;
  readonly onEnd?: () => void;
  /** Called when the canvas has no WebGL context or loses it. */
  readonly onWebGLUnavailable?: () => void;
  /** The scripting service; default the preload's (`window.msm.scripting`), `null` for none. */
  readonly scripting?: ClipScripting | null;
  /** Test hook: overrides WebGL detection. */
  readonly webgl?: boolean;
}

/** Frames drawn after a restart before the still is taken away. */
const COVER_FRAMES = 2;

function defaultScripting(): ClipScripting | null {
  const bridge = (globalThis as { msm?: { scripting?: ClipScripting } }).msm;
  return bridge?.scripting ?? null;
}

function scriptsOf(scripting: ClipScripting | null): TryItScripts | undefined {
  if (scripting === null) return undefined;
  return { transpile: (source, name) => scripting.transpile(source, name), api: SCRIPT_API };
}

/** A live clip over Try it's renderer, with its captions. */
export function ClipView(props: ClipViewProps) {
  const { clip, example, target, vanillaBlockstates } = props;
  // The registry and plugins, not the `deps` object, so a host's fresh object rebuilds nothing.
  const { registry, plugins } = props.deps;
  const [playing, setPlaying] = useState<{ player: ClipPlayer; files: ExampleFiles } | null>(null);
  const player = playing?.player ?? null;
  const [failed, setFailed] = useState(false);
  const [captions, setCaptions] = useState<readonly string[]>([]);
  const [covered, setCovered] = useState(true);
  const host = useRef<HTMLDivElement | null>(null);
  const loops = useRef(0);
  const coverLeft = useRef(-1);
  const ended = useRef(false);
  const shownCaptions = useRef('');
  const scripting = props.scripting === undefined ? defaultScripting() : props.scripting;
  const scriptingRef = useRef(scripting);
  scriptingRef.current = scripting;
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    let live = true;
    let made: ClipPlayer | null = null;
    setPlaying(null);
    setFailed(false);
    setCovered(true);
    loops.current = 0;
    coverLeft.current = -1;
    ended.current = false;
    exampleFiles(example, target, { registry, plugins }).then(
      (files) => {
        if (!live) return;
        const scripts = scriptsOf(scriptingRef.current);
        made = new ClipPlayer({
          clip,
          example: files,
          ...(scripts === undefined ? {} : { scripts }),
          ...(vanillaBlockstates === undefined ? {} : { vanillaBlockstates }),
        });
        setPlaying({ player: made, files });
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
      made?.dispose();
    };
  }, [clip, example, target, registry, plugins, vanillaBlockstates]);

  const fluids = useMemo(
    () => (player === null ? new Map() : fluidLooks(player.area.source.fluids.catalogue.all())),
    [player],
  );
  const vehicles = useMemo(() => {
    if (player === null) return null;
    const source = player.area.source;
    return {
      snapshots: () => source.vehicles.snapshots(),
      kind: (type: string) => source.vehicles.types.get(type),
      log: source.log,
    };
  }, [player]);

  const onFrame = (elapsed: number): void => {
    // The clip starts with its first drawn frame (B565: the resources load first).
    if (player === null || ended.current || coverLeft.current < 0) return;
    player.advance(elapsed);
    if (player.loops > loops.current) {
      loops.current = player.loops;
      if (callbacks.current.once === true) {
        ended.current = true;
        callbacks.current.onEnd?.();
        return;
      }
      coverLeft.current = COVER_FRAMES;
      setCovered(true);
    }
    const now = player.captions().map((caption) => caption.text);
    const key = now.join('\n');
    if (key !== shownCaptions.current) {
      shownCaptions.current = key;
      setCaptions(now);
    }
  };

  const onFrameDrawn = (): void => {
    if (player === null) return;
    if (coverLeft.current < 0) {
      // The first frame is drawn: the still comes off.
      coverLeft.current = 0;
      setCovered(false);
    } else if (coverLeft.current > 0) {
      coverLeft.current -= 1;
      if (coverLeft.current === 0) setCovered(false);
    }
    const key = callbacks.current.stillKey;
    if (player.loops === 0 && player.tick >= clip.stillAt && !hasStill(key)) {
      const canvas = host.current?.querySelector('canvas');
      if (canvas !== null && canvas !== undefined) {
        try {
          keepStill(key, canvas.toDataURL('image/png'));
        } catch {
          // No still this time; the drawn one stays.
        }
      }
    }
  };

  const label = `Clip: ${clip.title}`;
  return (
    <div ref={host} className="relative size-full" data-testid={`showcase-clip-${clip.id}`}>
      {playing !== null && player !== null && vehicles !== null && (
        <TryItScene
          grid={player.area.source.world}
          camera={() => player.camera()}
          files={player.area.files}
          folders={player.area.target.folders.resource}
          vanilla={props.vanilla}
          readProjectAsset={playing.files.readAsset}
          particles={player.area.particles}
          mobs={player.area.mobField}
          vehicles={vehicles}
          fluids={fluids}
          partialTick={() => player.alpha}
          smaller
          onFrame={onFrame}
          onFrameDrawn={onFrameDrawn}
          onWebGLUnavailable={() => callbacks.current.onWebGLUnavailable?.()}
          label={label}
          {...(props.webgl === undefined ? {} : { webgl: props.webgl })}
        />
      )}
      {(covered || player === null) && props.still !== null && (
        <img
          src={props.still}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-cover [image-rendering:pixelated]"
          data-testid="showcase-clip-cover"
        />
      )}
      {failed && (
        <p className="absolute inset-x-0 bottom-0 bg-bg/80 p-1 text-center text-xs" role="status">
          This clip could not be made.
        </p>
      )}
      {captions.length > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center gap-0.5 px-2"
          data-testid="showcase-captions"
        >
          {captions.map((text) => (
            <span key={text} className="rounded bg-black/70 px-1.5 py-0.5 text-white text-xs">
              {text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ClipView;
