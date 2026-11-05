/**
 * The geo model preview (ADR 0029 D5): a raw WebGL canvas that draws a baked Bedrock geometry
 * with its texture, an orbit camera fitted to the model and a ground grid, plus animation
 * playback with play, pause, a time slider and an animation picker. Loaded lazily by
 * `PreviewPanel` only for `geo_model`, `animation` and `entity` subjects on a machine with
 * WebGL, so gl-matrix and the renderer stay out of the main chunk.
 *
 * `requestAnimationFrame` runs only while an animation plays and is cancelled on pause and on
 * unmount; otherwise a frame is drawn on demand (view changes, scrubbing, resizes).
 */

import { mat4 } from 'gl-matrix';
import { RotateCcw } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { iconButtonClass } from '../../components/ui/Button';
import type { ResourceFolders } from '../model-chain';
import { textureLocations } from '../model-chain';
import { AnimationTransport } from './AnimationTransport';
import {
  type BakedModel,
  type BonePose,
  bakeGeometry,
  boneMatrices,
  modelBounds,
} from './geometry';
import {
  animationNotices,
  type ParsedAnimation,
  parseAnimations,
  playbackTime,
  samplePose,
} from './keyframes';
import { createGeoRenderer, type GeoRenderer } from './renderer';
import type { GeoScene } from './subject';

/** Props of {@link GeoCanvas}. */
export interface GeoCanvasProps {
  /** The resolved scene (see `resolveGeoScene`). */
  scene: Extract<GeoScene, { ok: true }>;
  /** The subject's id, for the accessible label. */
  subjectId: string;
  folders: ResourceFolders;
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  onWebGLUnavailable?: () => void;
}

interface View {
  yaw: number;
  pitch: number;
  distance: number;
}

interface Framing {
  centre: [number, number, number];
  distance: number;
  minDistance: number;
  maxDistance: number;
}

/** Model units per block. */
const UNITS_PER_BLOCK = 16;
const FOV = (70 * Math.PI) / 180;
/** Front three-quarter view: Bedrock models face north (-z). */
const DEFAULT_VIEW: View = { yaw: Math.PI - Math.PI / 6, pitch: Math.PI / 8, distance: 3 };
const KEY_STEP = Math.PI / 24;
const REBUILD_DELAY_MS = 100;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Centres the camera on the model's rest bounds (blocks) and fits the distance. */
export function geoFraming(model: BakedModel, scale: number): Framing {
  const bounds = modelBounds(model);
  const factor = scale / UNITS_PER_BLOCK;
  const min = bounds?.min.map((v) => v * factor) ?? [-0.5, 0, -0.5];
  const max = bounds?.max.map((v) => v * factor) ?? [0.5, 1, 0.5];
  const size = [0, 1, 2].map((i) => (max[i] as number) - (min[i] as number));
  const radius = Math.max(0.5, Math.hypot(size[0] ?? 0, size[1] ?? 0, size[2] ?? 0) / 2);
  const distance = radius / Math.sin(FOV / 2) + 0.5;
  return {
    centre: [0, 1, 2].map((i) => ((min[i] as number) + (max[i] as number)) / 2) as [
      number,
      number,
      number,
    ],
    distance,
    minDistance: Math.max(0.3, radius * 0.6),
    maxDistance: distance * 4,
  };
}

interface Live {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  renderer: GeoRenderer;
  model: BakedModel;
  framing: Framing;
}

function dispose(live: Live | null): void {
  if (live === null) return;
  live.renderer.dispose();
  live.gl.getExtension('WEBGL_lose_context')?.loseContext();
  live.canvas.remove();
}

async function decodeTexture(bytes: Uint8Array | null): Promise<ImageBitmap | null> {
  if (bytes === null) return null;
  try {
    return await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
  } catch {
    return null;
  }
}

type Status =
  | { state: 'loading' }
  | { state: 'ready'; problems: string[]; missingTexture: string | null }
  | { state: 'error'; message: string };

