/**
 * The WebGL preview over deepslate's own renderers (ADR 0010). This module and everything it
 * imports from deepslate and gl-matrix load lazily: `PreviewPanel` imports it with `lazy()`
 * only after it has confirmed that WebGL is available.
 *
 * A block model or blockstate renders as a one-block structure that the user can orbit (drag or
 * arrow keys) and zoom (wheel or +/-). An item definition, or a model whose parents end at
 * `builtin/generated`, renders in the fixed GUI item view.
 *
 * When a texture is animated (a `.png.mcmeta` sidecar), a frame scrubber steps through the
 * first animated texture's frames; every animated texture shows the frame of its own loop at
 * that step's start tick. Only the atlas is re-uploaded per step; the scene is kept.
 */

import { Structure } from 'deepslate/core';
import { ItemRenderer, StructureRenderer } from 'deepslate/render';
import { mat4 } from 'gl-matrix';
import { RotateCcw } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { iconButtonClass } from '../components/ui/Button';
import { stepStartTick } from './animation';
import {
  type AnimatedTexture,
  createPreviewResources,
  type PreviewResources,
  type PreviewResourcesOptions,
} from './asset-source';
import { FrameScrubber } from './FrameScrubber';

/** Props: the same inputs as {@link createPreviewResources}. */
export type PreviewCanvasProps = PreviewResourcesOptions & {
  /** Called when the canvas cannot get a WebGL context after all. */
  onWebGLUnavailable?: () => void;
};

interface View {
  yaw: number;
  pitch: number;
  distance: number;
}

const DEFAULT_VIEW: View = { yaw: Math.PI / 4, pitch: Math.PI / 6, distance: 2.2 };
const REBUILD_DELAY_MS = 100;
const MIN_DISTANCE = 1.2;
const MAX_DISTANCE = 8;
const KEY_STEP = Math.PI / 24;

type Status =
  | { state: 'loading' }
  | {
      state: 'ready';
      info: Pick<
        PreviewResources,
        'missingModels' | 'missingTextures' | 'usedFallback' | 'mode' | 'animations'
      >;
    }
  | { state: 'error'; message: string };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** A live renderer bound to one canvas. */
interface Scene {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  draw(view: View): void;
  /** Re-uploads the atlas image after an animation step; `false` when it cannot. */
  updateAtlas(image: ImageData): boolean;
}

/**
 * Replaces the pixels of a deepslate renderer's atlas texture in place. deepslate keeps the
 * texture in a private `atlasTexture` field and offers no setter, so the field is read
 * defensively; without it the animation stays on its current frame.
 */
function atlasUpdater(gl: WebGLRenderingContext, renderer: object): (image: ImageData) => boolean {
  return (image) => {
    const texture = (renderer as { atlasTexture?: unknown }).atlasTexture;
    if (!(texture instanceof WebGLTexture)) return false;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    return true;
  };
}

function createScene(prepared: PreviewResources): Scene | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'block size-full';
  const gl = canvas.getContext('webgl');
  if (gl === null) return null;
  const resize = (): void => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };
  const clear = (): void => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  };
  if (prepared.mode === 'item') {
    const renderer = new ItemRenderer(gl, prepared.item, prepared.resources, {
      display_context: 'gui',
    });
    return {
      canvas,
      gl,
      updateAtlas: atlasUpdater(gl, renderer),
      draw: () => {
        resize();
        renderer.setViewport(0, 0, canvas.width, canvas.height);
        clear();
        renderer.drawItem();
      },
    };
  }
  const structure = new Structure([1, 1, 1]).addBlock(
    [0, 0, 0],
    prepared.block.name,
    prepared.block.properties,
  );
  const renderer = new StructureRenderer(gl, structure, prepared.resources, {
    chunkSize: 16,
    useInvisibleBlockBuffer: false,
  });
  return {
    canvas,
    gl,
    updateAtlas: atlasUpdater(gl, renderer),
    draw: (view) => {
      resize();
      renderer.setViewport(0, 0, canvas.width, canvas.height);
      clear();
      const matrix = mat4.create();
      mat4.translate(matrix, matrix, [0, 0, -view.distance]);
      mat4.rotateX(matrix, matrix, view.pitch);
      mat4.rotateY(matrix, matrix, view.yaw);
      mat4.translate(matrix, matrix, [-0.5, -0.5, -0.5]);
      renderer.drawStructure(matrix);
    },
  };
}

function disposeScene(scene: Scene | null): void {
  if (scene === null) return;
  scene.gl.getExtension('WEBGL_lose_context')?.loseContext();
  scene.canvas.remove();
}

