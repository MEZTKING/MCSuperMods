/**
 * The search host (ADR 0124 D3; B660): the engine side of the search, the only module of the app
 * that imports `@msm/search` at run time. It runs inside the search worker (`worker.ts`) and, when
 * no worker starts, on the main thread through a dynamic import by `client.ts` (so the engine is
 * never in the first-paint bundle either way). Tests drive it directly.
 *
 * - **Layers** (`static`, `guide`, `vanilla`, `project`) are replaced by `static` and `layer`
 *   messages and patched by `patch` messages; after a batch of them the engine is warmed
 *   (`warm()`: the dictionary and typo index built now), so a key press never builds them.
 * - **The answer reader** (B659) gets the plugins' search data, each flow's sort and defaults,
 *   the things of the project and vanilla layers (`setThings` on every change) and the wizard's
 *   own `validateParameter` as its check of an answer.
 * - **Newest wins:** messages are queued and taken in order on the next turn; a query with a newer
 *   query behind it in the queue, or cancelled, is dropped unanswered. A query never throws.
 * - Across the boundary a hit is slim (`toSlim`); the client keeps the entries by id.
 *
 * @packageDocumentation
 */

import type { Json, StarterParameter } from '@msm/plugin-api';
import {
  createAnswerReader,
  createSearchIndex,
  type SearchAnswer,
  type SearchThing,
  toSlim,
} from '@msm/search';
import { type RawValue, validateParameter } from '../components/wizard/wizard-model';
import type { SearchInbound, SearchOutbound, SlimAnswer } from './client';
import type { FlowSpec } from './sources/flows';

/** What the worker's message handler (or the client's fallback) calls. */
export interface SearchHost {
  receive(message: SearchInbound): void;
  /** Messages waiting (tests). */
  readonly queued: number;
}

/** Options of {@link createSearchHost}. */
export interface SearchHostOptions {
  /** Runs the queue later (default: a zero timeout, so newer messages are seen first). */
  readonly schedule?: (run: () => void) => void;
  /** The clock for timings (default `performance.now`). */
  readonly now?: () => number;
}

/** A JSON answer in the wizard's editing form (`make-flow.ts` does the same for the Creator). */
function rawOf(parameter: StarterParameter, value: Json): RawValue | undefined {
  switch (parameter.type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
    case 'set':
      return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
        ? [...(value as string[])]
        : undefined;
    case 'image':
    case 'audio':
      return value === null ? '' : typeof value === 'string' ? value : undefined;
    default:
      return typeof value === 'string' ? value : undefined;
  }
}

/** The wizard's check of one answer of a flow; a flow or question it does not know passes. */
export function validateAnswer(
  flows: Readonly<Record<string, FlowSpec>>,
  starter: string,
  question: string,
  value: Json,
): boolean {
  const parameter = flows[starter]?.parameters.find((entry) => entry.id === question);
  if (parameter === undefined) return true;
  const raw = rawOf(parameter, value);
  return raw !== undefined && validateParameter(parameter, raw) === null;
}

/** The slim form of an answer: hits by entry id. */
export function slimAnswer(answer: SearchAnswer): SlimAnswer {
  return {
    understood: answer.understood,
    best: answer.best.map(toSlim),
    sections: answer.sections.map((section) => ({
      id: section.id,
      hits: section.hits.map(toSlim),
      more: section.more,
    })),
    confident: answer.confident,
  };
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Makes a host that answers through `post`. */
export function createSearchHost(
  post: (message: SearchOutbound) => void,
  options: SearchHostOptions = {},
): SearchHost {
  const schedule = options.schedule ?? ((run: () => void) => setTimeout(run, 0));
  const now = options.now ?? (() => performance.now());
  const engine = createSearchIndex();
  let flows: Readonly<Record<string, FlowSpec>> = {};
  const reader = createAnswerReader({
    validate: (starter, question, value) => validateAnswer(flows, starter, question, value),
  });
  engine.setAnswerReader(reader);

  const things = new Map<string, readonly SearchThing[]>();
  const protect = new Map<string, readonly string[]>();
  let vocabularyWords: readonly string[] = [];
  const queue: SearchInbound[] = [];
  const cancelled = new Set<number>();
  let scheduled = false;

  const refreshThings = (): void => {
    reader.setThings([...(things.get('project') ?? []), ...(things.get('vanilla') ?? [])]);
  };
  const refreshProtect = (): void => {
    engine.setProtected([...vocabularyWords, ...[...protect.values()].flat()]);
  };

  const build = (layer: string, run: () => number): void => {
    const started = now();
    const count = run();
    engine.warm();
    post({ type: 'built', layer, entries: count, ms: now() - started });
  };

  const take = (message: SearchInbound): void => {
    switch (message.type) {
      case 'static': {
        const { spec } = message;
        build('static', () => {
          flows = spec.flows;
          vocabularyWords = spec.protect;
          engine.setVocabulary(spec.vocabulary);
          refreshProtect();
          reader.setPlugins(spec.plugins);
          reader.setFlows(
            Object.fromEntries(
              Object.entries(spec.flows).map(([id, flow]) => [
                id,
                {
                  ...(flow.sort !== undefined ? { sort: flow.sort } : {}),
                  defaults: flow.defaults,
                },
              ]),
            ),
          );
          engine.setLayer('static', spec.entries);
          return spec.entries.length;
        });
        return;
      }
      case 'layer':
        build(message.layer, () => {
          if (message.things !== undefined) {
            things.set(message.layer, message.things);
            refreshThings();
          }
          if (message.protect !== undefined) {
            protect.set(message.layer, message.protect);
            refreshProtect();
          }
          engine.setLayer(message.layer, message.entries);
          return message.entries.length;
        });
        return;
      case 'patch':
        build(message.layer, () => {
          if (message.things !== undefined) {
            things.set(message.layer, message.things);
            refreshThings();
          }
          engine.patchLayer(message.layer, message.upserts, message.removes);
          return message.upserts.length + message.removes.length;
        });
        return;
      case 'context':
        engine.setContext(message.context);
        return;
      case 'cancel':
        cancelled.add(message.token);
        return;
      case 'query': {
        if (cancelled.delete(message.token)) return;
        const started = now();
        const answer = engine.query(message.request);
        post({
          type: 'answer',
          token: message.token,
          answer: slimAnswer(answer),
          ms: now() - started,
        });
        return;
      }
      default:
        return;
    }
  };

  const drain = (): void => {
    scheduled = false;
    while (queue.length > 0) {
      const message = queue.shift() as SearchInbound;
      // Newest wins: a query with another query behind it is dropped unanswered.
      if (message.type === 'query' && queue.some((later) => later.type === 'query')) continue;
      try {
        take(message);
      } catch (error) {
        post({
          type: 'failed',
          ...(message.type === 'query' ? { token: message.token } : {}),
          message: messageOf(error),
        });
      }
    }
  };

  return {
    receive(message) {
      if (typeof message !== 'object' || message === null) return;
      queue.push(message);
      if (!scheduled) {
        scheduled = true;
        schedule(drain);
      }
    },
    get queued() {
      return queue.length;
    },
  };
}
