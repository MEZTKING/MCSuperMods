/**
 * The Vehicle Studio's 3D preview (B419, ADR 0091 D1): the geo preview's renderer (`preview/geo/`)
 * drawing the vehicle's geometry posed by `vehicle-pose.ts`. Dragging orbits the camera; moving
 * the mouse without a button aims the turret where the mouse points on the turret's level; the
 * "Drive" slider rolls the wheels and spins rotors and propellers, "Steer" turns the steering
 * bones. Seats (numbered) and muzzles show as markers over the canvas; a muzzle on a bone moves
 * with it. Loaded lazily by `VehiclePreview` so gl-matrix stays out of the Studio's own chunk.
 *
 * `requestAnimationFrame` runs only while driving; otherwise frames are drawn on demand.
 *
 * @packageDocumentation
 */

import { mat4, vec3, vec4 } from 'gl-matrix';
import { RotateCcw } from 'lucide-react';
import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { iconButtonClass } from '../../../components/ui/Button';
import { geoFraming } from '../../../preview/geo/GeoCanvas';
import { type BakedModel, bakeGeometry, boneMatrices } from '../../../preview/geo/geometry';
import { createGeoRenderer, type GeoRenderer } from '../../../preview/geo/renderer';
import {
  advanceDrive,
  REST_POSE_STATE,
  turretYawFromRay,
  type VehiclePoseState,
  type VehicleRig,
  vehiclePose,
} from '../../../preview/geo/vehicle-pose';
import { type ResourceFolders, textureLocations } from '../../../preview/model-chain';

/** A marker drawn over the canvas. */
export interface VehicleMarker {
  key: string;
  label: string;
  /** Vehicle space (blocks; x right, y up, z forwards). */
  offset: readonly [number, number, number];
  /** A bone the marker moves with. */
  bone?: string | undefined;
  kind: 'seat' | 'muzzle' | 'exhaust';
}

/** Props of the lazy canvas. */
export interface VehicleCanvasProps {
  geometry: unknown;
  textureId: string;
  scale: number;
  rig: VehicleRig;
  markers: readonly VehicleMarker[];
  /** -1 to 1. */
  throttle: number;
  /** -1 to 1. */
  steer: number;
  /** Top speed in blocks a tick, for the wheels. */
  maxSpeed: number;
  folders: ResourceFolders;
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  /** Changes when asset bytes may have changed. */
  revision: number;
  /** Called with the turret yaw when the mouse aims it. */
  onAim?(yaw: number): void;
  label: string;
}

const UNITS_PER_BLOCK = 16;
const FOV = (70 * Math.PI) / 180;
const DEFAULT_VIEW = { yaw: Math.PI - Math.PI / 6, pitch: Math.PI / 7, distance: 3 };

interface Live {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  renderer: GeoRenderer;
  model: BakedModel;
  framing: ReturnType<typeof geoFraming>;
}

function dispose(live: Live | null): void {
  if (live === null) return;
  live.renderer.dispose();
  live.gl.getExtension('WEBGL_lose_context')?.loseContext();
  live.canvas.remove();
}

const MARKER_CLASSES: Readonly<Record<VehicleMarker['kind'], string>> = {
  seat: 'bg-accent text-white',
  muzzle: 'bg-error text-white',
  exhaust: 'bg-muted text-white',
};

