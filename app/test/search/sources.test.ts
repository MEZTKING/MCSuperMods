/**
 * The static sources over the real built-in registry (B660's exit criteria): every flow, starter,
 * template, example, kind, command, trigger and step yields exactly one entry per target; the
 * plugins' keywords reach the entries they name and their vocabulary reaches the engine; tiles and
 * Showcase cards carry their flows' actions so they fold; the static layer builds with no mod open.
 */

import { CONDITIONS, STEPS, TRIGGERS, VALUES } from '@msm/plugin-rules';
import type { SearchEntry } from '@msm/search';
import { beforeAll, describe, expect, it } from 'vitest';
import type { StaticSpec } from '../../src/renderer/src/search/client';
import {
  type GatheredPluginData,
  gatherSearchData,
} from '../../src/renderer/src/search/plugin-data';
import {
  type AppLists,
  collectStatic,
  countBySource,
  SearchFeed,
} from '../../src/renderer/src/search/sources';
import { registeredExamples } from '../../src/renderer/src/search/sources/examples';
import { registeredStarters } from '../../src/renderer/src/search/sources/shared';
import { registeredTemplates } from '../../src/renderer/src/search/sources/templates';
import { appLists, builtInPlugins, factsOf, TARGET_IDS } from './fixtures';

let lists: AppLists;
let data: GatheredPluginData[];
const specs = new Map<string, StaticSpec>();

beforeAll(async () => {
  lists = await appLists();
  data = await gatherSearchData(builtInPlugins);
  for (const id of TARGET_IDS) {
    specs.set(id, collectStatic({ plugins: builtInPlugins, target: factsOf(id), data, lists }));
  }
});

const specOf = (id: string): StaticSpec => specs.get(id) as StaticSpec;
const ids = (spec: StaticSpec): Map<string, number> => {
  const out = new Map<string, number>();
  for (const entry of spec.entries) out.set(entry.id, (out.get(entry.id) ?? 0) + 1);
  return out;
};

