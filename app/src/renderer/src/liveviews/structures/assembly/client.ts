/**
 * The assembly client (ADR 0122 D5; B640): the main thread's side of the structures worker
 * (`worker.ts`, which with `terrain/worker.ts` is the only module of the app that imports
 * `@msm/terrain`; `test/components/terrain/imports.test.ts` lists both). The view gathers a
 * pool's pieces (the project's laid over the ones read from the user's jar) and asks the worker
 * to assemble them; the worker answers the steps in batches as the assembler makes them, so the
 * first pieces draw while the rest are still being placed.
 *
 * - **Lanes.** One lane per view; a newer request in a lane cancels the older one, and the
 *   answers of a cancelled token are dropped.
 * - The engine's types are mirrored here (nothing outside the worker may import the engine);
 *   `worker.ts` fails to compile when the two drift apart.
 *
 * @packageDocumentation
 */

import type { PieceTemplate } from '../vanilla-pieces';

/** Mirrors `PieceRotation` in `@msm/terrain`: quarter turns clockwise seen from above. */
export type PieceRotation = 'none' | 'clockwise_90' | 'clockwise_180' | 'counterclockwise_90';

/** Mirrors `PieceBox` in `@msm/terrain`: both corners inclusive. */
export interface PieceBox {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/** Mirrors `Projection` in `@msm/terrain`. */
export type Projection = 'rigid' | 'terrain_matching';

/** Mirrors `PoolElementType` in `@msm/terrain`. */
export type PoolElementType =
  | 'minecraft:single_pool_element'
  | 'minecraft:legacy_single_pool_element'
  | 'minecraft:list_pool_element'
  | 'minecraft:feature_pool_element'
  | 'minecraft:empty_pool_element';

/** Mirrors `PoolElementData` in `@msm/terrain`. */
export interface PoolElementData {
  readonly weight: number;
  readonly type: PoolElementType | string;
  readonly location?: string;
  readonly processors?: unknown;
  readonly projection: Projection;
  readonly cornerConstraint?: unknown;
}

/** Mirrors `PoolData` in `@msm/terrain`. */
export interface PoolData {
  readonly id: string;
  readonly fallback: string;
  readonly elements: readonly PoolElementData[];
}

/** Mirrors `JigsawStructureData` in `@msm/terrain`. */
export interface JigsawStructureData {
  readonly startPool: string;
  readonly size: number;
  readonly startJigsawName?: string;
  readonly startHeight: unknown;
  readonly maxDistanceFromCenter:
    | number
    | { readonly horizontal: number; readonly vertical?: number };
  readonly useExpansionHack: boolean;
  readonly terrainAdaptation: 'none' | 'beard_thin' | 'beard_box' | 'bury' | 'encapsulate';
}

/** Mirrors `PieceMember` in `@msm/terrain`: one template of a list element's piece (B712). */
export interface PieceMember {
  readonly template: string;
  readonly processors: string | null;
  readonly source: 'project' | 'vanilla' | 'box';
  /** The member's own box where it stands, at the piece's origin and turn. */
  readonly box: PieceBox;
}

/** Mirrors `AssembledPiece` in `@msm/terrain`. */
export interface AssembledPiece {
  readonly index: number;
  readonly parent: number | null;
  readonly depth: number;
  readonly template: string | null;
  readonly pool: string;
  readonly box: PieceBox;
  readonly rotation: PieceRotation;
  readonly joinedBy: { readonly parentJigsaw: number; readonly jigsaw: number } | null;
  readonly processors: string | null;
  readonly projection: Projection;
  readonly source: 'project' | 'vanilla' | 'box';
  /** A list element's templates in the element's order (the first names the piece); else absent. */
  readonly members?: readonly PieceMember[];
}

/** Mirrors `RefusalReason` in `@msm/terrain`. */
export type RefusalReason =
  | 'no_matching_jigsaw'
  | 'overlaps_a_piece'
  | 'too_far_from_start'
  | 'too_high_or_low'
  | 'past_depth_limit'
  | 'template_missing'
  | 'pool_missing'
  | 'pool_empty'
  | 'unsupported_element';

/** Mirrors `AssemblyStep` in `@msm/terrain`. */
export type AssemblyStep =
  | {
      readonly kind: 'tried';
      readonly pool: string;
      readonly template: string | null;
      readonly parent: number;
      readonly parentJigsaw: number;
    }
  | { readonly kind: 'placed'; readonly piece: AssembledPiece }
  | {
      readonly kind: 'refused';
      readonly pool: string;
      readonly template: string | null;
      readonly parent: number;
      readonly parentJigsaw: number;
      readonly reason: RefusalReason;
    }
  | { readonly kind: 'stopped'; readonly reason: 'piece_limit' | 'done'; readonly pieces: number };

/** A block position in the assembly's own coordinates. */
export type Cell = readonly [number, number, number];

/**
 * A placed piece's blocks where they stand, as the worker works them out: a palette of block
 * states (turned with the piece; a jigsaw block already its `final_state`) and the blocks as
 * runs of four numbers `x, y, z, palette index`. A list element's piece holds every member's
 * blocks, member after member in the element's order (a later member's block over an earlier one
 * where they share a cell).
 */
export interface PieceCells {
  readonly palette: readonly string[];
  readonly blocks: readonly number[];
}

/** The two jigsaw blocks that met when a piece was placed, with the states they are drawn as. */
export interface MetJigsaws {
  readonly parent: Cell;
  readonly child: Cell;
  readonly parentState: string;
  readonly childState: string;
}

/** A step as the view receives it: a placed piece carries its blocks and the jigsaws that met. */
export type ViewStep =
  | Exclude<AssemblyStep, { kind: 'placed' }>
  | {
      readonly kind: 'placed';
      readonly piece: AssembledPiece;
      readonly cells: PieceCells;
      readonly met: MetJigsaws | null;
    };

/** What the view asks the worker to assemble. */
export interface AssemblyJob {
  readonly structure: JigsawStructureData;
  /** Pools by namespaced id: the project's laid over vanilla's. */
  readonly pools: Readonly<Record<string, PoolData>>;
  /**
   * Templates by namespaced id, each with a key that changes when the template does (the worker
   * keeps the parsed template under it, so the engine's per-template work is reused).
   */
  readonly templates: Readonly<
    Record<string, { readonly key: string; readonly template: PieceTemplate }>
  >;
  /** The seed as typed (`seedNumber` in the live views client turns it into a number). */
  readonly seed: string;
  readonly pieceLimit: number;
  readonly origin: readonly [number, number, number];
}

/** A message to the worker. */
export type AssemblyRequest =
  | { readonly token: number; readonly kind: 'assemble'; readonly job: AssemblyJob }
  | { readonly token: number; readonly kind: 'cancel' };

/** A message from the worker. */
export type AssemblyAnswer =
  | { readonly token: number; readonly kind: 'steps'; readonly steps: readonly ViewStep[] }
  | {
      readonly token: number;
      readonly kind: 'done';
      readonly ms: number;
      readonly stoppedAtLimit: boolean;
    }
  | { readonly token: number; readonly kind: 'error'; readonly message: string };

/** The worker as the client sees it (a fake in tests). */
export interface AssemblyWorkerLike {
  postMessage(message: AssemblyRequest): void;
  onmessage: ((event: { readonly data: AssemblyAnswer }) => void) | null;
  terminate(): void;
}

/** How an assembly ended. */
export interface AssemblyDone {
  /** Time in the worker, in milliseconds. */
  readonly ms: number;
  readonly stoppedAtLimit: boolean;
}

/** The Vite module worker of `worker.ts` (its own chunk). */
export async function createAssemblyWorker(): Promise<AssemblyWorkerLike> {
  const module = await import('./worker?worker');
  return new module.default({ name: 'msm-structures' }) as unknown as AssemblyWorkerLike;
}

/** Options of {@link AssemblyClient}. */
export interface AssemblyClientOptions {
  /** Makes the worker on first use; default {@link createAssemblyWorker}. */
  createWorker?: () => AssemblyWorkerLike | Promise<AssemblyWorkerLike>;
}

interface Pending {
  readonly lane: string;
  readonly onSteps: (steps: readonly ViewStep[]) => void;
  readonly resolve: (done: AssemblyDone | null) => void;
  readonly reject: (error: Error) => void;
}

/** The main thread's side of the structures worker; see the module comment. */
export class AssemblyClient {
  readonly #createWorker: () => AssemblyWorkerLike | Promise<AssemblyWorkerLike>;
  #worker: Promise<AssemblyWorkerLike> | null = null;
  #nextToken = 1;
  readonly #pending = new Map<number, Pending>();
  readonly #lanes = new Map<string, number>();

