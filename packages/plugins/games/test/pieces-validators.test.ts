/**
 * The game pieces' validator (B552) on every built-in target: one test per code of
 * `PIECES_PROBLEM_CODES` with cases that must stay quiet, the samples and templates free of
 * problems, and the templates valid against their schemas and lowered cleanly.
 */
import type { Element, Json, Problem } from '@msm/plugin-api';
import { createRegistryIndex, validateJson } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  MAX_ONE_BLOCKS,
  PIECES_PROBLEM_CODES,
  piecesTemplates,
  piecesValidator,
} from '../src/index';
import { PIECE_KINDS, SAMPLE_PROJECT_IDS, SAMPLES } from './pieces-samples';
import { element, toolsFor } from './pieces-support';

const ONE_BLOCK = (at: number[], phase: Record<string, Json> = {}): Json => ({
  at,
  phases: [
    {
      name: 'P',
      breaks: 10,
      blocks: [{ block: 'minecraft:dirt', weight: 1 }],
      mob_chance: 0,
      chest_chance: 0,
      ...phase,
    },
  ],
  loop: true,
  announce: false,
});

const AREA = (from: number[], to: number[], reset?: Json): Json => ({
  name: 'A',
  dimension: 'minecraft:overworld',
  from,
  to,
  ...(reset === undefined ? {} : { reset }),
});