export default function VehicleCanvas(props: VehicleCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<Live | null>(null);
  const viewRef = useRef({ ...DEFAULT_VIEW });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const poseRef = useRef<VehiclePoseState>({ ...REST_POSE_STATE });
  const markerRefs = useRef(new Map<string, HTMLDivElement>());
  const frameRef = useRef<number | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [status, setStatus] = useState<'loading' | 'ready' | string>('loading');

  const matrices = useCallback(() => {
    const live = liveRef.current;
    if (live === null) return null;
    const { canvas, framing, model } = live;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
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
    const factor = latest.current.scale / UNITS_PER_BLOCK;
    const root = mat4.fromScaling(mat4.create(), [factor, factor, factor]);
    const rest = boneMatrices(model, new Map(), root);
    const posed = boneMatrices(model, vehiclePose(latest.current.rig, poseRef.current), root);
    return { width, height, projection, viewMatrix, rest, posed };
  }, []);

  const drawNow = useCallback(() => {
    const live = liveRef.current;
    const m = matrices();
    if (live === null || m === null) return;
    const { canvas, gl, renderer, model } = live;
    if (canvas.width !== m.width || canvas.height !== m.height) {
      canvas.width = m.width;
      canvas.height = m.height;
    }
    gl.viewport(0, 0, m.width, m.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    renderer.draw(m.projection, m.viewMatrix, m.posed);
    // Markers: project each point (moved with its bone) to the canvas.
    const clip = mat4.multiply(mat4.create(), m.projection, m.viewMatrix);
    for (const marker of latest.current.markers) {
      const element = markerRefs.current.get(marker.key);
      if (element === undefined) continue;
      const point = vec3.fromValues(marker.offset[0], marker.offset[1], -marker.offset[2]);
      const index =
        marker.bone === undefined ? -1 : model.bones.findIndex((bone) => bone.name === marker.bone);
      if (index >= 0) {
        const move = mat4.multiply(
          mat4.create(),
          m.posed[index] as mat4,
          mat4.invert(mat4.create(), m.rest[index] as mat4) ?? mat4.create(),
        );
        vec3.transformMat4(point, point, move);
      }
      const at = vec4.transformMat4(vec4.create(), [point[0], point[1], point[2], 1], clip);
      const w = at[3];
      if (w <= 0) {
        element.style.display = 'none';
        continue;
      }
      element.style.display = '';
      element.style.left = `${((at[0] / w + 1) / 2) * 100}%`;
      element.style.top = `${((1 - at[1] / w) / 2) * 100}%`;
    }
  }, [matrices]);

  const requestDraw = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      try {
        drawNow();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }, [drawNow]);

  // Build: bake the geometry, load the texture, create the renderer.
  const { geometry, textureId, folders, revision } = props;
  useEffect(() => {
    let cancelled = false;
    const model = bakeGeometry(geometry);
    const texture = textureId === '' ? null : textureLocations(textureId, folders);
    const read =
      texture === null
        ? Promise.resolve(null)
        : latest.current.readProjectAsset(texture.namespace, texture.projectPath).catch(() => null);
    void revision;
    read
      .then(async (bytes) =>
        bytes === null
          ? null
          : createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' })).catch(() => null),
      )
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
          setStatus('Preview unavailable: WebGL is disabled.');
          return;
        }
        const framing = geoFraming(model, latest.current.scale);
        const extent = Math.max(2, Math.ceil(framing.distance));
        const renderer = createGeoRenderer(gl, model, image, { extent, cell: 1 });
        image?.close();
        dispose(liveRef.current);
        viewRef.current = { ...viewRef.current, distance: framing.distance };
        liveRef.current = { canvas, gl, renderer, model, framing };
        hostRef.current?.prepend(canvas);
        setStatus('ready');
        requestDraw();
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [geometry, textureId, folders, revision, requestDraw]);

  // Driving: animate while the throttle is not zero.
  const { throttle, maxSpeed } = props;
  useEffect(() => {
    if (throttle === 0) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const seconds = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      poseRef.current = advanceDrive(poseRef.current, seconds, throttle, maxSpeed);
      try {
        drawNow();
      } catch {
        // A failed frame is skipped.
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [throttle, maxSpeed, drawNow]);

  // Steering, the rig or the markers changed: redraw.
  const { steer, rig, markers, scale } = props;
  useEffect(() => {
    poseRef.current = { ...poseRef.current, steer };
    void rig;
    void markers;
    void scale;
    requestDraw();
  }, [steer, rig, markers, scale, requestDraw]);

  // Dispose on unmount; redraw on resize.
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
      frameRef.current = null;
      dispose(liveRef.current);
      liveRef.current = null;
    };
  }, [requestDraw]);

  /** Aims the turret at the mouse. */
  const aim = (event: PointerEvent<HTMLDivElement>) => {
    const live = liveRef.current;
    const rig = latest.current.rig;
    if (live === null || rig.turret === null) return;
    const m = matrices();
    if (m === null) return;
    const index = live.model.bones.findIndex((bone) => bone.name === rig.turret?.bone);
    if (index < 0) return;
    const pivot = vec3.transformMat4(vec3.create(), [0, 0, 0], m.rest[index] as mat4);
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const y = 1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2;
    const inverse = mat4.invert(
      mat4.create(),
      mat4.multiply(mat4.create(), m.projection, m.viewMatrix),
    );
    if (inverse === null) return;
    const near = vec4.transformMat4(vec4.create(), [x, y, -1, 1], inverse);
    const far = vec4.transformMat4(vec4.create(), [x, y, 1, 1], inverse);
    const a: [number, number, number] = [near[0] / near[3], near[1] / near[3], near[2] / near[3]];
    const b: [number, number, number] = [far[0] / far[3], far[1] / far[3], far[2] / far[3]];
    const yaw = turretYawFromRay(rig, [pivot[0], pivot[1], pivot[2]], a, [
      b[0] - a[0],
      b[1] - a[1],
      b[2] - a[2],
    ]);
    if (yaw === null) return;
    poseRef.current = { ...poseRef.current, turretYaw: yaw };
    latest.current.onAim?.(yaw);
    requestDraw();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = dragRef.current;
    if (last === null) {
      aim(event);
      return;
    }
    dragRef.current = { x: event.clientX, y: event.clientY };
    const view = viewRef.current;
    view.yaw += (event.clientX - last.x) / 100;
    view.pitch = Math.min(
      Math.PI / 2,
      Math.max(-Math.PI / 2, view.pitch + (event.clientY - last.y) / 100),
    );
    requestDraw();
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  useEffect(() => {
    const host = hostRef.current;
    if (host === null || status !== 'ready') return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const framing = liveRef.current?.framing;
      if (framing === undefined) return;
      const view = viewRef.current;
      view.distance = Math.min(
        framing.maxDistance,
        Math.max(framing.minDistance, view.distance * Math.exp(event.deltaY / 500)),
      );
      requestDraw();
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [status, requestDraw]);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded border border-border bg-bg">
        <div
          ref={hostRef}
          data-testid="vehicle-preview-canvas"
          role="img"
          aria-label={props.label}
          className="relative size-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {status === 'ready' &&
            props.markers.map((marker) => (
              <div
                key={marker.key}
                ref={(element) => {
                  if (element === null) markerRefs.current.delete(marker.key);
                  else markerRefs.current.set(marker.key, element);
                }}
                className={`pointer-events-none absolute grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-medium text-[10px] ${MARKER_CLASSES[marker.kind]}`}
                title={marker.label}
                data-testid={`vehicle-marker-${marker.key}`}
              >
                {marker.kind === 'seat' ? marker.label.replace(/\D/g, '') : ''}
              </div>
            ))}
        </div>
        {status === 'ready' && (
          <button
            type="button"
            className={`${iconButtonClass} absolute top-1 right-1`}
            aria-label="Reset view"
            title="Reset view"
            onClick={() => {
              viewRef.current = {
                ...DEFAULT_VIEW,
                distance: liveRef.current?.framing.distance ?? DEFAULT_VIEW.distance,
              };
              requestDraw();
            }}
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        )}
        {status === 'loading' && (
          <p className="absolute inset-0 grid place-items-center text-muted text-sm">
            Loading preview…
          </p>
        )}
      </div>
      {status !== 'ready' && status !== 'loading' && (
        <p role="alert" className="text-error text-sm">
          {status}
        </p>
      )}
    </div>
  );
}
