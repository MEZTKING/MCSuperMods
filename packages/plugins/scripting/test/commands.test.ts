/**
 * The `msm:command` kind (ADR 0096 D1; B456): its shape, its default (valid, lowered and free of
 * validator problems on both targets), the lowering goldens under
 * `fixtures/<target id>/expected/command/<sample>.json` (`UPDATE_GOLDENS=1` rewrites them), and
 * one test per code of `COMMAND_PROBLEM_CODES`, each with cases that must stay quiet.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, Json, Problem, ResourceLocation } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  COMMAND_PROBLEM_CODES,
  commandDefinition,
  commandFeedbackKey,
  commandKind,
  commandPath,
  lowerCommand,
  ScriptingLoweringError,
} from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

const command = (id: ResourceLocation, data: Record<string, unknown>): Element =>
  element('msm:command', id, { format: 1, ...data } as never);
const script = (id: ResourceLocation, lines: string[]): Element =>
  element('msm:script', id, { lines });

const GREET = { greet: { actions: [{ type: 'play_sound', sound: 'minecraft:ui.button.click' }] } };
/** A valid command that runs an event, with `extra` merged in. */
const eventCommand = (id: ResourceLocation, name: string, extra: Record<string, unknown> = {}) =>
  command(id, { name, event: 'greet', events: GREET, ...extra });

interface Sample {
  name: string;
  id: ResourceLocation;
  data: Json;
}

const SAMPLES: Sample[] = [
  { name: 'default', id: 'demo:hello', data: commandKind.defaultData as Json },
  {
    name: 'every_argument',
    id: 'demo:admin/tools',
    data: {
      name: 'mytools',
      aliases: ['mt'],
      permission: 2,
      arguments: [
        { name: 'count', type: 'integer', min: 1, max: 64 },
        { name: 'speed', type: 'number', min: 0, max: 2.5 },
        { name: 'mode', type: 'word' },
        { name: 'loud', type: 'boolean' },
        { name: 'who', type: 'player' },
        { name: 'crowd', type: 'players' },
        { name: 'thing', type: 'entity', optional: true },
        { name: 'message', type: 'text', optional: true },
      ],
      function: 'demo:admin/tools',
      feedback: 'demo.tools.done',
      feedback_text: 'Tools handed out.',
    },
  },
  {
    name: 'places_and_things',
    id: 'demo:build',
    data: {
      name: 'build',
      arguments: [
        { name: 'at', type: 'position' },
        { name: 'corner', type: 'block_position' },
        { name: 'with', type: 'block' },
        { name: 'reward', type: 'item', optional: true },
      ],
      event: 'built',
      events: {
        built: { actions: [{ type: 'set_block_state', state: 'minecraft:stone' }] },
      },
    },
  },
];

