/**
 * Two answer findings of ADR 0124's close, over the search as the app builds it (the built-in
 * plugins, each target's vanilla layer with and without the made-up names file, an empty mod):
 *
 * - a pet fox read fish as the Pet flow's taming food (a fox is not a fish). Not reproduced on
 *   the engine after B666's thing-sort fix; pinned here so it stays that way: no row of the Pet
 *   flow or its doors takes a taming food from the words of a fox.
 * - the name answer kept a typed misspelling on a door ("a blue swrod" named "Blue Swrod" on the
 *   Sword door while the Weapon flow said "Blue Sword"): names are made from the words as
 *   corrected (the follow-ups after the close).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { TARGET_IDS } from './fixtures';
import { buildSearch, type GoldenSearch, loadShared, ranked } from './golden-runner';

const searches: GoldenSearch[] = [];

beforeAll(async () => {
  const shared = await loadShared();
  for (const target of TARGET_IDS) {
    for (const names of [false, true]) {
      searches.push(buildSearch(shared, { target, names, project: 'empty' }));
    }
  }
}, 120_000);

/** Whether a hit is the Pet flow or a door that opens it. */
function opensPet(search: GoldenSearch, id: string): boolean {
  const action = search.entries.get(id)?.action as { type?: string; starter?: string } | undefined;
  return id === 'flow:pet' || (action?.type === 'flow' && action.starter === 'pet');
}

describe('answers from the words', () => {
  it('reads no taming food from a fox', () => {
    for (const search of searches) {
      for (const q of ['pet fox', 'a pet fox', 'make a pet fox', 'tame fox', 'fox pet']) {
        for (const mode of ['very-easy', 'easy'] as const) {
          const pets = ranked(search.ask(q, mode)).filter((hit) => opensPet(search, hit.id));
          for (const hit of pets) {
            expect(hit.answers?.taming_food, `${search.config.target} ${q} ${hit.id}`).toBe(
              undefined,
            );
          }
        }
      }
      // A food named in the words is still read.
      const named = ranked(search.ask('a pet fox you tame with berries', 'very-easy')).find(
        (hit) => hit.id === 'flow:pet',
      );
      expect(named?.answers?.taming_food).toBe('berries');
    }
  });

  it('names the made thing from the words as corrected, on the flow and on its door', () => {
    for (const search of searches) {
      const hits = ranked(search.ask('a blue swrod', 'very-easy'));
      for (const id of ['flow:weapon', 'entry:msm.library:sword']) {
        const hit = hits.find((entry) => entry.id === id);
        expect(hit?.answers?.weapon_name, `${search.config.target} ${id}`).toBe('Blue Sword');
      }
    }
  });
});
