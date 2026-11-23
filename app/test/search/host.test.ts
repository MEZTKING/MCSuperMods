/**
 * The search host over the real built-in registry (B660): the static, vanilla and project layers
 * built on this thread as the worker builds them, queries reaching the plugins' words, the jar's
 * made-up names, the open mod's things and the answer reader; folding of tiles and cards; the
 * build timings within generous multiples of ADR 0124 D3's budgets.
 */

import type { SearchAnswer, SearchHitSlim } from '@msm/search';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SearchOutbound, SlimAnswer, StaticSpec } from '../../src/renderer/src/search/client';
import { validateAnswer } from '../../src/renderer/src/search/host';
import { gatherSearchData } from '../../src/renderer/src/search/plugin-data';
import { collectStatic } from '../../src/renderer/src/search/sources';
import { projectEntries, projectThings } from '../../src/renderer/src/search/sources/project';
import { vanillaLayer } from '../../src/renderer/src/search/sources/vanilla';
import {
  appLists,
  builtInPlugins,
  factsOf,
  madeUpNames,
  projectWith,
  registriesOf,
  syncHost,
  TARGET_IDS,
} from './fixtures';

const TARGET = TARGET_IDS[TARGET_IDS.length - 1] as string;
let spec: StaticSpec;
let run: ReturnType<typeof syncHost>;
const built: Record<string, number> = {};
let token = 1;

const ask = (text: string, mode: 'very-easy' | 'easy' | 'advanced' = 'easy'): SlimAnswer => {
  const asked = token++;
  run.send({ type: 'query', token: asked, request: { text, mode } });
  const answer = run.out.find(
    (message): message is Extract<SearchOutbound, { type: 'answer' }> =>
      message.type === 'answer' && message.token === asked,
  );
  if (answer === undefined) throw new Error(`No answer to ${text}`);
  return answer.answer;
};
const ranked = (answer: SlimAnswer): SearchHitSlim[] => [
  ...answer.best,
  ...answer.sections.flatMap((section) => section.hits),
];
const topIds = (answer: SlimAnswer, n = 3): string[] =>
  ranked(answer)
    .slice(0, n)
    .map((hit) => hit.id);

beforeAll(async () => {
  const lists = await appLists();
  const data = await gatherSearchData(builtInPlugins);
  spec = collectStatic({ plugins: builtInPlugins, target: factsOf(TARGET), data, lists });
  run = syncHost();
  run.send({ type: 'static', spec });
  const vanilla = vanillaLayer(registriesOf(TARGET), madeUpNames());
  run.send({
    type: 'layer',
    layer: 'vanilla',
    entries: vanilla.entries,
    things: vanilla.things,
    protect: vanilla.protect,
  });
  const project = projectWith([
    { id: 'gems:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } },
    { id: 'gems:ruby_block', kind: 'msm:block', data: { display_name: 'Block of Ruby' } },
  ]);
  run.send({
    type: 'layer',
    layer: 'project',
    entries: projectEntries({ project, problems: [] }),
    things: projectThings(project),
  });
  for (const message of run.out) if (message.type === 'built') built[message.layer] = message.ms;
});

describe('the search host', () => {
  it('builds every layer and reports how long each took', () => {
    expect(Object.keys(built).sort()).toEqual(['project', 'static', 'vanilla']);
    // Generous multiples of the budgets (150 ms static, 250 ms vanilla) for a busy runner.
    expect(built.static).toBeLessThan(1500);
    expect(built.vanilla).toBeLessThan(2500);
    expect(run.out.some((message) => message.type === 'failed')).toBe(false);
  });

  it('finds a flow through the plugins’ words in either spelling', () => {
    for (const text of ['armour', 'armor']) {
      const top = topIds(ask(text));
      expect(
        top.some((id) => id === 'flow:gear-set' || id === 'tile:armour'),
        `${text}: ${top}`,
      ).toBe(true);
    }
  });

  it('reads answers from the words into the flow', () => {
    const answer = ask('a blue sword');
    const weapon = ranked(answer).find((hit) => hit.id === 'flow:weapon');
    expect(weapon, topIds(answer, 6).join()).toBeDefined();
    expect(Object.keys(weapon?.answers ?? {}).length).toBeGreaterThan(0);
  });

  it('finds Minecraft’s own things by the jar’s names, by id and with a typo', () => {
    expect(topIds(ask('minecraft:iron_ingot'), 1)).toEqual(['vanilla:thing:iron_ingot']);
    expect(topIds(ask('Test Metal Bar'))).toContain('vanilla:thing:iron_ingot');
    expect(topIds(ask('creper', 'advanced'), 5)).toContain('vanilla:mob:creeper');
  });

  it('finds the open mod’s things', () => {
    expect(topIds(ask('ruby sword'))).toContain('project:element:gems:ruby_sword');
  });

  it('shows a one-flow tile, its card and its flow as one result', () => {
    for (const text of ['wood set', 'vehicle', 'make a car']) {
      const hits = ranked(ask(text, 'very-easy')).map((hit) => hit.id);
      expect(
        hits.filter((id) => id === 'flow:wood-set' || id === 'card:wood-set').length,
      ).toBeLessThanOrEqual(1);
      expect(
        hits.filter((id) => id === 'tile:vehicle' || id === 'card:vehicle').length,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('answers a query quickly once built (the dictionary is warm)', () => {
    const answers = run.out.filter((message) => message.type === 'answer');
    const last = answers[answers.length - 1];
    expect(last?.type === 'answer' ? last.ms : 0).toBeLessThan(500);
  });

  it('never throws on odd text', () => {
    for (const text of ['', '   ', '>', '#', '@@@', 'a'.repeat(400), '\u0000', 'minecraft:']) {
      const answer: SlimAnswer | SearchAnswer = ask(text);
      expect(Array.isArray(answer.best)).toBe(true);
    }
  });
});

describe('the wizard’s check of an answer', () => {
  it('passes answers in range and refuses others', () => {
    const flows = spec.flows;
    const [starter, flow] = Object.entries(flows).find(([, f]) =>
      f.parameters.some((p) => p.type === 'number' && p.max !== undefined),
    ) as [string, (typeof flows)[string]];
    const number = flow.parameters.find((p) => p.type === 'number' && p.max !== undefined);
    if (number?.type !== 'number' || number.max === undefined)
      throw new Error('no number question');
    expect(validateAnswer(flows, starter, number.id, number.max)).toBe(true);
    expect(validateAnswer(flows, starter, number.id, number.max + 1000)).toBe(false);
    expect(validateAnswer(flows, starter, number.id, 'ten')).toBe(false);
    expect(validateAnswer(flows, starter, 'no-such-question', 1)).toBe(true);
    const name = flows.weapon?.parameters.find((p) => p.type === 'string');
    if (name?.type === 'string' && name.maxLength !== undefined) {
      expect(validateAnswer(flows, 'weapon', name.id, 'x'.repeat(name.maxLength + 1))).toBe(false);
    }
  });
});
