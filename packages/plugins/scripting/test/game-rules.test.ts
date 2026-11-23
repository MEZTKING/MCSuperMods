/**
 * The `msm:game_rule` and `msm:stat` kinds (ADR 0111 D5, D6; B535): their shape and defaults
 * (valid, lowered and free of error and warning problems on both targets), the lowering goldens
 * under `fixtures/<target id>/expected/{game_rule,stat}/<sample>.json` (`UPDATE_GOLDENS=1`
 * rewrites them), the statistic's scoreboard criterion, the templates, and one test per code of
 * `GAME_RULE_PROBLEM_CODES`, each with cases that must stay quiet.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Element,
  ElementKind,
  ElementTemplate,
  Json,
  Problem,
  ResourceLocation,
  TemplateContext,
} from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  GAME_RULE_PROBLEM_CODES,
  gameRuleDefinition,
  gameRuleDescriptionKey,
  gameRuleKind,
  gameRuleNameKey,
  gameRulePath,
  gameRuleTemplates,
  lowerGameRule,
  lowerStat,
  ScriptingLoweringError,
  statCriterion,
  statDefinition,
  statKind,
  statNameKey,
  statPath,
} from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';
const firstTarget = (builtInTargets[0] as TargetBundle).target;

const rule = (id: ResourceLocation, data: Record<string, unknown>): Element =>
  element('msm:game_rule', id, { format: 1, display_name: 'Rule', ...data } as never);
const stat = (id: ResourceLocation, data: Record<string, unknown> = {}): Element =>
  element('msm:stat', id, { format: 1, display_name: 'Stat', ...data } as never);

interface Sample {
  name: string;
  kind: ElementKind;
  id: ResourceLocation;
  data: Json;
}

const SAMPLES: Sample[] = [
  {
    name: 'default',
    kind: gameRuleKind,
    id: 'demo:my_rule',
    data: gameRuleKind.defaultData as Json,
  },
  {
    name: 'integer',
    kind: gameRuleKind,
    id: 'demo:mobs/max_pets',
    data: {
      kind: 'integer',
      default: 3,
      min: 0,
      max: 10,
      category: 'mobs',
      display_name: 'Most pets',
      description: 'How many pets a player may keep.',
    },
  },
  {
    name: 'no_texts',
    kind: gameRuleKind,
    id: 'demo:quiet',
    data: { format: 1, kind: 'boolean' },
  },
  { name: 'default', kind: statKind, id: 'demo:my_stat', data: statKind.defaultData as Json },
  {
    name: 'time',
    kind: statKind,
    id: 'demo:caves/time_in_caves',
    data: { formatter: 'time', display_name: 'Time in caves' },
  },
  { name: 'no_name', kind: statKind, id: 'demo:plain', data: { format: 1 } },
];

describe('the msm:game_rule and msm:stat kinds', () => {
  it('have their schemas, folders, registries and hidden format', () => {
    expect(
      [gameRuleKind, statKind].map((kind) => [
        kind.id,
        kind.schema,
        kind.folder,
        kind.registry,
        kind.hiddenPaths,
      ]),
    ).toEqual([
      ['msm:game_rule', MSM_SCHEMA_REFS.gameRule, 'game_rule', 'game_rule', ['/format']],
      ['msm:stat', MSM_SCHEMA_REFS.stat, 'stat', 'custom_stat', ['/format']],
    ]);
    expect(plugin.contributes.elementKinds).toContain(gameRuleKind);
    expect(plugin.contributes.elementKinds).toContain(statKind);
  });

  it('lower a game rule to the definition and both language keys', () => {
    const files = lowerGameRule(
      rule('demo:mobs/max_pets', {
        kind: 'integer',
        default: 2,
        min: 0,
        display_name: 'Most pets',
        description: 'How many.',
      }),
      firstTarget,
    );
    expect(files.map((file) => [file.path, file.layer, file.schema, file.merge])).toEqual([
      ['msm/demo/game_rule/mobs/max_pets.json', 'msm', 'msm:game_rule_definition', undefined],
      ['assets/demo/lang/en_us.json', 'resourcepack', '::java::assets::lang::Lang', 'object'],
    ]);
    expect(files[0]?.contents).toEqual({ format: 1, kind: 'integer', default: 2, min: 0 });
    expect(files[1]?.contents).toEqual({
      'gamerule.demo.mobs.max_pets': 'Most pets',
      'gamerule.demo.mobs.max_pets.description': 'How many.',
    });
    expect(gameRulePath('a', 'b/c')).toBe('msm/a/game_rule/b/c.json');
    expect(gameRuleNameKey('a', 'b/c')).toBe('gamerule.a.b.c');
    expect(gameRuleDescriptionKey('a', 'b/c')).toBe('gamerule.a.b.c.description');
    expect(gameRuleDefinition(rule('demo:x', { format: 4, kind: 'boolean' }))).toEqual({
      format: 1,
      kind: 'boolean',
    });
    const onlyDescription = lowerGameRule(
      element('msm:game_rule', 'demo:y', { kind: 'boolean', description: 'Why.' }),
      firstTarget,
    );
    expect(onlyDescription[1]?.contents).toEqual({ 'gamerule.demo.y.description': 'Why.' });
    expect(
      lowerGameRule(element('msm:game_rule', 'demo:z', { kind: 'boolean' }), firstTarget),
    ).toHaveLength(1);
    expect(() => lowerGameRule(element('msm:game_rule', 'demo:z', [1]), firstTarget)).toThrow(
      ScriptingLoweringError,
    );
  });

  it('lower a statistic to the definition and its language key', () => {
    const files = lowerStat(stat('demo:caves/time', { formatter: 'time' }), firstTarget);
    expect(files.map((file) => [file.path, file.layer, file.schema, file.merge])).toEqual([
      ['msm/demo/stat/caves/time.json', 'msm', 'msm:stat_definition', undefined],
      ['assets/demo/lang/en_us.json', 'resourcepack', '::java::assets::lang::Lang', 'object'],
    ]);
    expect(files[0]?.contents).toEqual({ format: 1, formatter: 'time' });
    expect(files[1]?.contents).toEqual({ 'stat.demo.caves.time': 'Stat' });
    expect(statPath('a', 'b/c')).toBe('msm/a/stat/b/c.json');
    expect(statNameKey('a', 'b/c')).toBe('stat.a.b.c');
    expect(statDefinition(stat('demo:x'))).toEqual({ format: 1 });
    expect(lowerStat(element('msm:stat', 'demo:y', {}), firstTarget)).toHaveLength(1);
    expect(() => lowerStat(element('msm:stat', 'demo:y', 'no'), firstTarget)).toThrow(
      ScriptingLoweringError,
    );
  });

  it('name the statistic as a scoreboard criterion from the target facts', () => {
    for (const bundle of builtInTargets) {
      expect(statCriterion('demo:ores_found', bundle.target)).toBe(
        'minecraft.custom:demo.ores_found',
      );
    }
    expect(statCriterion('demo:caves/time')).toBe('minecraft.custom:demo.caves/time');
    expect(
      statCriterion('demo:x', { stats: { ...firstTarget.stats, criterionPrefix: 'p:' } as never }),
    ).toBe('p:demo.x');
    expect(() => statCriterion('Bad')).toThrow(ScriptingLoweringError);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'game rules and statistics on %s',
  (targetId, bundle: TargetBundle) => {
    async function validate(elements: Element[], target = bundle.target): Promise<Problem[]> {
      const { registries } = await indexesFor(bundle);
      const results = await Promise.all(
        (plugin.contributes.validators ?? []).map((validator) =>
          validator.validate({ elements, target, registry: registries }),
        ),
      );
      return results.flat();
    }

    const withCode = (problems: Problem[], code: string) =>
      problems
        .filter((problem) => problem.code === `game-rules.${code}`)
        .map((problem) => [problem.severity, problem.elementId, problem.path ?? null]);

    it.each(SAMPLES.map((sample) => [`${sample.kind.folder}/${sample.name}`, sample] as const))(
      '%s lowers to the golden, valid against the schemas',
      async (label, sample) => {
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, sample.kind.schema, sample.data)).toEqual([]);
        const files = await sample.kind.lower(
          element(sample.kind.id, sample.id, sample.data),
          bundle.target,
        );
        for (const file of files) {
          expect(
            blockingProblems(indexes, file.schema as string, file.contents as Json),
            file.path,
          ).toEqual([]);
        }
        const actual = sortedJson(
          files.map((file) => ({
            contents: file.contents as Json,
            layer: file.layer,
            merge: file.merge ?? null,
            path: file.path,
            schema: file.schema ?? null,
          })),
        );
        const url = new URL(`./fixtures/${targetId}/expected/${label}.json`, import.meta.url);
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );

    it('reports nothing for the defaults and the named samples', async () => {
      const problems = await validate([
        element('msm:game_rule', 'demo:my_rule', gameRuleKind.defaultData as Json),
        element('msm:game_rule', 'demo:mobs/max_pets', (SAMPLES[1] as Sample).data),
        element('msm:stat', 'demo:my_stat', statKind.defaultData as Json),
        element('msm:stat', 'demo:caves/time_in_caves', (SAMPLES[4] as Sample).data),
      ]);
      expect(problems).toEqual([]);
    });

    it('min-above-max and default-out-of-range: integer rules only', async () => {
      const problems = await validate([
        rule('demo:a', { kind: 'integer', min: 5, max: 1, default: 9 }),
        rule('demo:b', { kind: 'integer', min: 0, max: 10, default: 11 }),
        rule('demo:c', { kind: 'integer', min: 2, default: 1 }),
        rule('demo:d', { kind: 'integer', max: 2, default: 3 }),
        rule('demo:e', { kind: 'integer', min: 0, max: 10, default: 10 }),
        rule('demo:f', { kind: 'integer', min: 4, max: 4 }),
        rule('demo:g', { kind: 'integer', default: -50 }),
      ]);
      expect(withCode(problems, 'min-above-max')).toEqual([['error', 'demo:a', '/min']]);
      expect(withCode(problems, 'default-out-of-range')).toEqual([
        ['error', 'demo:b', '/default'],
        ['error', 'demo:c', '/default'],
        ['error', 'demo:d', '/default'],
      ]);
    });

    it('range-on-boolean: min or max on an on or off rule', async () => {
      const problems = await validate([
        rule('demo:a', { kind: 'boolean', min: 0, max: 1 }),
        rule('demo:b', { kind: 'boolean', default: true }),
        rule('demo:c', { kind: 'integer', min: 0 }),
      ]);
      expect(withCode(problems, 'range-on-boolean')).toEqual([
        ['error', 'demo:a', '/min'],
        ['error', 'demo:a', '/max'],
      ]);
    });

    it('vanilla-clash and vanilla-name: vanilla names from the facts, skipped without them', async () => {
      const elements = [
        rule('minecraft:keep_inventory', { kind: 'boolean' }),
        rule('demo:keep_inventory', { kind: 'boolean' }),
        rule('demo:own_rule', { kind: 'boolean' }),
        stat('minecraft:jump'),
        stat('demo:jump'),
        stat('demo:own_stat'),
      ];
      const problems = await validate(elements);
      expect(withCode(problems, 'vanilla-clash')).toEqual([
        ['error', 'minecraft:keep_inventory', null],
        ['error', 'minecraft:jump', null],
      ]);
      expect(withCode(problems, 'vanilla-name')).toEqual([
        ['info', 'demo:keep_inventory', null],
        ['info', 'demo:jump', null],
      ]);
      const { gameRules: _rules, stats: _stats, ...bare } = bundle.target;
      const without = await validate(elements, bare as typeof bundle.target);
      expect(withCode(without, 'vanilla-clash')).toEqual([]);
      expect(withCode(without, 'vanilla-name')).toEqual([]);
    });

    it('no-name: a game rule or statistic without a display name', async () => {
      const problems = await validate([
        element('msm:game_rule', 'demo:a', { format: 1, kind: 'boolean' }),
        element('msm:game_rule', 'demo:b', { format: 1, kind: 'boolean', display_name: '' }),
        element('msm:stat', 'demo:c', { format: 1 }),
        rule('demo:d', { kind: 'boolean' }),
        stat('demo:e'),
      ]);
      expect(withCode(problems, 'no-name')).toEqual([
        ['info', 'demo:a', '/display_name'],
        ['info', 'demo:b', '/display_name'],
        ['info', 'demo:c', '/display_name'],
      ]);
    });

    it('reports only listed codes', async () => {
      const problems = await validate([
        element('msm:game_rule', 'minecraft:keep_inventory', {
          kind: 'integer',
          min: 3,
          max: 1,
        }),
        element('msm:stat', 'minecraft:jump', {}),
      ]);
      expect(problems.length).toBeGreaterThan(0);
      for (const problem of problems) {
        expect(GAME_RULE_PROBLEM_CODES as readonly string[]).toContain(problem.code);
      }
    });

    it.each(gameRuleTemplates.map((template) => [template.id, template] as const))(
      'template %s validates, passes the validators and lowers',
      async (_id, template: ElementTemplate) => {
        // A template context is plain data: the target's facts without its hooks.
        const {
          javaProject: _javaProject,
          loadJavaProject: _loadJavaProject,
          migrateFrom: _migrateFrom,
          ...facts
        } = bundle.target;
        const kind = template.kind === gameRuleKind.id ? gameRuleKind : statKind;
        const id = `demo:${template.defaultName}` as ResourceLocation;
        const context: TemplateContext = {
          id,
          namespace: 'demo',
          path: template.defaultName as string,
          projectNamespace: 'demo',
          namespaces: ['demo'],
          kindDefault: structuredClone(kind.defaultData),
          target: facts,
        };
        const before = structuredClone(context);
        const data = await template.data(context);
        expect(await template.data(context)).toEqual(data);
        expect(context).toEqual(before);
        expect(template.title).not.toBe('');
        expect(template.description).not.toBe('');
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, kind.schema, data)).toEqual([]);
        const created = element(kind.id, id, data);
        expect(await validate([created])).toEqual([]);
        const files = await kind.lower(created, bundle.target);
        expect(files.map((file) => file.path)).toEqual([
          `msm/demo/${kind.folder}/${template.defaultName}.json`,
          'assets/demo/lang/en_us.json',
        ]);
      },
    );
  },
);

describe('game rule and statistic templates', () => {
  it('have their ids, kinds and categories in picker order', () => {
    expect(
      gameRuleTemplates.map((template) => [template.id, template.kind, template.category]),
    ).toEqual([
      ['msm_game_rule_switch', 'msm:game_rule', 'Game rules'],
      ['msm_game_rule_number', 'msm:game_rule', 'Game rules'],
      ['msm_stat_counter', 'msm:stat', 'Statistics'],
      ['msm_stat_time', 'msm:stat', 'Statistics'],
    ]);
  });
});