/** Renders a geo scene; rebuilds 100 ms after the model or texture changes. */
export default function GeoCanvas(props: GeoCanvasProps) {
  const { scene, folders } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<Live | null>(null);
  const viewRef = useRef<View>({ ...DEFAULT_VIEW });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const drawFrameRef = useRef<number | null>(null);
  const callbacksRef = useRef(props);
  callbacksRef.current = props;
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  // Animation state.
  const animations = useMemo<ParsedAnimation[]>(
    () => (scene.animations === null ? [] : parseAnimations(scene.animations)),
    [scene.animations],
  );
  const [selected, setSelected] = useState<string | null>(scene.initialAnimation);
  const [playing, setPlaying] = useState(scene.initialAnimation !== null);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const current = animations.find((animation) => animation.name === selected);
  const currentRef = useRef(current);
  currentRef.current = current;
  const scaleRef = useRef(scene.scale);
  scaleRef.current = scene.scale;

  // A different initial animation (another subject, or the entity's idle changed) restarts.
  useEffect(() => {
    setSelected(scene.initialAnimation);
    setPlaying(scene.initialAnimation !== null);
    elapsedRef.current = 0;
    setElapsed(0);
  }, [scene.initialAnimation]);

  const drawNow = useCallback(() => {
    const live = liveRef.current;
    if (live === null) return;
    const { canvas, gl, renderer, model, framing } = live;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const projection = mat4.perspective(mat4.create(), FOV, width / height, 0.05, 500);
    const view = viewRef.current;
    const viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, [0, 0, -view.distance]);
    mat4.rotateX(viewMatrix, viewMatrix, view.pitch);
    mat4.rotateY(viewMatrix, viewMatrix, view.yaw);
    mat4.translate(viewMatrix, viewMatrix, [
      -framing.centre[0],
      -framing.centre[1],
      -framing.centre[2],
    ]);
    const factor = scaleRef.current / UNITS_PER_BLOCK;
    const root = mat4.fromScaling(mat4.create(), [factor, factor, factor]);
    const animation = currentRef.current;
    let pose: ReadonlyMap<string, BonePose> = new Map();
    if (animation !== undefined) {
      const at = playbackTime(animation, elapsedRef.current);
      if (!at.rest) pose = samplePose(animation, at.time);
    }
    renderer.draw(projection, viewMatrix, boneMatrices(model, pose, root));
  }, []);

  const requestDraw = useCallback(() => {
    if (drawFrameRef.current !== null) return;
    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null;
      try {
        drawNow();
      } catch (error) {
        setStatus({
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }, [drawNow]);

  // Build the scene: bake the model, load the texture, create the renderer.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const model = bakeGeometry(scene.model);
      const texture = scene.textureId === '' ? null : textureLocations(scene.textureId, folders);
      const read =
        texture === null
          ? Promise.resolve(null)
          : callbacksRef.current
              .readProjectAsset(texture.namespace, texture.projectPath)
              .catch(() => null);
      read
        .then(decodeTexture)
        .then((image) => {
          if (cancelled) {
            image?.close();
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.className = 'block size-full';
          const gl = canvas.getContext('webgl');
          if (gl === null) {
            image?.close();
            callbacksRef.current.onWebGLUnavailable?.();
            setStatus({ state: 'error', message: 'Preview unavailable: WebGL is disabled.' });
            return;
          }
          const framing = geoFraming(model, scaleRef.current);
          const extent = Math.max(2, Math.ceil(framing.distance));
          const renderer = createGeoRenderer(gl, model, image, { extent, cell: 1 });
          image?.close();
          const previous = liveRef.current;
          dispose(previous);
          if (
            previous === null ||
            previous.framing.distance !== framing.distance ||
            previous.framing.centre.some((v, i) => v !== framing.centre[i])
          ) {
            viewRef.current = { ...viewRef.current, distance: framing.distance };
          }
          liveRef.current = { canvas, gl, renderer, model, framing };
          hostRef.current?.append(canvas);
          setStatus({
            state: 'ready',
            problems: model.problems,
            missingTexture:
              image !== null
                ? null
                : texture === null
                  ? 'no texture chosen'
                  : `${texture.namespace}:${texture.projectPath}`,
          });
          requestDraw();
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setStatus({
            state: 'error',
            message: `Preview failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        });
    }, REBUILD_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scene.model, scene.textureId, scene.scale, folders, requestDraw]);

  // Playback: requestAnimationFrame only while playing.
  useEffect(() => {
    if (!playing || current === undefined) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number): void => {
      const dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      elapsedRef.current += dt;
      const at = playbackTime(current, elapsedRef.current);
      setElapsed(elapsedRef.current);
      try {
        drawNow();
      } catch {
        // A failed frame is skipped; the next one tries again.
      }
      if (at.finished) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, current, drawNow]);

  // Redraw when the animation or its data changes while paused.
  useEffect(() => {
    void current;
    requestDraw();
  }, [current, requestDraw]);

  // Dispose on unmount; redraw when the host resizes.
  useEffect(() => {
    const host = hostRef.current;
    const observer =
      host !== null && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => requestDraw())
        : null;
    if (host !== null) observer?.observe(host);
    return () => {
      observer?.disconnect();
      if (drawFrameRef.current !== null) cancelAnimationFrame(drawFrameRef.current);
      drawFrameRef.current = null;
      dispose(liveRef.current);
      liveRef.current = null;
    };
  }, [requestDraw]);

  const ready = status.state === 'ready';
  const update = (change: (view: View) => void): void => {
    const framing = liveRef.current?.framing;
    if (framing === undefined) return;
    change(viewRef.current);
    viewRef.current.pitch = clamp(viewRef.current.pitch, -Math.PI / 2, Math.PI / 2);
    viewRef.current.distance = clamp(
      viewRef.current.distance,
      framing.minDistance,
      framing.maxDistance,
    );
    requestDraw();
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const last = dragRef.current;
    if (last === null) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    update((view) => {
      view.yaw += (event.clientX - last.x) / 100;
      view.pitch += (event.clientY - last.y) / 100;
    });
  };
  const onPointerUp = (): void => {
    dragRef.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const changes: Record<string, (view: View) => void> = {
      ArrowLeft: (view) => {
        view.yaw -= KEY_STEP;
      },
      ArrowRight: (view) => {
        view.yaw += KEY_STEP;
      },
      ArrowUp: (view) => {
        view.pitch -= KEY_STEP;
      },
      ArrowDown: (view) => {
        view.pitch += KEY_STEP;
      },
      '+': (view) => {
        view.distance /= 1.1;
      },
      '=': (view) => {
        view.distance /= 1.1;
      },
      '-': (view) => {
        view.distance *= 1.1;
      },
    };
    const change = changes[event.key];
    if (change === undefined) return;
    event.preventDefault();
    update(change);
  };
  const reset = (): void => {
    viewRef.current = { ...DEFAULT_VIEW, distance: liveRef.current?.framing.distance ?? 3 };
    requestDraw();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (host === null || !ready) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      update((view) => {
        view.distance *= Math.exp(event.deltaY / 500);
      });
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  });

  const notices = [...scene.notices, ...animationNotices(current)];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded border border-border bg-bg">
        <div
          ref={hostRef}
          data-testid="preview-geo-canvas"
          role="img"
          aria-label={`3D preview of ${props.subjectId} (model ${scene.modelId}). Drag or use the arrow keys to rotate, wheel or plus and minus to zoom.`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the 3D view is operated with the arrow keys and +/- once focused
          tabIndex={0}
          className="size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
        {ready ? (
          <button
            type="button"
            className={`${iconButtonClass} absolute top-1 right-1`}
            aria-label="Reset view"
            title="Reset view"
            onClick={reset}
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        ) : null}
        {status.state === 'loading' ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted">
            Loading preview…
          </p>
        ) : null}
      </div>
      {status.state === 'error' ? (
        <p role="alert" className="text-sm text-error">
          {status.message}
        </p>
      ) : null}
      {animations.length > 0 ? (
        <AnimationTransport
          animations={animations}
          selected={selected}
          current={current}
          elapsed={elapsed}
          playing={playing}
          onSelect={(name) => {
            setSelected(name);
            elapsedRef.current = 0;
            setElapsed(0);
            setPlaying(name !== null);
          }}
          onPlayingChange={(next) => {
            if (
              next &&
              current !== undefined &&
              playbackTime(current, elapsedRef.current).finished
            ) {
              elapsedRef.current = 0;
              setElapsed(0);
            }
            setPlaying(next);
          }}
          onScrub={(time) => {
            setPlaying(false);
            elapsedRef.current = time;
            setElapsed(time);
            requestDraw();
          }}
        />
      ) : null}
      <ul className="flex flex-col gap-1 text-xs text-muted" data-testid="preview-geo-notes">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
        {status.state === 'ready' && status.missingTexture !== null ? (
          <li className="text-warning">
            Missing texture ({status.missingTexture}); drawn with the missing texture.
          </li>
        ) : null}
        {status.state === 'ready'
          ? status.problems.map((problem) => (
              <li key={problem} className="text-warning">
                {problem}
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}
