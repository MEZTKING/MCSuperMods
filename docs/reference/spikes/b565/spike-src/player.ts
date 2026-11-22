/** B565 throwaway: a minimal clip player over a Try it area, stepping by simulation ticks. */
import { flatGround, groundState, quickWorld, type PlayerAction } from '@msm/sim';
import type { CameraPose } from '../tryit/render/camera';
import type { TryItArea } from '../tryit/session-source';
import { driverCamera } from '../tryit/vehicles/camera';
import type { CameraKey, SpikeClip, V3 } from './clips';

export const NAMESPACE = 'showcase';
export const rel = (id: string): string => (id.startsWith('./') ? `${NAMESPACE}:${id.slice(2)}` : id);

const HIT = { x: 0.5, y: 1, z: 0.5 };
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => t * t * (3 - 2 * t);
function lerpYaw(a: number, b: number, t: number): number {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return a + d * t;
}

export function cameraAt(keys: readonly CameraKey[], tick: number): CameraPose {
  const first = keys[0] as CameraKey;
  if (tick <= first.tick) return first;
  for (let i = 1; i < keys.length; i += 1) {
    const b = keys[i] as CameraKey;
    const a = keys[i - 1] as CameraKey;
    if (tick <= b.tick) {
      const t = ease((tick - a.tick) / (b.tick - a.tick));
      return {
        eye: { x: lerp(a.eye.x, b.eye.x, t), y: lerp(a.eye.y, b.eye.y, t), z: lerp(a.eye.z, b.eye.z, t) },
        yaw: lerpYaw(a.yaw, b.yaw, t),
        pitch: lerp(a.pitch, b.pitch, t),
      };
    }
  }
  return keys[keys.length - 1] as CameraKey;
}

export interface StepRecord {
  tick: number;
  step: string;
  ok: boolean;
  lines: string[];
}

export class SpikePlayer {
  tick = 0;
  loops = 0;
  private carry = 0;
  private look = { yaw: 180, pitch: 0 };
  private drive = { forward: 0, strafe: 0 };
  readonly records: StepRecord[] = [];
  problems: string[] = [];

  readonly area: TryItArea;
  readonly clip: SpikeClip;

  constructor(area: TryItArea, clip: SpikeClip) {
    this.area = area;
    this.clip = clip;
  }

  start(): void {
    const { area, clip } = this;
    area.clock.pause();
    this.tick = 0;
    this.carry = 0;
    this.drive = { forward: 0, strafe: 0 };
    const ground =
      clip.ground.kind === 'flat'
        ? flatGround()
        : clip.ground.kind === 'quick'
          ? quickWorld(clip.ground.options)
          : undefined;
    area.loadGround(clip.ground.kind, ground, `clip ${clip.id}`);
    area.setRunEveryTime(true);
    for (const entry of clip.setup) this.set(entry.pos, entry.state);
    area.source.player.teleport(clip.player);
    this.sendMove();
  }

  private set(pos: V3, text: string): boolean {
    const parsed = groundState(rel(text));
    const state = this.area.source.catalogue.normalise(parsed);
    if (state === null) {
      this.problems.push(`set: unknown ${text}`);
      return false;
    }
    this.area.source.world.set(pos, state);
    return true;
  }

  private sendMove(): void {
    this.area.act({
      type: 'move',
      forward: this.drive.forward,
      strafe: this.drive.strafe,
      jump: false,
      sneak: false,
      toggleFly: false,
      yaw: this.look.yaw,
      pitch: this.look.pitch,
    });
  }

  /** Runs one simulation tick: the steps due, then the area's tick. */
  stepTick(): void {
    this.tick += 1;
    for (const entry of this.clip.steps) if (entry.tick === this.tick) this.run(entry.step);
    this.sendMove();
    this.area.clock.step();
  }

  /** For a frame: lets `elapsedMs` go by, running whole ticks (at most `max`, never skipping). */
  advance(elapsedMs: number, max = 3): void {
    this.carry += elapsedMs;
    let ran = 0;
    while (this.carry >= 50 && ran < max) {
      this.carry -= 50;
      ran += 1;
      if (this.tick >= this.clip.length) {
        this.loops += 1;
        this.start();
      }
      else this.stepTick();
    }
    if (ran === max) this.carry = Math.min(this.carry, 50);
  }

  get alpha(): number {
    return Math.min(1, this.carry / 50);
  }

  camera(): CameraPose {
    if (this.clip.camera === 'driver') {
      const vehicles = this.area.source.vehicles;
      const pose = driverCamera(vehicles, this.alpha, this.look);
      if (pose !== null) return pose;
      return { eye: this.area.source.player.eyePosition(this.alpha), yaw: this.look.yaw, pitch: this.look.pitch };
    }
    return cameraAt(this.clip.camera, this.tick + this.alpha);
  }

  private run(step: SpikeClip['steps'][number]['step']): void {
    const before = this.area.whatHappened.length;
    let ok = true;
    const act = (action: PlayerAction) => this.area.act(action);
    switch (step.type) {
      case 'place':
        act({ type: 'place', pos: step.pos, face: step.face, hit: HIT, block: rel(step.block) });
        break;
      case 'use':
        act({
          type: 'use',
          pos: step.pos,
          face: step.face,
          hit: HIT,
          ...(step.item === undefined ? {} : { item: rel(step.item) }),
        });
        break;
      case 'break':
        act({ type: 'break', pos: step.pos });
        break;
      case 'tool':
        act({ type: 'tool', tool: step.tool, pos: step.pos });
        break;
      case 'set':
        ok = this.set(step.pos, step.state);
        break;
      case 'look':
        this.look = { yaw: step.yaw, pitch: step.pitch };
        this.sendMove();
        break;
      case 'teleport':
        this.area.source.player.teleport(step.to);
        break;
      case 'useVehicle': {
        const snapshot = this.area.source.vehicles.snapshots()[step.index];
        if (snapshot === undefined) ok = false;
        else act({ type: 'useVehicle', vehicle: snapshot.id });
        break;
      }
      case 'drive':
        this.drive = { forward: step.forward, strafe: step.strafe };
        break;
    }
    const lines = this.area.whatHappened.slice(before).map((entry) => `[${entry.kind}] ${entry.text}`);
    this.records.push({ tick: this.tick, step: JSON.stringify(step), ok, lines });
  }
}