const TEMPLATE = (size: number[]): Json => ({ size, palette: ['minecraft:stone'], blocks: [] });

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'game pieces validator on %s',
  (_targetId, bundle: TargetBundle) => {
    async function validate(elements: Element[], target = bundle.target): Promise<Problem[]> {
      const { vanilla } = await toolsFor(bundle);
      const project: Record<string, string[]> = {
        structure: [...(SAMPLE_PROJECT_IDS.structure ?? [])],
      };
      for (const entry of elements) {
        if (entry.kind === 'minecraft:structure_template') project.structure?.push(entry.id);
      }
      const registry = createRegistryIndex({ vanilla, project });
      return piecesValidator.validate({ elements, target, registry }) as Problem[];
    }
    const codes = async (elements: Element[], target = bundle.target): Promise<string[]> =>
      (await validate(elements, target)).map((problem) => problem.code);

    it('is registered and reports only its own codes', () => {
      expect(plugin.contributes.validators).toContain(piecesValidator);
      expect(PIECES_PROBLEM_CODES.every((code) => code.startsWith('games.'))).toBe(true);
    });

    it('finds nothing in the samples and the templates, each alone and the rest together', async () => {
      const elements = [
        ...SAMPLES.map((sample) => element(sample.kind, sample.id, sample.data)),
        ...piecesTemplates.map((template, index) =>
          element(template.kind, `demo:template_${index}`, template.data({} as never) as Json),
        ),
      ];
      // Each alone: the samples put several one blocks at 0 64 0.
      for (const entry of elements) expect(await validate([entry]), entry.id).toEqual([]);
      const others = elements.filter((entry) => entry.kind !== 'msm:one_block');
      expect(await validate(others)).toEqual([]);
    });

    it('games.too-many-one-blocks: a fifth one block', async () => {
      const blocks = Array.from({ length: MAX_ONE_BLOCKS + 1 }, (_, i) =>
        element('msm:one_block', `demo:b${i}`, ONE_BLOCK([i, 64, 0])),
      );
      expect(await codes(blocks.slice(0, MAX_ONE_BLOCKS))).toEqual([]);
      const problems = await validate(blocks);
      expect(problems.map((problem) => [problem.code, problem.elementId])).toEqual([
        ['games.too-many-one-blocks', 'demo:b4'],
      ]);
    });

    it('games.one-block-same-place: two at one place', async () => {
      expect(
        await codes([
          element('msm:one_block', 'demo:a', ONE_BLOCK([0, 64, 0])),
          element('msm:one_block', 'demo:b', ONE_BLOCK([0, 64, 0])),
        ]),
      ).toEqual(['games.one-block-same-place']);
      const nether = { ...(ONE_BLOCK([0, 64, 0]) as object), dimension: 'minecraft:the_nether' };
      expect(
        await codes([
          element('msm:one_block', 'demo:a', ONE_BLOCK([0, 64, 0])),
          element('msm:one_block', 'demo:b', nether),
        ]),
      ).toEqual([]);
    });

    it('games.one-block-weight: a weight of zero or a fraction', async () => {
      const zero = ONE_BLOCK([0, 64, 0], { blocks: [{ block: 'minecraft:dirt', weight: 0 }] });
      const half = ONE_BLOCK([1, 64, 0], {
        mobs: [{ mob: 'minecraft:cow', weight: 1.5 }],
        mob_chance: 0.1,
      });
      const problems = await validate([
        element('msm:one_block', 'demo:a', zero),
        element('msm:one_block', 'demo:b', half),
      ]);
      expect(problems.map((problem) => [problem.code, problem.path])).toEqual([
        ['games.one-block-weight', '/phases/0/blocks/0/weight'],
        ['games.one-block-weight', '/phases/0/mobs/0/weight'],
      ]);
    });

    it('games.one-block-chest-without-loot and -mob-chance-without-mobs', async () => {
      expect(
        await codes([
          element('msm:one_block', 'demo:a', ONE_BLOCK([0, 64, 0], { chest_chance: 0.1 })),
          element('msm:one_block', 'demo:b', ONE_BLOCK([1, 64, 0], { mob_chance: 0.1 })),
        ]),
      ).toEqual(['games.one-block-chest-without-loot', 'games.one-block-mob-chance-without-mobs']);
    });

    it('games.area-box-order: from above to', async () => {
      const problems = await validate([
        element('msm:area', 'demo:a', AREA([0, 70, 0], [10, 60, 10])),
        element('msm:area', 'demo:b', AREA([0, 60, 0], [0, 60, 0])),
      ]);
      expect(problems.map((problem) => [problem.code, problem.path])).toEqual([
        ['games.area-box-order', '/from/1'],
      ]);
    });

    it('games.area-structure-missing and -outside', async () => {
      const reset = (structure: string, at: number[]): Json => ({
        structures: [{ structure, at }],
      });
      const template = element('minecraft:structure_template', 'demo:room', TEMPLATE([4, 4, 4]));
      expect(
        await codes([
          template,
          element(
            'msm:area',
            'demo:fits',
            AREA([0, 60, 0], [9, 69, 9], reset('demo:room', [6, 60, 6])),
          ),
          element(
            'msm:area',
            'demo:vanilla',
            AREA([0, 60, 0], [9, 69, 9], reset('minecraft:igloo/top', [0, 60, 0])),
          ),
        ]),
      ).toEqual([]);
      const problems = await validate([
        template,
        element(
          'msm:area',
          'demo:gone',
          AREA([0, 60, 0], [9, 69, 9], reset('demo:nothing', [0, 60, 0])),
        ),
        element(
          'msm:area',
          'demo:out',
          AREA([0, 60, 0], [9, 69, 9], reset('demo:room', [7, 60, 0])),
        ),
      ]);
      expect(
        problems.map((problem) => [problem.code, problem.elementId, problem.severity]),
      ).toEqual([
        ['games.area-structure-missing', 'demo:gone', 'error'],
        ['games.area-structure-outside', 'demo:out', 'warning'],
      ]);
    });

    it('games.timer-seconds: outside 1 to 86,400 or not whole', async () => {
      const timer = (seconds: number): Json => ({
        seconds,
        count: 'down',
        show: 'none',
        colour: 'white',
        repeat: false,
        starts: 'manual',
      });
      expect(
        await codes([
          element('msm:timer', 'demo:a', timer(1)),
          element('msm:timer', 'demo:b', timer(86_400)),
        ]),
      ).toEqual([]);
      expect(
        await codes([
          element('msm:timer', 'demo:a', timer(0)),
          element('msm:timer', 'demo:b', timer(86_401)),
          element('msm:timer', 'demo:c', timer(2.5)),
        ]),
      ).toEqual(['games.timer-seconds', 'games.timer-seconds', 'games.timer-seconds']);
    });

    it('games.objective-criterion, -display: from the scoreboard facts', async () => {
      const objective = (criterion: string, display = 'sidebar', render = 'integer'): Json => ({
        criterion,
        name: 'S',
        display,
        render,
      });
      expect(
        await codes([
          element('msm:objective', 'demo:a', objective('dummy')),
          element('msm:objective', 'demo:b', objective('minecraft.killed:minecraft.zombie')),
          element('msm:objective', 'demo:c', objective('minecraft.custom:demo.caves/time')),
          element('msm:objective', 'demo:d', objective('health', 'sidebar.team.gold', 'hearts')),
        ]),
      ).toEqual([]);
      const problems = await validate([
        element('msm:objective', 'demo:a', objective('nonsense')),
        element('msm:objective', 'demo:b', objective('minecraft.walked:minecraft.stone')),
        element('msm:objective', 'demo:c', objective('dummy', 'sidebar.team.pink', 'stars')),
      ]);
      expect(problems.map((problem) => [problem.code, problem.path, problem.severity])).toEqual([
        ['games.objective-criterion', '/criterion', 'warning'],
        ['games.objective-criterion', '/criterion', 'warning'],
        ['games.objective-display', '/display', 'error'],
        ['games.objective-display', '/render', 'error'],
      ]);
      const { scoreboard: _scoreboard, ...noFacts } = bundle.target;
      expect(
        await codes([element('msm:objective', 'demo:a', objective('nonsense'))], noFacts as never),
      ).toEqual([]);
    });

    it('games.team-option: values from the scoreboard facts', async () => {
      const team = (colour: string, name_tags = 'always', collision = 'never'): Json => ({
        name: 'T',
        colour,
        friendly_fire: true,
        see_invisible_friends: true,
        name_tags,
        collision,
      });
      expect(
        await codes([
          element('msm:team', 'demo:a', team('dark_aqua', 'hideForOwnTeam', 'pushOwnTeam')),
          element('msm:team', 'demo:b', team('reset')),
        ]),
      ).toEqual([]);
      const problems = await validate([
        element('msm:team', 'demo:a', team('pink', 'sometimes', 'push')),
      ]);
      expect(problems.map((problem) => problem.path)).toEqual([
        '/colour',
        '/name_tags',
        '/collision',
      ]);
    });

    it('games.name-clash: two teams or objectives with one generated name', async () => {
      const team = {
        name: 'T',
        colour: 'red',
        friendly_fire: true,
        see_invisible_friends: true,
        name_tags: 'always',
        collision: 'always',
      };
      const objective = { criterion: 'dummy', name: 'S', display: 'none', render: 'integer' };
      expect(
        await codes([
          element('msm:team', 'demo:a/b', team),
          element('msm:team', 'demo:a.b', team),
          element('msm:objective', 'demo:a/b', objective),
          element('msm:objective', 'other:a/b', objective),
        ]),
      ).toEqual(['games.name-clash']);
    });

    it('games.reserved-name: the generated objectives', async () => {
      const objective = { criterion: 'dummy', name: 'S', display: 'none', render: 'integer' };
      expect(
        await codes([
          element('msm:objective', 'demo:msm_timers', objective),
          element('msm:objective', 'demo:timers', objective),
        ]),
      ).toEqual(['games.reserved-name']);
    });
  },
);

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'game piece templates on %s',
  (_targetId, bundle: TargetBundle) => {
    it('are registered under Games with unique ids', () => {
      expect(plugin.contributes.elementTemplates).toEqual(
        expect.arrayContaining([...piecesTemplates]),
      );
      expect(new Set(piecesTemplates.map((template) => template.id)).size).toBe(
        piecesTemplates.length,
      );
      expect(piecesTemplates.every((template) => template.category === 'Games')).toBe(true);
    });

    it.each(piecesTemplates.map((template) => [template.id, template] as const))(
      '%s validates and lowers',
      async (_id, template) => {
        const tools = await toolsFor(bundle);
        const kind = PIECE_KINDS[template.kind];
        if (kind === undefined) throw new Error(`no kind ${template.kind}`);
        const data = (await template.data({} as never)) as Json;
        const problems = validateJson(data, tools.schemas.resolveSchemaRef(kind.schema), {
          registries: tools.registries,
        }).filter(
          (problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id',
        );
        expect(problems).toEqual([]);
        const files = await kind.lower(element(kind.id, 'demo:sample', data), bundle.target);
        expect(files.length).toBeGreaterThan(0);
      },
    );
  },
);
