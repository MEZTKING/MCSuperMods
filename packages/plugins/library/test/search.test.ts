/**
 * The library's search data (ADR 0124 D5, D7, D13; docs/PLAN-search.md B654): it passes the
 * plugin API's own check with the built-in limits, every vanilla id it names exists on both
 * targets, and every starter, question and value it names is one of the library's own and passes
 * the wizard's check (the rules of `validateParameter` in the app's wizard model, for stored
 * values), and builds.
 */
import { readFile } from 'node:fs/promises';
import {
  BUILT_IN_SEARCH_LIMITS,
  type Json,
  type PluginSearchData,
  type ProjectStarter,
  type SearchWordGroup,
  type StarterParameter,
  searchOwnThingsOf,
  validateSearchContributions,
} from '@msm/plugin-api';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import plugin from '../src/index';

let SEARCH: PluginSearchData;
const starters = new Map<string, ProjectStarter>(
  (plugin.contributes.projectStarters ?? []).map((starter) => [starter.id, starter]),
);

beforeAll(async () => {
  SEARCH = (await plugin.contributes.searchData?.()) ?? {};
});

/** The parameter `question` of `starter`, or undefined. */
function parameterOf(starter: string, question: string): StarterParameter | undefined {
  return starters.get(starter)?.parameters?.find((parameter) => parameter.id === question);
}

/** The wizard's check of one stored value (the app's `validateParameter`, for stored values). */
function valueProblem(parameter: StarterParameter, value: Json): string | null {
  switch (parameter.type) {
    case 'boolean':
      return typeof value === 'boolean' ? null : 'not a boolean';
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'not a number';
      if (parameter.min !== undefined && value < parameter.min) return `below ${parameter.min}`;
      if (parameter.max !== undefined && value > parameter.max) return `above ${parameter.max}`;
      if (parameter.step !== undefined && parameter.step > 0) {
        const steps = (value - (parameter.min ?? 0)) / parameter.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-9) return 'off its step';
      }
      return null;
    }
    case 'string': {
      if (typeof value !== 'string') return 'not a string';
      if (parameter.maxLength !== undefined && value.length > parameter.maxLength)
        return 'too long';
      if (
        parameter.pattern !== undefined &&
        !new RegExp(`^(?:${parameter.pattern})$`).test(value)
      ) {
        return 'not of the pattern';
      }
      return value.trim() === '' ? 'empty' : null;
    }
    case 'colour':
      return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? null : 'not a colour';
    case 'choice':
      return typeof value === 'string' && parameter.choices.some((choice) => choice.value === value)
        ? null
        : `not a choice: ${JSON.stringify(value)}`;
    case 'set': {
      if (!Array.isArray(value)) return 'not a list';
      if (value.some((item) => !parameter.choices.some((choice) => choice.value === item))) {
        return `not choices: ${JSON.stringify(value)}`;
      }
      return new Set(value).size < (parameter.min ?? 0) ? 'too few' : null;
    }
    default:
      return 'a file is never answered from words';
  }
}

/** Every `starter`/`values` pair the data asks a flow to make: entries and behaviours. */
function namedValues(
  data: PluginSearchData,
): { where: string; starter: string; values: Record<string, Json> }[] {
  const out: { where: string; starter: string; values: Record<string, Json> }[] = [];
  for (const entry of data.entries ?? []) {
    if (entry.opens.type === 'starter') {
      out.push({
        where: `entry ${entry.id}`,
        starter: entry.opens.id,
        values: entry.opens.values ?? {},
      });
    }
  }
  for (const behaviour of data.behaviours ?? []) {
    for (const [starter, values] of Object.entries(behaviour.answers ?? {})) {
      out.push({ where: `behaviour ${behaviour.id}`, starter, values });
    }
    if (behaviour.beside !== undefined) {
      out.push({
        where: `behaviour ${behaviour.id} beside`,
        starter: behaviour.beside.starter,
        values: behaviour.beside.values,
      });
    }
  }
  return out;
}