describe.each(TARGET_IDS)('the static layer on %s', (targetId) => {
  it('has unique entry ids, each entry well formed', () => {
    const spec = specOf(targetId);
    const counts = ids(spec);
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
    for (const entry of spec.entries) {
      expect(entry.title.trim()).not.toBe('');
      expect(typeof entry.action.type).toBe('string');
      expect(typeof entry.preview.type).toBe('string');
      expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
    }
  });

  it('has exactly one entry per flow, starter, template, example, kind and command', () => {
    const counts = ids(specOf(targetId));
    const one = (id: string): void => expect(counts.get(id), id).toBe(1);
    const plugins = { plugins: builtInPlugins };
    const starters = registeredStarters(plugins);
    expect(starters.length).toBeGreaterThan(70);
    for (const { starter } of starters) {
      one(starter.creator !== undefined ? `flow:${starter.id}` : `starter:${starter.id}`);
      expect(
        counts.has(starter.creator !== undefined ? `starter:${starter.id}` : `flow:${starter.id}`),
      ).toBe(false);
    }
    const templates = registeredTemplates(plugins);
    expect(templates.length).toBeGreaterThan(290);
    for (const { template } of templates) one(`template:${template.id}`);
    const examples = registeredExamples(plugins);
    expect(examples.length).toBeGreaterThan(190);
    for (const { example } of examples) one(`example:${example.id}`);
    const kinds = new Set(
      builtInPlugins.flatMap((p) => (p.contributes.elementKinds ?? []).map((k) => k.id)),
    );
    expect(kinds.size).toBeGreaterThan(110);
    for (const kind of kinds) one(`kind:${kind}`);
    expect(lists.commands.length).toBeGreaterThanOrEqual(51);
    for (const command of lists.commands) one(`command:${command.id}`);
    for (const plugin of builtInPlugins) {
      for (const command of plugin.contributes.commands ?? []) one(`command:${command.id}`);
    }
  });

  it('has exactly one entry per trigger, step, condition and number of the Rules catalogue', () => {
    const counts = ids(specOf(targetId));
    for (const [part, entries] of [
      ['trigger', TRIGGERS],
      ['step', STEPS],
      ['condition', CONDITIONS],
      ['value', VALUES],
    ] as const) {
      expect(entries.length).toBeGreaterThan(10);
      for (const entry of entries) expect(counts.get(`rule:${part}:${entry.id}`), entry.id).toBe(1);
    }
    const trigger = specOf(targetId).entries.find(
      (entry) => entry.id === `rule:trigger:${TRIGGERS[0]?.id}`,
    );
    expect(trigger?.title).toBe(TRIGGERS[0]?.label);
    expect(trigger?.sentence).not.toMatch(/[{}]/);
  });

  it('marks flows, templates and examples the target cannot make as unavailable', () => {
    const facts = factsOf(targetId);
    const byId = new Map(specOf(targetId).entries.map((entry) => [entry.id, entry]));
    for (const { template } of registeredTemplates({ plugins: builtInPlugins })) {
      const supported = template.supports?.(facts) ?? true;
      expect(byId.get(`template:${template.id}`)?.available, template.id).toBe(supported);
    }
    for (const { starter } of registeredStarters({ plugins: builtInPlugins })) {
      const supported = starter.supports?.(facts) ?? true;
      const id = starter.creator !== undefined ? `flow:${starter.id}` : `starter:${starter.id}`;
      expect(byId.get(id)?.available, id).toBe(supported);
      if (!supported)
        expect(byId.get(id)?.unavailableReason).toBe('Not on this Minecraft version.');
    }
  });

  it('gives flows their questions and the reader each flow’s facts', () => {
    const spec = specOf(targetId);
    const weapon = spec.entries.find((entry) => entry.id === 'flow:weapon');
    expect(weapon?.source).toBe('flow');
    expect(weapon?.questions?.length).toBeGreaterThan(3);
    expect(weapon?.action).toEqual({ type: 'flow', starter: 'weapon' });
    expect(spec.flows.weapon?.sort).toBe('item');
    expect(spec.flows.custom_mob?.sort ?? spec.flows['flying-mob']?.sort).toBe('mob');
    // The `scripts` group mixes sorts: the Scripted behaviour flow makes an item, the command
    // and game rule flows nothing an item behaviour fits (the follow-ups after the close).
    expect(spec.flows['scripted-item']?.sort).toBe('item');
    expect(spec.flows['custom-command']?.sort).toBeUndefined();
    for (const [id, flow] of Object.entries(spec.flows)) {
      for (const parameter of flow.parameters)
        expect(flow.defaults[parameter.id], `${id}.${parameter.id}`).toEqual(parameter.default);
      expect(JSON.parse(JSON.stringify(flow))).toEqual(flow);
    }
  });

  it('folds one-flow tiles and cards into their flows and keeps choosers apart', () => {
    const byId = new Map(specOf(targetId).entries.map((entry) => [entry.id, entry]));
    // "Make a magic wand" offers one flow: the same action as the flow.
    expect(byId.get('tile:wand')?.action).toEqual(byId.get('flow:scripted-item')?.action);
    // "Make a vehicle" and its Showcase card offer the same four flows: one chooser action.
    const vehicleTile = byId.get('tile:vehicle');
    expect(vehicleTile?.action.type).toBe('flows');
    expect(byId.get('card:vehicle')?.action).toEqual(vehicleTile?.action);
    // The Wood set card folds into the Wood set flow; its preview is the card's still.
    expect(byId.get('card:wood-set')?.action).toEqual(byId.get('flow:wood-set')?.action);
    expect(byId.get('card:wood-set')?.preview).toMatchObject({
      type: 'showcase',
      card: 'wood-set',
    });
    // A Very easy pick carries its flow's action ("Sign" opens the Wood set flow).
    expect(byId.get('tile-pick:sign')?.action).toEqual({ type: 'flow', starter: 'wood-set' });
    // The Rules card makes its example.
    const rulesCard = byId.get('card:rules') as SearchEntry;
    expect(rulesCard.action.type).toBe('example');
    expect(byId.has(`example:${rulesCard.action.example as string}`)).toBe(true);
  });

  it('carries the plugins’ keywords to the entries they name', () => {
    const byId = new Map(specOf(targetId).entries.map((entry) => [entry.id, entry]));
    let checked = 0;
    for (const { data: lines } of data) {
      for (const [id, words] of Object.entries(lines.keywords ?? {})) {
        const entry =
          byId.get(`flow:${id}`) ??
          byId.get(`starter:${id}`) ??
          byId.get(`template:${id}`) ??
          byId.get(`kind:${id}`);
        expect(entry, id).toBeDefined();
        for (const word of words) expect(entry?.words, `${id}: ${word}`).toContain(word);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('hands the plugins’ vocabulary, behaviours and hints to the engine in plugin order', () => {
    const spec = specOf(targetId);
    const withVocabulary = data.filter((entry) => entry.data.vocabulary !== undefined);
    expect(spec.vocabulary).toEqual(withVocabulary.map((entry) => entry.data.vocabulary));
    expect(spec.plugins.map((entry) => entry.plugin)).toEqual(
      builtInPlugins.map((plugin) => plugin.id),
    );
    expect(spec.protect.length).toBeGreaterThan(100);
    const behaviours = spec.plugins.flatMap((entry) => entry.data?.behaviours ?? []);
    expect(behaviours.length).toBeGreaterThan(50);
  });

  it('adds the plugins’ extra doors with the availability of what they open', () => {
    const spec = specOf(targetId);
    const doors = spec.entries.filter((entry) => entry.id.startsWith('entry:'));
    const lines = data.flatMap((entry) => entry.data.entries ?? []);
    expect(lines.length).toBeGreaterThan(50);
    expect(doors.length).toBeGreaterThan(50);
    for (const door of doors)
      expect(['flow', 'starter', 'template', 'example', 'kind', 'command']).toContain(door.source);
  });
});

describe('the plugins’ search data', () => {
  it('passes every built-in plugin’s check with no problem', () => {
    for (const entry of data) expect(entry.problems, entry.plugin).toEqual([]);
  });
});

describe('the static layer with no mod open', () => {
  it('builds on the default target from the plugin list alone', async () => {
    const sent: StaticSpec[] = [];
    const feed = new SearchFeed({
      client: {
        setStatic: (spec) => sent.push(spec),
        setLayer: () => undefined,
        patchLayer: () => undefined,
        setContext: () => undefined,
        layerEntries: () => new Map(),
      },
      plugins: () => builtInPlugins,
      lists,
      defaultTargetId: TARGET_IDS[TARGET_IDS.length - 1] as string,
      targetFacts: (id) => (TARGET_IDS.includes(id) ? factsOf(id) : undefined),
      session: null,
      readGuide: async () => null,
    });
    await feed.start();
    feed.dispose();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.targetId).toBe(TARGET_IDS[TARGET_IDS.length - 1]);
    expect(countBySource(sent[0]?.entries ?? [])).toEqual(feed.counts);
    expect(feed.counts.flow).toBeGreaterThan(55);
  });
});