describe('the msm:command kind', () => {
  it('has its schema, folder, hidden format and no registry', () => {
    expect([
      commandKind.id,
      commandKind.schema,
      commandKind.folder,
      commandKind.registry,
      commandKind.hiddenPaths,
    ]).toEqual(['msm:command', MSM_SCHEMA_REFS.command, 'command', undefined, ['/format']]);
    expect(plugin.contributes.elementKinds).toContain(commandKind);
  });

  it('lowers to the definition and the default feedback key', () => {
    const target = (builtInTargets[0] as TargetBundle).target;
    const files = lowerCommand(
      command('demo:admin/heal', { name: 'heal', function: 'demo:heal', feedback_text: 'Healed' }),
      target,
    );
    expect(files.map((file) => [file.path, file.layer, file.schema, file.merge])).toEqual([
      ['msm/demo/command/admin/heal.json', 'msm', 'msm:command_definition', undefined],
      ['assets/demo/lang/en_us.json', 'resourcepack', '::java::assets::lang::Lang', 'object'],
    ]);
    expect(files[0]?.contents).toEqual({
      format: 1,
      name: 'heal',
      function: 'demo:heal',
      feedback: 'command.demo.admin.heal.feedback',
    });
    expect(files[1]?.contents).toEqual({ 'command.demo.admin.heal.feedback': 'Healed' });
    expect(commandPath('a', 'b/c')).toBe('msm/a/command/b/c.json');
    expect(commandFeedbackKey('a', 'b/c')).toBe('command.a.b.c.feedback');
  });

  it('keeps an own feedback key, writes no lang without text and rejects bad data', () => {
    const target = (builtInTargets[0] as TargetBundle).target;
    const own = lowerCommand(
      command('demo:x', { name: 'x', event: 'e', feedback: 'demo.x', feedback_text: 'X' }),
      target,
    );
    expect(own[1]?.contents).toEqual({ 'demo.x': 'X' });
    const plain = command('demo:y', { format: 7, name: 'y', feedback: 'demo.y' });
    expect(lowerCommand(plain, target)).toHaveLength(1);
    expect(commandDefinition(plain)).toEqual({ format: 1, name: 'y', feedback: 'demo.y' });
    expect(() => lowerCommand(element('msm:command', 'demo:z', [1]), target)).toThrow(
      ScriptingLoweringError,
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'commands on %s',
  (targetId, bundle: TargetBundle) => {
    async function validate(elements: Element[]): Promise<Problem[]> {
      const { registries } = await indexesFor(bundle);
      const results = await Promise.all(
        (plugin.contributes.validators ?? []).map((validator) =>
          validator.validate({ elements, target: bundle.target, registry: registries }),
        ),
      );
      return results.flat();
    }

    const withCode = (problems: Problem[], code: string) =>
      problems
        .filter((problem) => problem.code === `commands.${code}`)
        .map((problem) => [problem.severity, problem.elementId, problem.path]);

    it.each(SAMPLES.map((sample) => [sample.name, sample] as const))(
      '%s lowers to the golden, valid against the schemas',
      async (name, sample) => {
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, commandKind.schema, sample.data)).toEqual([]);
        const files = await commandKind.lower(
          element('msm:command', sample.id, sample.data),
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
        const url = new URL(
          `./fixtures/${targetId}/expected/command/${name}.json`,
          import.meta.url,
        );
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );

    it('reports nothing for the samples and the default together', async () => {
      const problems = await validate([
        element('msm:command', 'demo:hello', commandKind.defaultData as Json),
        element('msm:command', 'demo:build', (SAMPLES[2] as Sample).data),
      ]);
      expect(problems).toEqual([]);
    });

    it('bad-name: names, aliases and argument names outside [a-z0-9_], repeated arguments', async () => {
      const problems = await validate([
        eventCommand('demo:a', 'Shout', {
          aliases: ['ok_1', 'no-dash'],
          arguments: [
            { name: 'Amount', type: 'integer' },
            { name: 'x', type: 'word' },
            { name: 'x', type: 'word' },
          ],
        }),
        eventCommand('demo:b', 'fine_2', { arguments: [{ name: 'a1', type: 'boolean' }] }),
      ]);
      expect(withCode(problems, 'bad-name')).toEqual([
        ['error', 'demo:a', '/name'],
        ['error', 'demo:a', '/aliases/1'],
        ['error', 'demo:a', '/arguments/0/name'],
        ['error', 'demo:a', '/arguments/2/name'],
      ]);
    });

    it('name-clash: vanilla names, other project commands and repeats, for names and aliases', async () => {
      const problems = await validate([
        eventCommand('demo:a', 'give'),
        eventCommand('demo:b', 'home', { aliases: ['tp', 'h', 'h'] }),
        eventCommand('demo:c', 'base', { aliases: ['home'] }),
        eventCommand('demo:d', 'quiet', { aliases: ['q'] }),
      ]);
      expect(withCode(problems, 'name-clash')).toEqual([
        ['error', 'demo:a', '/name'],
        ['error', 'demo:b', '/aliases/0'],
        ['error', 'demo:b', '/aliases/2'],
        ['error', 'demo:b', '/name'],
        ['error', 'demo:c', '/aliases/0'],
      ]);
    });

    it('name-clash: skips the vanilla names when the target has no command facts', async () => {
      const { registries } = await indexesFor(bundle);
      const { commands: _facts, ...target } = bundle.target;
      const problems = (
        await Promise.all(
          (plugin.contributes.validators ?? []).map((validator) =>
            validator.validate({
              elements: [eventCommand('demo:a', 'give')],
              target,
              registry: registries,
            }),
          ),
        )
      ).flat();
      expect(withCode(problems, 'name-clash')).toEqual([]);
    });

    it('optional-not-last: a needed argument after an optional one', async () => {
      const problems = await validate([
        eventCommand('demo:a', 'one', {
          arguments: [
            { name: 'a', type: 'word', optional: true },
            { name: 'b', type: 'word' },
          ],
        }),
        eventCommand('demo:b', 'two', {
          arguments: [
            { name: 'a', type: 'word' },
            { name: 'b', type: 'word', optional: true },
            { name: 'c', type: 'word', optional: true },
          ],
        }),
      ]);
      expect(withCode(problems, 'optional-not-last')).toEqual([
        ['error', 'demo:a', '/arguments/1'],
      ]);
    });

    it('text-not-last: a text argument before another one', async () => {
      const problems = await validate([
        eventCommand('demo:a', 'one', {
          arguments: [
            { name: 'a', type: 'text' },
            { name: 'b', type: 'word' },
          ],
        }),
        eventCommand('demo:b', 'two', {
          arguments: [
            { name: 'a', type: 'word' },
            { name: 'b', type: 'text' },
          ],
        }),
      ]);
      expect(withCode(problems, 'text-not-last')).toEqual([
        ['error', 'demo:a', '/arguments/0/type'],
      ]);
    });

    it('range-not-number: min or max on a type that is not a number', async () => {
      const problems = await validate([
        eventCommand('demo:a', 'one', {
          arguments: [
            { name: 'a', type: 'word', min: 1, max: 2 },
            { name: 'b', type: 'integer', min: 1, max: 2 },
            { name: 'c', type: 'number', min: 0 },
          ],
        }),
      ]);
      expect(withCode(problems, 'range-not-number')).toEqual([
        ['error', 'demo:a', '/arguments/0/min'],
        ['error', 'demo:a', '/arguments/0/max'],
      ]);
    });

    it('min-above-max: a lowest value above the highest', async () => {
      const problems = await validate([
        eventCommand('demo:a', 'one', {
          arguments: [
            { name: 'a', type: 'integer', min: 5, max: 2 },
            { name: 'b', type: 'number', min: 2, max: 2 },
          ],
        }),
      ]);
      expect(withCode(problems, 'min-above-max')).toEqual([
        ['error', 'demo:a', '/arguments/0/min'],
      ]);
    });

    it('function-and-event: both set', async () => {
      const problems = await validate([
        eventCommand('demo:a', 'one', { function: 'demo:f', permission: 2 }),
        command('demo:b', { name: 'two', function: 'demo:f', permission: 2 }),
      ]);
      expect(withCode(problems, 'function-and-event')).toEqual([['error', 'demo:a', '/event']]);
    });

    it('unknown-event: the event and trigger_event actions name declared events', async () => {
      const problems = await validate([
        command('demo:a', { name: 'one', event: 'missing' }),
        command('demo:b', {
          name: 'two',
          event: 'start',
          events: {
            start: { actions: [{ type: 'trigger_event', event: 'next' }] },
            next: { actions: [{ type: 'trigger_event', event: 'gone' }] },
          },
        }),
      ]);
      expect(withCode(problems, 'unknown-event')).toEqual([
        ['error', 'demo:a', '/event'],
        ['error', 'demo:b', '/events/next/actions/0/event'],
      ]);
    });

    it('nothing-to-run: an error, or a warning when a script handles the command', async () => {
      const problems = await validate([
        command('demo:a', { name: 'lonely' }),
        command('demo:b', { name: 'scripted' }),
        command('demo:c', { name: 'mentioned' }),
        script('demo:handler', [
          'msm.events.on("command", (e) => {',
          '  if (e.name === "scripted") msm.log.info("hi");',
          '});',
        ]),
        script('demo:other', ['msm.log.info("mentioned");']),
      ]);
      expect(withCode(problems, 'nothing-to-run')).toEqual([
        ['error', 'demo:a', '/function'],
        ['warning', 'demo:b', '/function'],
        ['error', 'demo:c', '/function'],
      ]);
    });

    it('runs-as-player: an info for permission 0 commands that run a function', async () => {
      const problems = await validate([
        command('demo:a', { name: 'one', function: 'demo:f' }),
        command('demo:b', { name: 'two', function: 'demo:f', permission: 0 }),
        command('demo:c', { name: 'three', function: 'demo:f', permission: 2 }),
        eventCommand('demo:d', 'four'),
      ]);
      expect(withCode(problems, 'runs-as-player')).toEqual([
        ['info', 'demo:a', '/permission'],
        ['info', 'demo:b', '/permission'],
      ]);
    });

    it('raw-text: an info for a text argument passed to a function', async () => {
      const problems = await validate([
        command('demo:a', {
          name: 'one',
          function: 'demo:f',
          permission: 2,
          arguments: [
            { name: 'who', type: 'word' },
            { name: 'note', type: 'text' },
          ],
        }),
        eventCommand('demo:b', 'two', { arguments: [{ name: 'note', type: 'text' }] }),
      ]);
      expect(withCode(problems, 'raw-text')).toEqual([['info', 'demo:a', '/arguments/1/type']]);
    });

    it('reports only listed codes', async () => {
      const problems = await validate([
        command('demo:a', { name: 'Bad', arguments: [{ name: 'a', type: 'text', min: 1 }] }),
      ]);
      expect(problems.length).toBeGreaterThan(0);
      for (const problem of problems) {
        expect(COMMAND_PROBLEM_CODES as readonly string[]).toContain(problem.code);
      }
    });
  },
);
