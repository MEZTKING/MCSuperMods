/**
 * The Particle Studio's Preview (ADR 0081 D1): a 2D canvas (side view, no WebGL) that plays
 * the particle with `particle-sim.ts`, the twin of the runtime's `ParticleLook`. Frames come
 * from the project's pictures and, when the game's client jar is known, vanilla's (through the
 * host's `modelPreview` readers); a missing picture draws as a square of the tint. "Burst"
 * sends a ring of particles at once, "Stream" one every other tick; the background is dark or
 * light, and on the dark one a particle that does not glow is drawn dimmer. A floor line
 * stops particles that "Stop on blocks".
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { decodePicture } from '../../components/texture-editor/png-canvas';
import { buttonClass } from '../../components/ui/Button';
import { useBlocksItemsStudioHost } from './host';
import { isVanillaSprite, particleFrames, spriteAsset } from './particle-model';
import {
  frame,
  lifetime,
  type ParticleSpec,
  type ParticleState,
  resolveSpec,
  rgba,
  roll,
  size,
  step,
} from './particle-sim';

/** Canvas size in pixels and how many pixels a block takes. */
const WIDTH = 280;
const HEIGHT = 200;
const PIXELS_PER_BLOCK = 80;
/** The floor line, in pixels from the bottom. */
const FLOOR = 24;
/** Where particles start, in blocks above the floor. */
const EMITTER_Y = 0.75;
const TICK_MS = 50;
/** Particles in one burst, and the ticks between bursts after the last one dies. */
const BURST_COUNT = 16;
const BURST_PAUSE = 10;

type Mode = 'burst' | 'stream';
type Background = 'dark' | 'light';

interface Live {
  state: ParticleState;
  age: number;
  life: number;
  randomFrame: number;
}

