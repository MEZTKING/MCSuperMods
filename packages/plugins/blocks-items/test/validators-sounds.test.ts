/**
 * The sound, set type and vanilla block rule validators (ADR 0105 D1, D2, D4; B515): one test per
 * code of `SOUND_PROBLEM_CODES`, each with cases that must stay quiet, on both built-in targets
 * (the sound set checks only where the target's sounds are data).
 */
import type { Element, Problem } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { SOUND_PROBLEM_CODES, soundValidators } from '../src/index';
import { element, indexesFor, PROJECT_IDS } from './support';

type Id = `${string}:${string}`;

const block = (id: Id, data: Record<string, unknown>): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/stone', ...data } as never);
const rules = (id: Id, data: Record<string, unknown>): Element =>
  element('msm:vanilla_block_rules', id, { format: 1, ...data } as never);
const sounds = (id: Id, keys: string[]): Element =>
  element(
    'minecraft:sounds',
    id,
    Object.fromEntries(
      keys.map((key) => [key, { sounds: [`${id.split(':')[0]}:${key}`] }]),
    ) as never,
  );

describe('sound validator codes', () => {
  it('lists nine codes and one validator', () => {
    expect(SOUND_PROBLEM_CODES).toHaveLength(9);
    expect(new Set(SOUND_PROBLEM_CODES).size).toBe(9);
    expect(soundValidators.map((validator) => validator.id)).toEqual(['msm.blocks-items.sounds']);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sound validators on %s',
  (_targetId, bundle: TargetBundle) => {
    const dataSounds = bundle.target.blocks?.soundModel === 'block_sound_set';

    async function validate(elements: Element[]): Promise<Problem[]> {
      const { vanilla } = await indexesFor(bundle);
      const registry = createRegistryIndex({
        vanilla: { ...vanilla, weighed_sound_event: vanilla.sound_event ?? [] },
        project: PROJECT_IDS,
      });
      const results = await Promise.all(
        (plugin.contributes.validators ?? []).map((validator) =>
          validator.validate({ elements, target: bundle.target, registry }),
        ),
      );
      return results.flat();
    }

    const withCode = (problems: Problem[], code: string) =>
      problems
        .filter((problem) => problem.code === `blocks-items.${code}`)
        .map((problem) => [problem.elementId, problem.path, problem.severity]);

    const everySound = {
      break: 'demo:chime.break',
      step: 'minecraft:block.wool.step',
      place: 'minecraft:block.wool.place',
      hit: 'minecraft:block.wool.hit',
      fall: 'minecraft:block.wool.fall',
    };

    it('reports nothing for full own sounds and an own door set type', async () => {
      const problems = await validate([
        sounds('demo:sounds', ['chime.break', 'chime.open']),
        block('demo:chime', { sound_type: 'amethyst', block_sounds: everySound }),
        block('demo:door', {
          type: 'door',
          model: undefined,
          textures: { top: 'demo:block/door_top', bottom: 'demo:block/door_bottom' },
          set_type: { sounds: { open: 'demo:chime.open' }, can_open_by_hand: false },
        }),
        rules('demo:rules', {
          strip: [{ block: 'minecraft:mossy_cobblestone', into: 'minecraft:cobblestone' }],
        }),
      ]);
      expect(problems.filter((problem) => SOUND_PROBLEM_CODES.includes(problem.code))).toEqual([]);
    });

    it('block-sound-unknown: own sounds and set type sounds that exist nowhere', async () => {
      const problems = await validate([
        sounds('demo:sounds', ['chime.break']),
        block('demo:chime', {
          block_sounds: { ...everySound, step: 'demo:missing.step', place: 'block.stone.place' },
        }),
        block('demo:button', {
          type: 'button',
          model: undefined,
          textures: { all: 'demo:block/button' },
          set_type: {
            sounds: {
              press: 'demo:missing.press',
              release: 'minecraft:block.stone_button.click_off',
            },
          },
        }),
      ]);
      expect(withCode(problems, 'block-sound-unknown')).toEqual([
        ['demo:chime', '/block_sounds/step', 'warning'],
        ['demo:button', '/set_type/sounds/press', 'warning'],
      ]);
    });

    it('block-sounds-partial: events left out are silent where sounds are data', async () => {
      const problems = await validate([
        block('demo:partial', { block_sounds: { step: 'minecraft:block.wool.step' } }),
        block('demo:full', { block_sounds: everySound }),
        block('demo:none', {}),
      ]);
      expect(withCode(problems, 'block-sounds-partial')).toEqual(
        dataSounds ? [['demo:partial', '/block_sounds', 'warning']] : [],
      );
      const message = problems.find(
        (problem) => problem.code === 'blocks-items.block-sounds-partial',
      );
      if (dataSounds)
        expect(message?.message).toContain('"break", "place", "hit", "fall" are silent');
    });

    it('block-sounds-range: pitch above 2 or volume 0 where sounds are data', async () => {
      const problems = await validate([
        block('demo:high', { block_sounds: { ...everySound, pitch: 3 } }),
        block('demo:mute', { block_sounds: { ...everySound, volume: 0 } }),
        block('demo:ok', { block_sounds: { ...everySound, pitch: 2, volume: 0.5 } }),
      ]);
      expect(withCode(problems, 'block-sounds-range')).toEqual(
        dataSounds
          ? [
              ['demo:high', '/block_sounds/pitch', 'warning'],
              ['demo:mute', '/block_sounds/volume', 'warning'],
            ]
          : [],
      );
    });

    it("sound-type-unknown: names outside the format's list and the target's own", async () => {
      const own = bundle.target.blocks?.soundTypes ?? [];
      const onlyHere = own.find(
        (name) => name === 'twisting_vines' || name === 'chiseled_soulshale',
      );
      const problems = await validate([
        block('demo:amethyst', { sound_type: 'amethyst' }),
        block('demo:made_up', { sound_type: 'made_up_sound' }),
        ...(onlyHere === undefined ? [] : [block('demo:own', { sound_type: onlyHere })]),
      ]);
      expect(withCode(problems, 'sound-type-unknown')).toEqual([
        ['demo:made_up', '/sound_type', 'error'],
      ]);
    });

    it('set-type-field-unused: settings the type never uses', async () => {
      const textures = { all: 'demo:block/x' };
      const problems = await validate([
        block('demo:button', {
          type: 'button',
          model: undefined,
          textures,
          set_type: {
            sounds: { open: 'minecraft:block.wooden_door.open' },
            arrows_press: false,
            plate_sensitivity: 'mobs',
          },
        }),
        block('demo:plate', {
          type: 'pressure_plate',
          model: undefined,
          textures,
          set_type: {
            sounds: { press: 'minecraft:block.stone_pressure_plate.click_on' },
            plate_sensitivity: 'mobs',
          },
        }),
      ]);
      expect(withCode(problems, 'set-type-field-unused')).toEqual([
        ['demo:button', '/set_type/plate_sensitivity', 'info'],
        ['demo:button', '/set_type/sounds/open', 'info'],
      ]);
    });

    it('vanilla-pair-override: rules for blocks vanilla already pairs', async () => {
      const pairs = bundle.target.blocks?.vanillaPairs;
      expect(pairs).toBeDefined();
      const problems = await validate([
        rules('demo:rules', {
          strip: [
            { block: 'minecraft:oak_log', into: 'minecraft:stripped_birch_log' },
            { block: 'minecraft:mossy_cobblestone', into: 'minecraft:cobblestone' },
          ],
          flatten: [{ block: 'minecraft:dirt', into: 'minecraft:coarse_dirt' }],
          till: [{ block: 'minecraft:mud', into: 'minecraft:farmland' }],
          wax: [{ block: 'minecraft:copper_block', into: 'minecraft:waxed_copper_block' }],
          age: [{ block: 'minecraft:exposed_copper', next: 'minecraft:oxidized_copper' }],
          burn: [{ block: 'minecraft:oak_planks', burn_odds: 5, ignite_odds: 20 }],
        }),
      ]);
      expect(withCode(problems, 'vanilla-pair-override')).toEqual([
        ['demo:rules', '/strip/0/block', 'warning'],
        ['demo:rules', '/flatten/0/block', 'warning'],
        ['demo:rules', '/wax/0/block', 'warning'],
        ['demo:rules', '/age/0/block', 'warning'],
      ]);
    });

    it('vanilla-rule-duplicate: the same block twice for one rule, across files', async () => {
      const pair = { block: 'minecraft:mossy_cobblestone', into: 'minecraft:cobblestone' };
      const problems = await validate([
        rules('demo:b', { strip: [pair] }),
        rules('demo:a', {
          strip: [pair, pair],
          flatten: [{ ...pair, into: 'minecraft:dirt_path' }],
        }),
      ]);
      expect(withCode(problems, 'vanilla-rule-duplicate')).toEqual([
        ['demo:a', '/strip/1/block', 'warning'],
        ['demo:b', '/strip/0/block', 'warning'],
      ]);
    });

    it('vanilla-rule-same-block: a block that turns into itself', async () => {
      const problems = await validate([
        rules('demo:rules', {
          strip: [{ block: 'stone', into: 'minecraft:stone' }],
          age: [{ block: 'minecraft:stone_bricks', next: 'minecraft:cracked_stone_bricks' }],
        }),
      ]);
      expect(withCode(problems, 'vanilla-rule-same-block')).toEqual([
        ['demo:rules', '/strip/0/into', 'warning'],
      ]);
    });

    it('vanilla-rule-project-block: a project block has its own components', async () => {
      const problems = await validate([
        block('demo:log', {}),
        rules('demo:rules', {
          strip: [{ block: 'demo:log', into: 'minecraft:stripped_oak_log' }],
          burn: [{ block: 'demo:log', burn_odds: 5, ignite_odds: 5 }],
        }),
      ]);
      expect(withCode(problems, 'vanilla-rule-project-block')).toEqual([
        ['demo:rules', '/strip/0/block', 'info'],
        ['demo:rules', '/burn/0/block', 'info'],
      ]);
    });
  },
);
