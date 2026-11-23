// B650's answer cases (queries-draft.json's twelve with answers or a behaviour, and SQ6's clash
// rules), over fixtures with the flows' question shapes.
import { beforeAll, describe, expect, it } from 'vitest';
import { type Harness, harness } from './harness';

interface Case {
  readonly q: string;
  /** The entry whose answers are checked. */
  readonly entry: string;
  readonly answers?: Record<string, unknown>;
  /** Questions that must stay unanswered. */
  readonly none?: readonly string[];
  readonly behaviour?: string;
  readonly makesThing?: boolean;
  /** Chips expected among the understood line. */
  readonly chips?: readonly { text: string; kind: string; struck?: boolean }[];
}

const CASES: Case[] = [
  // queries-draft.json
  {
    q: 'blue sword',
    entry: 'flow:weapon',
    answers: { weapon_type: 'sword', colour: '#3c44aa', weapon_name: 'Blue Sword' },
    makesThing: true,
    chips: [{ text: 'blue', kind: 'colour' }],
  },
  { q: 'make a pig fly', entry: 'flow:flying-mob', answers: { mob_name: 'Flying Pig' } },
  {
    q: 'netherrite sword',
    entry: 'flow:weapon',
    answers: { weapon_type: 'sword', tier: 'netherite' },
    none: ['colour', 'weapon_name'],
    makesThing: true,
  },
  {
    q: 'netherite pick',
    entry: 'flow:gear-set',
    answers: { pieces: ['pickaxe'], tier: 'netherite' },
    makesThing: true,
  },
  {
    q: 'blue sword that sets mobs on fire',
    entry: 'flow:weapon',
    answers: { weapon_type: 'sword', colour: '#3c44aa', weapon_name: 'Blue Sword' },
    behaviour: 'sets-on-fire',
    chips: [
      { text: 'blue', kind: 'colour' },
      { text: 'sets mobs on fire', kind: 'behaviour' },
    ],
  },
  { q: 'custom ore that drops xp', entry: 'flow:custom_ore', behaviour: 'block-drops-xp' },
  { q: 'a block that explodes', entry: 'flow:simple-block', behaviour: 'block-explodes' },
  {
    q: 'a sword that poisons',
    entry: 'flow:weapon',
    behaviour: 'poisons',
    answers: { weapon_type: 'sword' },
  },
  { q: 'a mob that flies', entry: 'flow:flying-mob', behaviour: 'flies' },
  // B666 (B663's "Custom Ore"): only a thing of the flow's own sort stands in for the title's
  // sort word, whether named by the game's name, by an idea with an id or by a typed id.
  { q: 'flying piggy', entry: 'flow:flying-mob', answers: { mob_name: 'Flying Piggy' } },
  { q: 'flying bone', entry: 'flow:flying-mob', none: ['mob_name'] },
  { q: 'flying bones', entry: 'flow:flying-mob', none: ['mob_name'] },
  { q: 'flying base:bone', entry: 'flow:flying-mob', none: ['mob_name'] },
  { q: 'flying ruby', entry: 'flow:flying-mob', none: ['mob_name'] },
  { q: 'flying gem', entry: 'flow:flying-mob', none: ['mob_name'] },
  { q: 'an animal you can ride', entry: 'flow:mount', behaviour: 'ride' },
  {
    q: 'a block that glows',
    entry: 'flow:simple-block',
    behaviour: 'glows',
    answers: { light_level: 15 },
  },
  { q: 'a wand that teleports you', entry: 'flow:scripted-item', behaviour: 'item-teleports' },
  // The follow-ups after the close: a name is made from the words as corrected, not as typed
  // (the noun of a title that has it was "Blue Swrod").
  {
    q: 'blue swrod',
    entry: 'starter:custom-sword',
    answers: { colour: '#3c44aa', sword_name: 'Blue Sword' },
  },
  // The plan's "20 damage bow": bows have no attack damage, and 20 is past the multiplier's 5.
  {
    q: '20 damage bow',
    entry: 'flow:weapon',
    answers: { weapon_type: 'bow' },
    none: ['attack_damage', 'damage_multiplier', 'custom_damage'],
    chips: [{ text: '20', kind: 'number', struck: true }],
  },
  // Rule 7 with B654's note: a melee damage number turns the flow's own numbers on.
  {
    q: '20 damage sword',
    entry: 'flow:weapon',
    answers: { weapon_type: 'sword', attack_damage: 20, custom_damage: true },
    chips: [{ text: '20', kind: 'number' }],
  },
  // Rule 1: a "from" question only after "from", "of", "made of" or "with".
  {
    q: 'sword from diamonds',
    entry: 'flow:weapon',
    answers: { weapon_type: 'sword', ingredient: 'base:diamond' },
    none: ['tier'],
  },
  {
    q: 'diamond sword',
    entry: 'flow:weapon',
    answers: { tier: 'diamond' },
    none: ['ingredient', 'colour'],
  },
  { q: 'a sword made of emeralds', entry: 'flow:weapon', answers: { ingredient: 'base:emerald' } },
  { q: 'a sword with no recipe', entry: 'flow:weapon', answers: { ingredient: 'none' } },
  // Colours that are also materials: a choice takes the word first.
  { q: 'gold sword', entry: 'flow:weapon', answers: { tier: 'gold' }, none: ['colour'] },
  {
    q: 'emerald sword',
    entry: 'flow:weapon',
    answers: { colour: '#17dd62', weapon_name: 'Emerald Sword' },
    none: ['tier', 'ingredient'],
  },
  // Rule 2: "like X" only after "like" or "as".
  {
    q: 'iron armour like diamond',
    entry: 'flow:gear-set',
    answers: { tier: 'iron', armor_base: 'diamond' },
    none: ['mines_like'],
  },
  {
    q: 'iron ore',
    entry: 'flow:custom_ore',
    answers: { tool_tier: 'iron' },
    none: ['vein_preset'],
  },
  {
    q: 'ore with veins like diamond',
    entry: 'flow:custom_ore',
    answers: { vein_preset: 'diamond' },
    none: ['tool_tier'],
  },
  // Rule 3: numbered repeats in order, a number beside its effect.
  {
    q: 'speed consumable for 30 seconds and poison for 10 seconds',
    entry: 'flow:consumable',
    answers: {
      effect_1: 'base:speed',
      effect_1_seconds: 30,
      effect_2: 'base:poison',
      effect_2_seconds: 10,
    },
    none: ['seconds'],
  },
  // Rule 4: variants never.
  {
    q: 'red flying mob',
    entry: 'flow:flying-mob',
    answers: { colour: '#b02e26' },
    none: ['variant_1_colour'],
  },
  // Rule 5: `sameAs` takes the word together; a colour beside a second colour's word.
  {
    q: 'cherry tree with green leaves',
    entry: 'flow:tree',
    answers: { log: 'cherry', leaves: 'cherry', leaf_colour: '#5e7c16' },
    none: ['colour'],
  },
  { q: 'red cherry tree', entry: 'flow:tree', answers: { colour: '#b02e26', log: 'cherry' } },
  // Rule 6: a number with its word, in range, else dropped and struck.
  { q: 'crop with 30 compost', entry: 'flow:crop', answers: { produce_compost: 30 } },
  {
    q: 'sword with 9000 durability',
    entry: 'flow:weapon',
    none: ['durability'],
    chips: [{ text: '9000', kind: 'number', struck: true }],
  },
  { q: 'flying mob with 50 hearts', entry: 'flow:flying-mob', answers: { health: 50 } },
  { q: 'ore that drops 3 to 5', entry: 'flow:custom_ore', answers: { drop_min: 3, drop_max: 5 } },
  { q: 'ore drops 3 to 5', entry: 'flow:custom_ore', answers: { drop_min: 3, drop_max: 5 } },
  // A number with nothing beside it: only the main number.
  { q: 'backpack 4', entry: 'flow:backpack', answers: { rows: 4 } },
  { q: 'block 4', entry: 'flow:simple-block', none: ['light_level', 'hardness'] },
  { q: 'backpack with 5 rows', entry: 'flow:backpack', answers: { rows: 5 } },
  // Yes or no, with "no", "not" and "without".
  { q: 'backpack without a recipe', entry: 'flow:backpack', answers: { recipe: false } },
  { q: 'craftable backpack', entry: 'flow:backpack', answers: { recipe: true } },
  { q: 'mount that needs a saddle', entry: 'flow:mount', answers: { needs_saddle: true } },
  { q: 'mount with no saddle', entry: 'flow:mount', answers: { needs_saddle: false } },
  { q: 'mount with a saddle', entry: 'flow:mount', answers: { needs_saddle: true } },
  // A dye choice takes the first colour (B654: the Bed's blanket).
  { q: 'blue bed', entry: 'flow:bed', answers: { colour: 'blue' } },
  { q: 'sky blue bed', entry: 'flow:bed', answers: { colour: 'light_blue' } },
  { q: 'teal sleeping bag', entry: 'flow:bed', answers: { colour: 'cyan', kind: 'sleeping_bag' } },
  // The name: quoted, "called", or the colour and the noun; within the question's check.
  {
    q: 'a sword called frostbite',
    entry: 'flow:weapon',
    answers: { weapon_name: 'Frostbite', weapon_type: 'sword' },
    chips: [{ text: 'frostbite', kind: 'name' }],
  },
  { q: 'a "Sky Pig" mount', entry: 'flow:mount', answers: { mount_name: 'Sky Pig' } },
  { q: 'a sword called 4 ever', entry: 'flow:weapon', none: ['weapon_name'] },
  {
    q: 'blue custom sword',
    entry: 'starter:custom-sword',
    answers: { sword_name: 'Blue Sword', colour: '#3c44aa' },
    makesThing: false,
  },
  // Things named in the words: after their words, and a choice whose value is the thing.
  {
    q: 'villager trade that sells diamonds for 5 emeralds',
    entry: 'flow:villager-trade',
    answers: { direction: 'sells', item: 'base:diamond', emeralds: 5 },
  },
  {
    q: 'villager trade sells diamonds for 5 emeralds',
    entry: 'flow:villager-trade',
    answers: { direction: 'sells', item: 'base:diamond', emeralds: 5 },
  },
  {
    q: 'trade buys ruby',
    entry: 'flow:villager-trade',
    answers: { direction: 'buys', item: 'mod:ruby' },
  },
  {
    q: 'extra drop bones from zombies',
    entry: 'flow:extra-drop',
    answers: { table: 'entities/zombie' },
  },
  {
    q: 'zombies extra drop',
    entry: 'flow:extra-drop',
    none: ['table'],
  },
  {
    q: 'extra drop that drops bones',
    entry: 'flow:extra-drop',
    answers: { item: 'base:bone' },
    chips: [{ text: 'bones', kind: 'thing' }],
  },
  { q: 'extra drop that drops bones', entry: 'flow:simple-block', none: ['block_name'] },
  {
    q: 'drops base:bone from zombies',
    entry: 'flow:extra-drop',
    answers: { item: 'base:bone', table: 'entities/zombie' },
  },
  {
    q: 'flying mob that shoots arrows',
    entry: 'flow:flying-mob',
    answers: { behaviour: 'shooter', projectile: 'base:arrow' },
    none: ['flight'],
  },
  {
    q: 'ranged flying mob shoots arrows',
    entry: 'flow:flying-mob',
    answers: { behaviour: 'shooter', projectile: 'base:arrow' },
  },
  // Behaviours by sort: the same phrase, another rule.
  { q: 'a mob that drops xp', entry: 'flow:flying-mob', behaviour: 'mob-drops-xp' },
  { q: 'a sword that explodes', entry: 'flow:weapon', behaviour: 'item-explodes' },
  { q: 'a mount that flies', entry: 'flow:mount', behaviour: 'flies', answers: { flying: true } },
  {
    q: 'farm animal you can ride',
    entry: 'flow:farm-animal',
    behaviour: 'ride',
    answers: { rideable: true },
  },
  {
    q: 'a sword that frobnicates',
    entry: 'flow:weapon',
    answers: { weapon_type: 'sword' },
    chips: [{ text: 'frobnicates', kind: 'clause', struck: true }],
  },
  // A hex colour.
  { q: 'a #12ab9f sword', entry: 'flow:weapon', answers: { colour: '#12ab9f' } },
];