/** Renders the preview subject; rebuilds 100 ms after its inputs stop changing. */
export default function PreviewCanvas(props: PreviewCanvasProps) {
  const { project, folders, subject, vanilla, vanillaJson, fallbackModels } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const viewRef = useRef<View>({ ...DEFAULT_VIEW });
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const callbacksRef = useRef(props);
  callbacksRef.current = props;
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const preparedRef = useRef<PreviewResources | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const primary: AnimatedTexture | undefined =
    status.state === 'ready' ? status.info.animations[0] : undefined;
  const frameCount = primary?.animation.frames.length ?? 0;
  const shownStep = frameCount === 0 ? 0 : step % frameCount;
  const tick = primary === undefined ? 0 : stepStartTick(primary.animation, shownStep);
  const tickRef = useRef(tick);
  tickRef.current = tick;

  const showTick = useCallback(async (prepared: PreviewResources, at: number): Promise<void> => {
    try {
      const changed = await prepared.showTick(at);
      const scene = sceneRef.current;
      if (!changed || preparedRef.current !== prepared || scene === null) return;
      scene.updateAtlas(prepared.resources.getTextureAtlas());
      requestDrawRef.current();
    } catch {
      // The frame could not be built; the previous frame stays.
    }
  }, []);
  const requestDrawRef = useRef<() => void>(() => {});

  const requestDraw = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      try {
        sceneRef.current?.draw(viewRef.current);
      } catch (error) {
        setStatus({
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }, []);

  requestDrawRef.current = requestDraw;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const { readProjectAsset, onWebGLUnavailable, createAtlas } = callbacksRef.current;
      createPreviewResources({
        project,
        folders,
        subject,
        readProjectAsset,
        vanilla,
        ...(vanillaJson === undefined ? {} : { vanillaJson }),
        ...(fallbackModels === undefined ? {} : { fallbackModels }),
        ...(createAtlas === undefined ? {} : { createAtlas }),
      })
        .then((prepared) => {
          if (cancelled) return;
          const scene = createScene(prepared);
          disposeScene(sceneRef.current);
          sceneRef.current = scene;
          preparedRef.current = prepared;
          if (scene === null) {
            onWebGLUnavailable?.();
            setStatus({ state: 'error', message: 'Preview unavailable: WebGL is disabled.' });
            return;
          }
          hostRef.current?.append(scene.canvas);
          setStatus({
            state: 'ready',
            info: {
              missingModels: prepared.missingModels,
              missingTextures: prepared.missingTextures,
              usedFallback: prepared.usedFallback,
              mode: prepared.mode,
              animations: prepared.animations,
            },
          });
          requestDraw();
          // The atlas starts at tick 0; catch up with the step the scrubber shows.
          if (tickRef.current !== 0) void showTick(prepared, tickRef.current);
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
  }, [project, folders, subject, vanilla, vanillaJson, fallbackModels, requestDraw, showTick]);

  // A different animated texture starts from its first frame, paused.
  const primaryId = primary?.id;
  useEffect(() => {
    if (primaryId === undefined) return;
    setStep(0);
    setPlaying(false);
  }, [primaryId]);

  // Step the animation: rebuild the atlas for the tick and re-upload it.
  useEffect(() => {
    const prepared = preparedRef.current;
    if (prepared === null || prepared.animations.length === 0) return;
    void showTick(prepared, tick);
  }, [tick, showTick]);

  // Dispose the last scene on unmount; redraw when the host resizes.
  useEffect(() => {
    const host = hostRef.current;
    const observer =
      host !== null && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => requestDraw())
        : null;
    if (host !== null) observer?.observe(host);
    return () => {
      observer?.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      disposeScene(sceneRef.current);
      sceneRef.current = null;
      preparedRef.current = null;
    };
  }, [requestDraw]);

  const orbit = status.state === 'ready' && status.info.mode === 'block';

  const update = (change: (view: View) => void): void => {
    if (!orbit) return;
    change(viewRef.current);
    viewRef.current.pitch = clamp(viewRef.current.pitch, -Math.PI / 2, Math.PI / 2);
    viewRef.current.distance = clamp(viewRef.current.distance, MIN_DISTANCE, MAX_DISTANCE);
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
    if (change === undefined || !orbit) return;
    event.preventDefault();
    update(change);
  };
  const reset = (): void => {
    viewRef.current = { ...DEFAULT_VIEW };
    requestDraw();
  };

  // React registers `wheel` as passive, so zoom is attached natively to allow preventDefault.
  useEffect(() => {
    const host = hostRef.current;
    if (host === null || !orbit) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      viewRef.current.distance = clamp(
        viewRef.current.distance * Math.exp(event.deltaY / 500),
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
      requestDraw();
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [orbit, requestDraw]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded border border-border bg-bg">
        <div
          ref={hostRef}
          role="img"
          aria-label={`3D preview of ${subject.id}${orbit ? '. Drag or use the arrow keys to rotate, wheel or plus and minus to zoom.' : ''}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the 3D view is operated with the arrow keys and +/- once focused
          tabIndex={0}
          className="size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
        {orbit ? (
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
      {primary !== undefined ? (
        <FrameScrubber
          textureId={primary.id}
          frames={primary.animation.frames}
          step={shownStep}
          playing={playing}
          onStepChange={setStep}
          onPlayingChange={setPlaying}
        />
      ) : null}
      {status.state === 'ready' ? <PreviewNotes info={status.info} /> : null}
    </div>
  );
}

function PreviewNotes({
  info,
}: {
  info: Pick<PreviewResources, 'missingModels' | 'missingTextures' | 'usedFallback'>;
}) {
  return (
    <ul className="flex flex-col gap-1 text-xs text-muted">
      {info.usedFallback ? (
        <li>Some parent models use MSM stand-ins; the game may show them differently.</li>
      ) : null}
      {info.missingModels.length > 0 ? (
        <li className="text-warning">Missing models: {info.missingModels.join(', ')}</li>
      ) : null}
      {info.missingTextures.length > 0 ? (
        <li className="text-warning">Missing textures: {info.missingTextures.join(', ')}</li>
      ) : null}
    </ul>
  );
}
