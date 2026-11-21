import { describe, expect, it } from 'vitest';
import { builtInTargets } from '../src/index';
import { clientJarPath, zipJsonEntries } from './client-jar';

/**
 * `EntityFacts.vanillaTradeSets` and `BlockFacts.fluidTags` against the data files of the client
 * jar Fabric Loom caches (ADR 0098 D5, ADR 0099 D4): the default data pack's trade sets, villager
 * trades and their tags are read (data, not code or assets), the trades of each set counted with
 * its trade tags resolved, and the trades with a `merchant_predicate` on the villager's variant
 * counted apart. Skipped without a jar: MSM never bundles Mojang files.
 */
const DATA = 'data/minecraft/';

type Json = Record<string, unknown>;

/** `minecraft:x` or `x` to `x`. */
const bare = (id: string): string => (id.startsWith('minecraft:') ? id.slice(10) : id);

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle.target] as const))(
  'villager and fluid data of %s',
  (id, target) => {
    const jar = clientJarPath(id, target.mcVersion);

    it.skipIf(jar === undefined)(
      'counts the trades of every vanilla trade set',
      async () => {
        const files = await zipJsonEntries(
          jar ?? '',
          ['trade_set/', 'villager_trade/', 'tags/villager_trade/'].map((folder) => DATA + folder),
        );
        const file = (folder: string, name: string): Json => {
          const value = files.get(`${DATA}${folder}/${name}.json`);
          if (value === undefined) throw new Error(`${folder}/${name} is not in the jar`);
          return value as Json;
        };
        /** Villager trade ids of a trade set's `trades` (an id, a `#` tag or a list of them). */
        const expand = (ref: unknown, seen: Set<string>): string[] => {
          if (Array.isArray(ref)) return ref.flatMap((entry) => expand(entry, seen));
          const value = typeof ref === 'object' && ref !== null ? (ref as Json).id : ref;
          if (typeof value !== 'string')
            throw new Error(`unexpected trade reference ${String(ref)}`);
          if (!value.startsWith('#')) return [bare(value)];
          const tag = bare(value.slice(1));
          if (seen.has(tag)) return [];
          seen.add(tag);
          return expand(file('tags/villager_trade', tag).values, seen);
        };
        const prefix = `${DATA}trade_set/`;
        const ids = [...files.keys()]
          .filter((name) => name.startsWith(prefix))
          .map((name) => name.slice(prefix.length, -'.json'.length))
          .sort();
        const counted: Record<string, { trades: number; villagerOnlyTrades: number }> = {};
        for (const set of ids) {
          const trades = [...new Set(expand(file('trade_set', set).trades, new Set()))];
          const villagerOnly = trades.filter((trade) =>
            JSON.stringify(file('villager_trade', trade).merchant_predicate ?? null).includes(
              'minecraft:villager/variant',
            ),
          );
          counted[`minecraft:${set}`] = {
            trades: trades.length,
            villagerOnlyTrades: villagerOnly.length,
          };
        }
        const facts = Object.fromEntries(
          Object.entries(target.entities?.vanillaTradeSets ?? {}).map(([set, value]) => [
            set,
            { trades: value.trades, villagerOnlyTrades: value.villagerOnlyTrades },
          ]),
        );
        expect(facts).toEqual(counted);
      },
      60_000,
    );

    it.skipIf(jar === undefined)(
      'names fluid tags that hold vanilla water and lava',
      async () => {
        const files = await zipJsonEntries(jar ?? '', [`${DATA}tags/fluid/`]);
        const members = (tag: string): string[] => {
          const value = files.get(`${DATA}tags/fluid/${bare(tag)}.json`) as Json | undefined;
          if (value === undefined) throw new Error(`${tag} is not in the jar`);
          return (value.values as string[]).map(bare);
        };
        const two = target.blocks?.fluidModel === 'two_fluids';
        for (const tag of target.blocks?.fluidTags?.water ?? []) {
          expect(members(tag), tag).toContain('water');
          // Two-fluid versions list the flowing fluid in the tag as well; lowering does the same.
          expect(members(tag).includes('flowing_water'), tag).toBe(two);
        }
        for (const tag of target.blocks?.fluidTags?.lava ?? []) {
          expect(members(tag), tag).toContain('lava');
          expect(members(tag).includes('flowing_lava'), tag).toBe(two);
        }
      },
      30_000,
    );

    it.skipIf(jar === undefined)(
      'lists every acquirable job site as a point of interest type',
      async () => {
        const files = await zipJsonEntries(jar ?? '', [`${DATA}tags/point_of_interest_type/`]);
        const tag = files.get(`${DATA}tags/point_of_interest_type/acquirable_job_site.json`) as
          | Json
          | undefined;
        const values = (tag?.values as string[] | undefined) ?? [];
        expect(values.length).toBeGreaterThan(0);
        for (const poi of values) {
          expect(Object.keys(target.entities?.vanillaJobSites ?? {}), poi).toContain(poi);
        }
      },
    );
  },
);
