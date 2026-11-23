/**
 * The structures worker (ADR 0122 D2, D5; B640): a Vite module worker in its own chunk, loaded by
 * `client.ts` with `?worker`. With `terrain/worker.ts` it is the only module of the app that
 * imports `@msm/terrain` (`test/components/terrain/imports.test.ts` lists both), so the jigsaw
 * assembler never runs on the renderer's main thread.
 *
 * - **Steps in batches.** The assembler is a generator; the worker answers its steps every
 *   {@link BATCH_MS} or {@link BATCH_STEPS}, whichever comes first, and yields between batches so
 *   a `cancel` or a newer request is seen. A placed piece carries its blocks where they stand and
 *   the two jigsaw blocks that met.
 * - **Templates kept by key.** A template arrives with a key that changes when it does; the
 *   worker hands the assembler the same object for the same key, so the engine's per-template
 *   work (its jigsaws and boxes for the four turns) is done once.
 */

import * as terrain from '@msm/terrain';
import type { PieceTemplate as ReaderPieceTemplate } from '../vanilla-pieces';
import { jigsawState, pieceCells } from './cells';
import type {
  AssembledPiece,
  AssemblyAnswer,
  AssemblyRequest,
  AssemblyStep,
  JigsawStructureData,
  MetJigsaws,
  PoolData,
  ViewStep,
} from './client';

/** Whether two types are the same (each assignable to the other). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** `client.ts` and `vanilla-pieces.ts` mirror the engine's types; this fails when they drift. */
export const TYPES_MATCH_ENGINE: [
  Same<AssemblyStep, terrain.AssemblyStep>,
  Same<AssembledPiece, terrain.AssembledPiece>,
  Same<PoolData, terrain.PoolData>,
  Same<JigsawStructureData, terrain.JigsawStructureData>,
  Same<ReaderPieceTemplate, terrain.PieceTemplate>,
] = [true, true, true, true, true];

/** The engine functions the worker calls (tests pass the real engine). */
export type AssemblyEngine = Pick<
  typeof terrain,
  'assembleSteps' | 'pieceJigsaws' | 'pieceOrigin' | 'rotateVec'
>;

/** Answers are sent at least this often while an assembly runs. */
export const BATCH_MS = 16;
/** Or after this many steps. */
export const BATCH_STEPS = 64;

/** The number a seed text assembles with: the live views' `seedNumber` rule, as a 64-bit value. */
export function seedBigint(text: string): bigint {
  const trimmed = text.trim();
  if (/^-?\d+$/.test(trimmed)) {
    try {
      return BigInt.asIntN(64, BigInt(trimmed));
    } catch {
      // Falls through to the hash.
    }
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = Math.imul(hash ^ trimmed.charCodeAt(i), 0x01000193);
  }
  return BigInt(hash >>> 0);
}

const TURNS: Readonly<Record<terrain.PieceRotation, number>> = {
  none: 0,
  clockwise_90: 1,
  clockwise_180: 2,
  counterclockwise_90: 3,
};

/** What the worker's message handler calls. */
export interface AssemblyHost {
  receive(message: AssemblyRequest): void;
}

/**
 * The worker's logic, apart from the worker scope so tests can drive it.
 *
 * @param engine - `@msm/terrain` (tests pass it too: the real assembler).
 * @param post - Sends to the main thread.
 * @param schedule - Runs the next batch later (default `setTimeout(run, 0)`).
 * @param now - The clock (default `performance.now`).
 */
export function createAssemblyHost(
  engine: AssemblyEngine,
  post: (answer: AssemblyAnswer) => void,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0);
  },
  now: () => number = () => performance.now(),
): AssemblyHost {
  /** Templates by key, so the same template is the same object across requests. */
  let kept = new Map<string, terrain.PieceTemplate>();
  let current = 0;

  const start = (token: number, job: Extract<AssemblyRequest, { kind: 'assemble' }>['job']) => {
    current = token;
    const began = now();
    const nextKept = new Map<string, terrain.PieceTemplate>();
    const templates = new Map<string, terrain.PieceTemplate>();
    for (const [id, { key, template }] of Object.entries(job.templates)) {
      const known = kept.get(key) ?? (template as terrain.PieceTemplate);
      nextKept.set(key, known);
      templates.set(id, known);
    }
    kept = nextKept;
    const steps = engine.assembleSteps({
      structure: job.structure,
      pools: (id) => job.pools[id] ?? null,
      templates: (id) => templates.get(id) ?? null,
      seed: seedBigint(job.seed),
      origin: job.origin,
      pieceLimit: job.pieceLimit,
    });
    const placed: { piece: terrain.AssembledPiece; template: terrain.PieceTemplate | null }[] = [];
    let stoppedAtLimit = false;

    const viewStep = (step: terrain.AssemblyStep): ViewStep => {
      if (step.kind !== 'placed') return step;
      const { piece } = step;
      const template = piece.template === null ? null : (templates.get(piece.template) ?? null);
      placed[piece.index] = { piece, template };
      const turns = TURNS[piece.rotation] ?? 0;
      const cells =
        template === null
          ? { palette: [], blocks: [] }
          : pieceCells(template, engine.pieceOrigin(piece, template.size), turns, engine.rotateVec);
      let met: MetJigsaws | null = null;
      const parent = piece.parent === null ? undefined : placed[piece.parent];
      if (piece.joinedBy !== null && parent?.template && template !== null) {
        const a = engine.pieceJigsaws(parent.piece, parent.template)[piece.joinedBy.parentJigsaw];
        const b = engine.pieceJigsaws(piece, template)[piece.joinedBy.jigsaw];
        if (a !== undefined && b !== undefined) {
          met = {
            parent: a.pos,
            child: b.pos,
            parentState: jigsawState(a.block.orientation, TURNS[parent.piece.rotation] ?? 0),
            childState: jigsawState(b.block.orientation, turns),
          };
        }
      }
      return { kind: 'placed', piece, cells, met };
    };

    const run = (): void => {
      if (current !== token) return;
      const batch: ViewStep[] = [];
      const batchStart = now();
      try {
        for (;;) {
          const next = steps.next();
          if (next.done === true) {
            if (batch.length > 0) post({ token, kind: 'steps', steps: batch });
            post({ token, kind: 'done', ms: now() - began, stoppedAtLimit });
            if (current === token) current = 0;
            return;
          }
          const step = next.value;
          if (step.kind === 'stopped') stoppedAtLimit = step.reason === 'piece_limit';
          batch.push(viewStep(step));
          if (batch.length >= BATCH_STEPS || now() - batchStart >= BATCH_MS) break;
        }
      } catch (error) {
        post({
          token,
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
        if (current === token) current = 0;
        return;
      }
      post({ token, kind: 'steps', steps: batch });
      schedule(run);
    };
    run();
  };

  return {
    receive(message) {
      if (message.kind === 'cancel') {
        if (current === message.token) current = 0;
        return;
      }
      start(message.token, message.job);
    },
  };
}

interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<AssemblyRequest>) => void) | null;
}

// Wired only inside a worker; tests import the module and call `createAssemblyHost`.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
  const scope = globalThis as unknown as WorkerScope;
  const host = createAssemblyHost(terrain, (answer) => scope.postMessage(answer));
  scope.onmessage = (event) => host.receive(event.data);
}
