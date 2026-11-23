/**
 * A stand-in body turning on its own (B627; ADR 0121 D4, D9): MSM's geo renderer
 * (`preview/geo/renderer.ts`) over a body of `looks/bodies/` and one composed picture. The body
 * turns slowly unless the viewer asked for less motion; dragging or the arrow keys turn it by
 * hand. No animation: the stand-ins do not walk (3L4). Loaded only on a machine with WebGL.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { mat4 } from 'gl-matrix';
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import {
  type BakedModel,
  bakeGeometry,
  boneMatrices,
  modelBounds,
} from '../../../preview/geo/geometry';
import { createGeoRenderer, type GeoRenderer } from '../../../preview/geo/renderer';

/** A composed picture: RGBA texels, row by row. */
export interface BodySheet {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** Props of {@link BodyCanvas}. */
export interface BodyCanvasProps {
  /** The body's geo JSON, already at the scale the game draws it. */
  readonly geo: Json;
  /** The picture it wears, or `null` for the missing-picture checker. */
  readonly sheet: BodySheet | null;
  /** What the body is, for the accessible label. */
  readonly label: string;
  /** Whether it turns on its own (off under reduced motion). */
  readonly turning: boolean;
  readonly testId?: string;
}

const FOV = (70 * Math.PI) / 180;

/** The centre of the body's bounds (blocks) and a distance that fits it in view. */
export function bodyFraming(model: BakedModel): {
  centre: [number, number, number];
  distance: number;
} {
  const bounds = modelBounds(model);
  const min = (bounds?.min ?? [-8, 0, -8]).map((v) => v / 16);
  const max = (bounds?.max ?? [8, 16, 8]).map((v) => v / 16);
  const size = [0, 1, 2].map((i) => (max[i] ?? 0) - (min[i] ?? 0));
  const radius = Math.max(0.3, Math.hypot(size[0] ?? 0, size[1] ?? 0, size[2] ?? 0) / 2);
  return {
    centre: [0, 1, 2].map((i) => ((min[i] ?? 0) + (max[i] ?? 0)) / 2) as [number, number, number],
    distance: radius / Math.sin(FOV / 2) + 0.3,
  };
}
const TURN_PER_SECOND = 0.6;
const KEY_STEP = Math.PI / 24;

interface Live {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  renderer: GeoRenderer;
  model: BakedModel;
  centre: [number, number, number];
  distance: number;
}

function dispose(live: Live | null): void {
  if (live === null) return;
  live.renderer.dispose();
  live.gl.getExtension('WEBGL_lose_context')?.loseContext();
  live.canvas.remove();
}

/** The body; see the module comment. */
export default function BodyCanvas(props: BodyCanvasProps) {
  const { geo, sheet, turning } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<Live | null>(null);
  const yawRef = useRef(Math.PI - Math.PI / 6);
  const pitchRef = useRef(Math.PI / 10);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draw = (): void => {
    const live = liveRef.current;
    if (live === null) return;
    const { canvas, gl, renderer, model, centre, distance } = live;
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
    const view = mat4.create();
    mat4.translate(view, view, [0, 0, -distance]);
    mat4.rotateX(view, view, pitchRef.current);
    mat4.rotateY(view, view, yawRef.current);
    mat4.translate(view, view, [-centre[0], -centre[1], -centre[2]]);
    const root = mat4.fromScaling(mat4.create(), [1 / 16, 1 / 16, 1 / 16]);
    renderer.draw(projection, view, boneMatrices(model, new Map(), root));
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // Build: bake the body, upload the picture.
  useEffect(() => {
    setError(null);
    const canvas = document.createElement('canvas');
    canvas.className = 'block size-full';
    const gl = canvas.getContext('webgl');
    if (gl === null) {
      setError('The 3D body is unavailable: WebGL is disabled.');
      return;
    }
    try {
      const model = bakeGeometry(geo);
      const image =
        sheet === null
          ? null
          : new ImageData(new Uint8ClampedArray(sheet.data), sheet.width, sheet.height);
      const renderer = createGeoRenderer(gl, model, image, { extent: 2, cell: 1 });
      const framing = bodyFraming(model);
      dispose(liveRef.current);
      liveRef.current = {
        canvas,
        gl,
        renderer,
        model,
        centre: framing.centre,
        distance: framing.distance,
      };
      hostRef.current?.replaceChildren(canvas);
      drawRef.current();
    } catch (cause) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [geo, sheet]);

  // Turning: one frame loop only while it turns.
  useEffect(() => {
    if (!turning) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number): void => {
      if (last !== null && dragRef.current === null) {
        yawRef.current += ((now - last) / 1000) * TURN_PER_SECOND;
      }
      last = now;
      drawRef.current();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [turning]);

  // Redraw on resize; dispose on unmount.
  useEffect(() => {
    const host = hostRef.current;
    const observer =
      host !== null && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => drawRef.current())
        : null;
    if (host !== null) observer?.observe(host);
    return () => {
      observer?.disconnect();
      dispose(liveRef.current);
      liveRef.current = null;
    };
  }, []);

  const turnBy = (yaw: number, pitch: number): void => {
    yawRef.current += yaw;
    pitchRef.current = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, pitchRef.current + pitch));
    drawRef.current();
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const last = dragRef.current;
    if (last === null) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    turnBy((event.clientX - last.x) / 100, (event.clientY - last.y) / 100);
  };
  const onPointerUp = (): void => {
    dragRef.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const change = step[event.key];
    if (change === undefined) return;
    event.preventDefault();
    turnBy(change[0], change[1]);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded border border-border bg-bg">
        <div
          ref={hostRef}
          data-testid={props.testId ?? 'body-canvas'}
          role="img"
          aria-label={`${props.label}. Drag or use the arrow keys to turn it.`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the body is turned with the arrow keys once focused
          tabIndex={0}
          className="size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
      </div>
      {error !== null && (
        <p role="alert" className="text-error text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