  constructor(options: AssemblyClientOptions = {}) {
    this.#createWorker = options.createWorker ?? createAssemblyWorker;
  }

  /**
   * Assembles in a lane, cancelling the lane's older request. `onSteps` gets the steps in
   * batches as they come; the promise answers how it ended, or `null` when cancelled.
   */
  run(
    lane: string,
    job: AssemblyJob,
    onSteps: (steps: readonly ViewStep[]) => void,
  ): Promise<AssemblyDone | null> {
    this.cancel(lane);
    const token = this.#nextToken++;
    this.#lanes.set(lane, token);
    const answer = new Promise<AssemblyDone | null>((resolve, reject) => {
      this.#pending.set(token, { lane, onSteps, resolve, reject });
    });
    void this.#post((worker) => worker.postMessage({ token, kind: 'assemble', job }));
    return answer;
  }

  /** Cancels the lane's request, if any (its promise answers `null`). */
  cancel(lane: string): void {
    const token = this.#lanes.get(lane);
    if (token === undefined) return;
    this.#lanes.delete(lane);
    const pending = this.#pending.get(token);
    if (pending === undefined) return;
    this.#pending.delete(token);
    pending.resolve(null);
    void this.#post((worker) => worker.postMessage({ token, kind: 'cancel' }));
  }

  async #post(send: (worker: AssemblyWorkerLike) => void): Promise<void> {
    if (this.#worker === null) {
      this.#worker = Promise.resolve(this.#createWorker()).then((worker) => {
        worker.onmessage = (event) => this.#onMessage(event.data);
        return worker;
      });
    }
    try {
      send(await this.#worker);
    } catch (error) {
      this.#worker = null;
      const failure = error instanceof Error ? error : new Error(String(error));
      for (const [token, pending] of [...this.#pending]) {
        this.#pending.delete(token);
        pending.reject(failure);
      }
      this.#lanes.clear();
    }
  }

  #onMessage(answer: AssemblyAnswer): void {
    const pending = this.#pending.get(answer.token);
    if (pending === undefined) return;
    if (answer.kind === 'steps') {
      pending.onSteps(answer.steps);
      return;
    }
    this.#pending.delete(answer.token);
    if (this.#lanes.get(pending.lane) === answer.token) this.#lanes.delete(pending.lane);
    if (answer.kind === 'error') pending.reject(new Error(answer.message));
    else pending.resolve({ ms: answer.ms, stoppedAtLimit: answer.stoppedAtLimit });
  }
}

let shared: AssemblyClient | null = null;

/** The one client the assembly views share (one worker). */
export function sharedAssemblyClient(): AssemblyClient {
  shared ??= new AssemblyClient();
  return shared;
}
