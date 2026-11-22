/**
 * Fakes for the live views worker tests (B608): evaluators that answer from what they are given
 * (B604 and B605 fill the real ones in parallel), and a worker that runs the real host in the
 * same thread. Only MSM's own made-up files; no Mojang file.
 */

import type { TargetFacts } from '@msm/plugin-api';
import type { LootRoll, OddsStep, PredicateResult, ResolvedTag } from '@msm/sim';
import { defaultTargetId, targetFacts } from '@msm/targets';
import type {
  LiveViewAnswer,
  LiveViewRequest,
  LiveViewWorkerLike,
} from '../../../../src/renderer/src/liveviews/client';
import {
  createLiveViewHost,
  type LiveViewEngine,
} from '../../../../src/renderer/src/liveviews/worker';

/** The default target's facts, as a view sends them. */
export function facts(): TargetFacts {
  return targetFacts(defaultTargetId) as TargetFacts;
}

/** What the fake evaluators were asked. */
export interface FakeCalls {
  rolls: number;
  odds: number;
  tags: string[];
}

/** Evaluators that answer from their inputs, deterministic in the seeded random source. */
export function fakeEngine(calls: FakeCalls = { rolls: 0, odds: 0, tags: [] }): LiveViewEngine {
  return {
    rollLoot(table, _situation, ctx): LootRoll {
      calls.rolls += 1;
      const name = (table as { item?: string }).item ?? 'minecraft:dirt';
      const named = ctx.lookup('loot_table', 'demo:named') as { item?: string } | undefined;
      return {
        stacks: [{ id: named?.item ?? name, count: 1 + Math.floor(ctx.random.next() * 3) }],
        unsupported: [],
      };
    },
    *lootOdds(_table, _situation, _ctx, options): Iterable<OddsStep> {
      calls.odds += 1;
      let done = 0;
      while (done < options.rolls) {
        if (options.cancel.cancelled) return;
        done = Math.min(options.rolls, done + options.step);
        yield {
          done,
          rows: [{ item: 'minecraft:dirt', chance: 0.5, mean: 0.5, counts: { 1: done / 2 } }],
        };
      }
    },
    createTagResolver(lookup, options) {
      return (registry, id): ResolvedTag => {
        calls.tags.push(`${registry}|${id}`);
        const folder = `${options?.tagsFolder ?? 'tags'}/${registry}`;
        const file = lookup(folder, id) as { values?: string[] } | undefined;
        const values = (file?.values ?? []).filter(
          (member) => options?.exists?.(registry, member) !== false,
        );
        return {
          registry,
          id,
          members: values.map((member) => ({ id: member, origin: 'project', chain: [] })),
          missing: [],
          cycles: [],
          dropped: file === undefined,
          replaced: false,
        };
      };
    },
    testPredicate(_predicate, situation): PredicateResult {
      const answer = situation.tool === undefined ? 'unknown' : 'yes';
      return {
        answer,
        parts: { path: '', type: 'minecraft:match_tool', answer, parts: [] },
        unsupported: [],
      };
    },
    applyItemModifier(_modifier, item) {
      return { item: { ...item, count: item.count + 1 }, unsupported: [] };
    },
  };
}

/** A worker running the real host over `engine` in this thread; answers arrive a tick later. */
export function hostWorker(engine: LiveViewEngine): LiveViewWorkerLike & {
  readonly sent: LiveViewRequest[];
} {
  const sent: LiveViewRequest[] = [];
  const worker = {
    sent,
    onmessage: null as ((event: { readonly data: LiveViewAnswer }) => void) | null,
    terminate() {},
    postMessage(message: LiveViewRequest) {
      sent.push(message);
      host.receive(structuredClone(message));
    },
  };
  const host = createLiveViewHost(engine, (answer) => {
    setTimeout(() => worker.onmessage?.({ data: structuredClone(answer) }), 0);
  });
  return worker;
}

/** Lets timers and promises run. */
export async function settle(times = 30): Promise<void> {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