/** Loads each frame as a canvas (or `null` when its picture cannot be read). */
function useFramePictures(
  sprites: readonly string[],
  target: Pick<TargetFacts, 'particles' | 'folders'> | undefined,
): (HTMLCanvasElement | null)[] {
  const host = useBlocksItemsStudioHost();
  const readers = host?.modelPreview;
  const revision = host?.revision ?? 0;
  const key = sprites.join('\n');
  const [pictures, setPictures] = useState<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => {
    void revision;
    let live = true;
    const load = async (sprite: string): Promise<HTMLCanvasElement | null> => {
      const asset = spriteAsset(target, sprite);
      if (asset === undefined || readers === undefined) return null;
      const bytes = isVanillaSprite(sprite)
        ? await (readers.vanilla?.readAsset(asset.assetPath) ?? Promise.resolve(null))
        : await readers.readProjectAsset(asset.namespace, asset.path);
      if (bytes === null) return null;
      const image = await decodePicture(bytes, 256);
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas
        .getContext('2d')
        ?.putImageData(
          new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
          0,
          0,
        );
      return canvas;
    };
    Promise.all(key.split('\n').map((sprite) => load(sprite).catch(() => null))).then(
      (loaded) => {
        if (live) setPictures(loaded);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [key, readers, target, revision]);
  return pictures;
}

/** A starting velocity for the mode, in blocks per tick. */
function startVelocity(mode: Mode, index: number): [number, number, number] {
  if (mode === 'burst') {
    const angle = (index / BURST_COUNT) * Math.PI * 2 + Math.random() * 0.3;
    const speed = 0.06 + Math.random() * 0.04;
    return [Math.cos(angle) * speed, Math.sin(angle) * speed, 0];
  }
  return [(Math.random() - 0.5) * 0.04, 0.02 + Math.random() * 0.02, 0];
}

function spawn(spec: ParticleSpec, mode: Mode, index: number, frames: number): Live {
  const [xd, yd, zd] = startVelocity(mode, index);
  return {
    state: { x: 0, y: EMITTER_Y, z: 0, xd, yd, zd },
    age: 0,
    life: lifetime(spec.lifetimeMin, spec.lifetimeMax, Math.random()),
    randomFrame: Math.floor(Math.random() * Math.max(1, frames)),
  };
}

function draw(
  context: CanvasRenderingContext2D,
  scratch: CanvasRenderingContext2D,
  spec: ParticleSpec,
  particles: readonly Live[],
  pictures: readonly (HTMLCanvasElement | null)[],
  frames: number,
  background: Background,
  partial: number,
): void {
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;
  context.fillStyle = background === 'dark' ? '#16161c' : '#e8e8ee';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = background === 'dark' ? '#55556a' : '#9a9aaa';
  context.beginPath();
  context.moveTo(0, HEIGHT - FLOOR + 0.5);
  context.lineTo(WIDTH, HEIGHT - FLOOR + 0.5);
  context.stroke();
  const dim = background === 'dark' && !spec.emissive ? 0.45 : 1;
  for (const particle of particles) {
    const [r, g, b, a] = rgba(spec, particle.age, particle.life);
    const half = size(spec, particle.age, particle.life, partial) * PIXELS_PER_BLOCK;
    const edge = Math.max(1, Math.round(half * 2));
    const index = frame(spec, particle.age, particle.life, frames, particle.randomFrame);
    const picture = pictures[index] ?? null;
    const colour = `rgb(${Math.round(r * 255 * dim)}, ${Math.round(g * 255 * dim)}, ${Math.round(b * 255 * dim)})`;
    scratch.canvas.width = edge;
    scratch.canvas.height = edge;
    scratch.imageSmoothingEnabled = false;
    scratch.globalCompositeOperation = 'source-over';
    if (picture === null) {
      scratch.fillStyle = colour;
      scratch.fillRect(0, 0, edge, edge);
    } else {
      scratch.drawImage(picture, 0, 0, edge, edge);
      scratch.globalCompositeOperation = 'multiply';
      scratch.fillStyle = colour;
      scratch.fillRect(0, 0, edge, edge);
      scratch.globalCompositeOperation = 'destination-in';
      scratch.drawImage(picture, 0, 0, edge, edge);
    }
    const x = WIDTH / 2 + particle.state.x * PIXELS_PER_BLOCK;
    const y = HEIGHT - FLOOR - particle.state.y * PIXELS_PER_BLOCK;
    context.save();
    context.globalAlpha = spec.translucent ? a : a < 0.1 ? 0 : 1;
    context.translate(x, y);
    context.rotate(roll(spec, particle.age));
    context.imageSmoothingEnabled = false;
    context.drawImage(scratch.canvas, -edge / 2, -edge / 2);
    context.restore();
  }
}

/** Props of {@link ParticlePreview}. */
export interface ParticlePreviewProps {
  data: Json;
  target: Pick<TargetFacts, 'particles' | 'folders'> | undefined;
}

export function ParticlePreview({ data, target }: ParticlePreviewProps) {
  const [mode, setMode] = useState<Mode>('burst');
  const [background, setBackground] = useState<Background>('dark');
  const [paused, setPaused] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spec = useMemo(() => resolveSpec(data), [data]);
  const sprites = particleFrames(data);
  const pictures = useFramePictures(sprites, target);
  const frames = Math.max(1, sprites.length);
  const live = useRef<{ particles: Live[]; ticks: number; pause: number }>({
    particles: [],
    ticks: 0,
    pause: 0,
  });

  // A new mode starts afresh.
  useEffect(() => {
    void mode;
    live.current = { particles: [], ticks: 0, pause: 0 };
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    const scratch = document.createElement('canvas').getContext('2d');
    if (context === null || scratch === null || typeof requestAnimationFrame !== 'function') {
      return;
    }
    let handle = 0;
    let last = performance.now();
    let carry = 0;
    const tick = () => {
      const world = live.current;
      world.ticks += 1;
      if (mode === 'stream') {
        if (world.ticks % 2 === 0) world.particles.push(spawn(spec, mode, 0, frames));
      } else if (world.particles.length === 0) {
        world.pause += 1;
        if (world.pause >= BURST_PAUSE || world.ticks === 1) {
          world.pause = 0;
          for (let index = 0; index < BURST_COUNT; index += 1) {
            world.particles.push(spawn(spec, mode, index, frames));
          }
        }
      }
      world.particles = world.particles.filter((particle) => {
        let next = step(particle.state, spec);
        if (spec.collision && next.y < 0) next = { ...next, y: 0, yd: 0 };
        particle.state = next;
        particle.age += 1;
        return particle.age <= particle.life;
      });
    };
    const frameLoop = (now: number) => {
      if (!paused) {
        carry += now - last;
        // At most a second's ticks after the window was hidden.
        carry = Math.min(carry, 1000);
        while (carry >= TICK_MS) {
          tick();
          carry -= TICK_MS;
        }
      }
      last = now;
      draw(
        context,
        scratch,
        spec,
        live.current.particles,
        pictures,
        frames,
        background,
        paused ? 0 : carry / TICK_MS,
      );
      handle = requestAnimationFrame(frameLoop);
    };
    handle = requestAnimationFrame(frameLoop);
    return () => cancelAnimationFrame(handle);
  }, [spec, pictures, frames, mode, background, paused]);

  const missing = target !== undefined && pictures.length > 0 && pictures.every((p) => p === null);
  return (
    <div className="flex flex-col gap-2" data-testid="particle-preview">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={buttonClass}
          aria-pressed={mode === 'burst'}
          data-testid="particle-preview-burst"
          onClick={() => setMode('burst')}
        >
          Burst
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-pressed={mode === 'stream'}
          data-testid="particle-preview-stream"
          onClick={() => setMode('stream')}
        >
          Stream
        </button>
        <button
          type="button"
          className={buttonClass}
          data-testid="particle-preview-background"
          onClick={() => setBackground(background === 'dark' ? 'light' : 'dark')}
        >
          {background === 'dark' ? 'Light background' : 'Dark background'}
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-pressed={paused}
          data-testid="particle-preview-pause"
          onClick={() => setPaused(!paused)}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={`Particle preview: ${mode === 'burst' ? 'burst' : 'stream'} on a ${background} background`}
        data-testid="particle-preview-canvas"
        data-mode={mode}
        data-background={background}
        className="rounded border border-border"
        style={{ imageRendering: 'pixelated' }}
      />
      {missing && (
        <p className="text-muted text-xs" data-testid="particle-preview-placeholder">
          No pictures could be read, so the preview draws squares of the tint. Vanilla pictures show
          once the game's files are found (Settings, Game locations).
        </p>
      )}
    </div>
  );
}