describe('answers from words (B650 SQ6 and the draft queries)', () => {
  let h: Harness;
  beforeAll(() => {
    h = harness();
  });

  for (const c of CASES) {
    it(c.q, () => {
      const reading = h.ask(c.q);
      const got = reading.byEntry.get(c.entry);
      expect(got, `${c.entry} was read`).toBeDefined();
      const answers = got?.answers ?? {};
      if (c.answers !== undefined) expect(answers).toMatchObject(c.answers);
      for (const id of c.none ?? []) expect(answers, id).not.toHaveProperty(id);
      if (c.behaviour !== undefined) expect(got?.behaviour?.id).toBe(c.behaviour);
      if (c.makesThing !== undefined) expect(got?.makesThing).toBe(c.makesThing);
      for (const chip of c.chips ?? []) {
        expect(reading.answer.understood.chips).toContainEqual(chip);
      }
      // What the hit shows is what was read.
      const hits = [...reading.answer.best, ...reading.answer.sections.flatMap((s) => s.hits)];
      const hit = hits.find((x) => x.entry.id === c.entry);
      if (hit !== undefined) {
        expect(hit.answers ?? {}).toEqual(answers);
        if (c.behaviour !== undefined) expect(hit.behaviour?.id).toBe(c.behaviour);
      }
    });
  }

  it('ranks the flow that took the noun above the starter that did not (blue sword)', () => {
    const reading = h.ask('blue sword');
    const order = [...reading.answer.best, ...reading.answer.sections.flatMap((s) => s.hits)].map(
      (x) => x.entry.id,
    );
    expect(order.indexOf('flow:weapon')).toBeLessThan(order.indexOf('starter:custom-sword'));
  });

  it("leaves the clause out of the text score and adds a behaviour's own flows", () => {
    const reading = h.ask('a mob that flies');
    expect(reading.extra).toContain('flow:flying-mob');
    expect(reading.skip).toEqual([2, 3]);
  });

  it('reads only the first behaviour of a clause and strikes the rest (SL3)', () => {
    const reading = h.ask('a block that glows and explodes');
    expect(reading.byEntry.get('flow:simple-block')?.behaviour?.id).toBe('glows');
    expect(reading.answer.understood.chips).toContainEqual({
      text: 'explodes',
      kind: 'clause',
      struck: true,
    });
  });
});