/** Every string in `value` that looks like a vanilla id (`minecraft:<path>`, not a tag). */
function vanillaIdsIn(value: unknown, out: Set<string>): Set<string> {
  if (typeof value === 'string') {
    if (/^minecraft:[a-z0-9_./-]+$/.test(value)) out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) vanillaIdsIn(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      vanillaIdsIn(key, out);
      vanillaIdsIn(item, out);
    }
  }
  return out;
}

/** The number of lines of `data` as `SearchLimits.lines` counts them. */
function lineCount(data: PluginSearchData): number {
  return (
    (data.vocabulary?.words?.length ?? 0) +
    (data.vocabulary?.colours?.length ?? 0) +
    Object.keys(data.keywords ?? {}).length +
    Object.values(data.questions ?? {}).reduce((sum, hints) => sum + Object.keys(hints).length, 0)
  );
}

describe('the library search data', () => {
  it('passes the plugin API check with the built-in limits, with no problem', () => {
    const { data, problems } = validateSearchContributions(
      SEARCH,
      searchOwnThingsOf(plugin.contributes),
      BUILT_IN_SEARCH_LIMITS,
    );
    expect(problems).toEqual([]);
    expect(data).toEqual(SEARCH);
  });

  it('stays well within the built-in limits', () => {
    expect(lineCount(SEARCH)).toBeLessThan(BUILT_IN_SEARCH_LIMITS.lines / 2);
    expect(SEARCH.behaviours?.length ?? 0).toBeLessThan(BUILT_IN_SEARCH_LIMITS.behaviours / 2);
    expect(SEARCH.entries?.length ?? 0).toBeLessThan(BUILT_IN_SEARCH_LIMITS.entries / 2);
  });

  it('is plain data that survives a JSON round trip', () => {
    expect(JSON.parse(JSON.stringify(SEARCH))).toEqual(SEARCH);
  });

  it('has keywords for every starter and a name hint on every name question', () => {
    expect(Object.keys(SEARCH.keywords ?? {}).sort()).toEqual([...starters.keys()].sort());
    for (const starter of starters.values()) {
      const first = starter.parameters?.find((parameter) => parameter.type === 'string');
      const named = Object.entries(SEARCH.questions?.[starter.id] ?? {}).filter(
        ([, hint]) => hint.role === 'name',
      );
      // A flow has at most one name question; a flow whose first text question is its name says so.
      expect(named.length, starter.id).toBeLessThanOrEqual(1);
      if (first !== undefined && /name|called|title/i.test(first.label)) {
        expect(
          named.map(([id]) => id),
          starter.id,
        ).toEqual([first.id]);
      }
    }
  });

  it('gives each role to a question of the right type, at most once a flow', () => {
    for (const [starter, hints] of Object.entries(SEARCH.questions ?? {})) {
      const roles = new Map<string, number>();
      for (const [question, hint] of Object.entries(hints)) {
        const parameter = parameterOf(starter, question);
        expect(parameter, `${starter}.${question}`).toBeDefined();
        if (hint.role === undefined || parameter === undefined) continue;
        roles.set(hint.role, (roles.get(hint.role) ?? 0) + 1);
        const wanted =
          hint.role === 'name'
            ? ['string']
            : hint.role === 'main-number'
              ? ['number']
              : ['colour', 'choice'];
        expect(wanted, `${starter}.${question} (${hint.role})`).toContain(parameter.type);
      }
      for (const [role, count] of roles) expect(count, `${starter}: ${role}`).toBe(1);
    }
  });

  it('names only real questions and values in appliesWhen and sameAs', () => {
    for (const [starter, hints] of Object.entries(SEARCH.questions ?? {})) {
      for (const [question, hint] of Object.entries(hints)) {
        for (const [other, values] of Object.entries(hint.appliesWhen ?? {})) {
          const parameter = parameterOf(starter, other);
          expect(parameter, `${starter}.${question} appliesWhen ${other}`).toBeDefined();
          for (const value of values) {
            if (parameter !== undefined) {
              expect(
                valueProblem(parameter, value),
                `${starter}.${question} appliesWhen ${other}`,
              ).toBeNull();
            }
          }
        }
        if (hint.sameAs !== undefined) {
          const a = parameterOf(starter, question);
          const b = parameterOf(starter, hint.sameAs);
          expect(b?.type, `${starter}.${question} sameAs`).toBe(a?.type);
        }
        // Pictures and sound files are never answered from words.
        const parameter = parameterOf(starter, question);
        if (parameter?.type === 'image' || parameter?.type === 'audio')
          expect(hint.never).toBe(true);
      }
    }
  });

  it('answers flows only with values that pass the wizard check', () => {
    const found = namedValues(SEARCH);
    expect(found.length).toBeGreaterThan(50);
    for (const { where, starter, values } of found) {
      expect(starters.has(starter), where).toBe(true);
      for (const [question, value] of Object.entries(values)) {
        const parameter = parameterOf(starter, question);
        expect(parameter, `${where}: ${starter}.${question}`).toBeDefined();
        if (parameter !== undefined)
          expect(valueProblem(parameter, value), `${where}: ${starter}.${question}`).toBeNull();
      }
    }
  });

  it('keeps word groups apart: one idea each, no word in two groups', () => {
    const groups: SearchWordGroup[] = SEARCH.vocabulary?.words ?? [];
    const owner = new Map<string, string>();
    const twice: string[] = [];
    for (const group of groups) {
      for (const word of [
        group.idea,
        ...group.same,
        ...(group.slang ?? []),
        ...(group.misspellings ?? []),
      ]) {
        const key = word.toLowerCase();
        const before = owner.get(key);
        if (before !== undefined && before !== group.idea)
          twice.push(`"${word}" in ${before} and ${group.idea}`);
        owner.set(key, group.idea);
      }
    }
    expect(twice).toEqual([]);
    const names = (SEARCH.vocabulary?.colours ?? []).flatMap((colour) =>
      colour.names.map((name) => name.toLowerCase()),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives a phrase to one behaviour of each sort of thing', () => {
    const seen = new Map<string, string>();
    for (const behaviour of SEARCH.behaviours ?? []) {
      for (const subject of behaviour.appliesTo) {
        for (const phrase of behaviour.phrases) {
          const key = `${subject}: ${phrase}`;
          expect(seen.get(key), `${key} (${behaviour.id})`).toBeUndefined();
          seen.set(key, behaviour.id);
        }
      }
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'the library search data on %s',
  (_id, bundle) => {
    let registries: Record<string, string[]>;
    beforeAll(async () => {
      registries = (await readVendoredJson(bundle, 'mcmetaRegistries', (url) =>
        readFile(url),
      )) as Record<string, string[]>;
    });

    it('names only vanilla ids the target has', () => {
      const known = new Set<string>();
      for (const ids of Object.values(registries)) for (const id of ids) known.add(id);
      const missing = [...vanillaIdsIn(SEARCH, new Set())].filter(
        (id) => !known.has(id.slice('minecraft:'.length)),
      );
      expect(missing).toEqual([]);
    });

    it('names in word groups only items, blocks and mobs of the target', () => {
      const things = new Set([
        ...(registries.item ?? []),
        ...(registries.block ?? []),
        ...(registries.entity_type ?? []),
      ]);
      const missing = (SEARCH.vocabulary?.words ?? [])
        .flatMap((group) => group.vanillaIds ?? [])
        .filter((id) => !things.has(id.slice('minecraft:'.length)));
      expect(missing).toEqual([]);
    });

    it('builds every flow it answers, where the flow supports the target', async () => {
      const target = bundle.target;
      for (const { where, starter, values } of namedValues(SEARCH)) {
        const found = starters.get(starter);
        if (found === undefined || (found.supports !== undefined && !found.supports(target)))
          continue;
        const built = await found.build({
          namespace: 'demo',
          projectName: 'Demo Project',
          target,
          values,
        });
        expect(built.elements.length, where).toBeGreaterThan(0);
      }
    });
  },
);
