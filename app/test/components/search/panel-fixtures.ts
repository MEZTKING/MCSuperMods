/**
 * Small made-up answers for the search panel's component tests (B663): entries of each source,
 * hits with answers and a behaviour, and a query double that answers from a table and records
 * every request.
 */

import type {
  SearchAnswer,
  SearchEntry,
  SearchHit,
  SearchRequest,
  SearchSection,
  Understood,
} from '@msm/search';

export function entry(
  id: string,
  source: SearchEntry['source'],
  title: string,
  extra: Partial<SearchEntry> = {},
): SearchEntry {
  const type =
    source === 'flow'
      ? 'flow'
      : source === 'vanilla'
        ? 'vanilla'
        : source === 'guide'
          ? 'guide'
          : source === 'command'
            ? 'command'
            : source === 'template'
              ? 'template'
              : source === 'setting'
                ? 'setting'
                : source === 'project'
                  ? 'element'
                  : source === 'problem'
                    ? 'problem'
                    : source;
  return {
    id,
    source,
    title,
    available: true,
    action: { type },
    preview: { type },
    ...extra,
  };
}

export function hit(e: SearchEntry, extra: Partial<SearchHit> = {}): SearchHit {
  return { entry: e, score: 1, why: [], ...extra };
}

export const WEAPON = entry('flow:weapon', 'flow', 'Weapon', {
  sentence: 'One weapon: a sword, spear, mace, bow, crossbow or shield with its stats.',
  questions: [
    {
      id: 'weapon_type',
      label: 'Weapon type',
      type: 'choice',
      choices: [
        { value: 'sword', label: 'Sword' },
        { value: 'bow', label: 'Bow' },
      ],
    },
    { id: 'colour', label: 'Colour', type: 'colour' },
    { id: 'weapon_name', label: 'Name', type: 'string' },
  ],
});
export const CUSTOM_SWORD = entry('starter:custom-sword', 'starter', 'Custom sword', {
  sentence: 'A new sword with its own name: the Custom sword starter.',
});
export const DIAMOND_SWORD = entry('vanilla:thing:diamond_sword', 'vanilla', 'Diamond sword', {
  ids: ['minecraft:diamond_sword'],
});
export const COPPER_SWORD = entry('vanilla:thing:copper_sword', 'vanilla', 'Copper sword', {
  ids: ['minecraft:copper_sword'],
});
export const IRON_SWORD = entry('vanilla:thing:iron_sword', 'vanilla', 'Iron sword', {
  ids: ['minecraft:iron_sword'],
});
export const STONE_SWORD = entry('vanilla:thing:stone_sword', 'vanilla', 'Stone sword', {
  ids: ['minecraft:stone_sword'],
});
export const GUIDE = entry('guide:creator.md#make-a-weapon', 'guide', 'Make a weapon', {
  action: { type: 'guide', page: 'creator', anchor: 'make-a-weapon' },
});
export const TEMPLATE = entry('template:item_sword', 'template', 'Sword template', {
  sentence: 'A sword element with msm:item data.',
  technical: true,
  action: { type: 'template', template: 'item_sword', kind: 'msm:item' },
});
export const NOT_HERE = entry('flow:spear', 'flow', 'Spear', {
  available: false,
  unavailableReason: 'Not on this Minecraft version.',
});

export const BLUE: Understood = { chips: [{ text: 'blue', kind: 'colour' }] };

export const BLUE_SWORD_HIT = hit(WEAPON, {
  answers: { weapon_type: 'sword', colour: '#3c44aa', weapon_name: 'Blue Sword' },
});

export function section(id: string, hits: SearchHit[], more = 0): SearchSection {
  return { id, hits, more };
}

/** "blue sword": two Best matches, Things you can make, From Minecraft with more rows, How to. */
export function blueSword(opened = false): SearchAnswer {
  const minecraft = [DIAMOND_SWORD, COPPER_SWORD, IRON_SWORD, STONE_SWORD].map((e) => hit(e));
  return {
    understood: BLUE,
    confident: true,
    best: [BLUE_SWORD_HIT, hit(CUSTOM_SWORD, { answers: { sword_name: 'Blue Sword' } })],
    sections: [
      section('make', [hit(NOT_HERE)]),
      opened ? section('minecraft', minecraft, 0) : section('minecraft', minecraft.slice(0, 3), 1),
      section('help', [hit(GUIDE)]),
      section('more', [hit(TEMPLATE)]),
    ],
  };
}

export const NOTHING: SearchAnswer = {
  understood: { chips: [{ text: 'blorptastic', kind: 'not-understood', struck: true }] },
  confident: false,
  best: [],
  sections: [],
};

export const CLOSEST: SearchAnswer = {
  understood: {
    corrected: 'lore ipsum door',
    chips: [
      { text: 'lore', kind: 'corrected' },
      { text: 'door', kind: 'corrected' },
      { text: 'ipsum', kind: 'not-understood', struck: true },
    ],
  },
  confident: false,
  best: [],
  sections: [section('minecraft', [hit(entry('vanilla:thing:oak_door', 'vanilla', 'Oak door'))])],
};

/** A query double: the answer for the request's text (else nothing close), every request kept. */
export function fakeQuery(table: (request: SearchRequest) => SearchAnswer | null): {
  query: (request: SearchRequest) => Promise<SearchAnswer | null>;
  requests: SearchRequest[];
} {
  const requests: SearchRequest[] = [];
  return {
    requests,
    query: (request) => {
      requests.push(request);
      return Promise.resolve(table(request));
    },
  };
}
