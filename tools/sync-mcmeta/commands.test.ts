import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  adaptCommandReport,
  type CommandReportNode,
  commandReportFormat,
  legacyArgument,
  TIME_DEFAULT_MIN,
} from './commands.ts';
import { validateCommands } from './index.ts';

const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'));

/**
 * 40 command paths of mcmeta's `26.4-pre-1` report (nested-argument format), chosen so that
 * every rename and reshape of the table in `commands.ts` and every `custom_suggestion` kind
 * appears, and the same paths of `26.4-snapshot-7`'s report (parser-and-properties format) with
 * the two key types Mojang merged written as their merged names (B831).
 */
const NESTED = readJson(new URL('./fixtures/commands-nested-argument.json', import.meta.url));
const EXPECTED = readJson(new URL('./fixtures/commands-parser-properties.json', import.meta.url));

/** The vendored command reports, both in the parser-and-properties format. */
const VENDORED = ['mc-26.3', 'mc-26.4'].map((target) => ({
  target,
  report: readJson(
    new URL(`../../packages/targets/${target}/vendor/mcmeta/commands.json`, import.meta.url),
  ) as CommandReportNode,
}));

describe('adaptCommandReport over the 26.4-pre-1 fixture', () => {
  it('gives the old format, equal to 26.4-snapshot-7 but for the merged key types', () => {
    const { tree, adaptation } = adaptCommandReport(NESTED);
    expect(tree).toEqual(EXPECTED);
    expect(commandReportFormat(tree)).toBe('parser-properties');
    expect(adaptation.format).toBe('nested-argument');
    expect(adaptation.converted).toBe(56);
    expect(Object.keys(adaptation.renamed)).toEqual([
      'minecraft:bool -> brigadier:bool',
      'minecraft:double -> brigadier:double',
      'minecraft:float -> brigadier:float',
      'minecraft:greedy_string -> brigadier:string',
      'minecraft:integer -> brigadier:integer',
      'minecraft:quoted_string -> brigadier:string',
      'minecraft:word -> brigadier:string',
    ]);
    expect(Object.keys(adaptation.dropped)).toEqual([
      'auto_center',
      'context',
      'custom_suggestion',
      'permissions',
    ]);
  });

  it('passes the checks sync-mcmeta runs before writing, which the raw report fails', () => {
    // The fixture has too few root commands for the count check; only the parser check matters.
    const parserProblems = (value: unknown) =>
      validateCommands(value).filter((p) => p.includes('"parser"'));
    expect(parserProblems(adaptCommandReport(NESTED).tree)).toEqual([]);
    expect(parserProblems(NESTED)).toEqual([
      expect.stringMatching(/^commands\.json: 56 argument nodes have no "parser"/),
    ]);
  });

  it('does not change its input', () => {
    const before = JSON.stringify(NESTED);
    adaptCommandReport(NESTED);
    expect(JSON.stringify(NESTED)).toBe(before);
  });
});

describe('legacyArgument', () => {
  it('maps every renamed and reshaped type', () => {
    expect(legacyArgument({ type: 'minecraft:integer', min: 0, max: 3 })).toEqual({
      parser: 'brigadier:integer',
      properties: { min: 0, max: 3 },
      dropped: [],
    });
    expect(legacyArgument({ type: 'minecraft:long' }).parser).toBe('brigadier:long');
    expect(legacyArgument({ type: 'minecraft:bool' })).toEqual({
      parser: 'brigadier:bool',
      dropped: [],
    });
    expect(legacyArgument({ type: 'minecraft:word' }).properties).toEqual({ type: 'word' });
    expect(legacyArgument({ type: 'minecraft:quoted_string' }).properties).toEqual({
      type: 'phrase',
    });
    expect(legacyArgument({ type: 'minecraft:greedy_string' }).properties).toEqual({
      type: 'greedy',
    });
    expect(
      legacyArgument({ type: 'minecraft:entity', players_only: true, single_result: true }),
    ).toEqual({
      parser: 'minecraft:entity',
      properties: { amount: 'single', type: 'players' },
      dropped: [],
    });
    expect(
      legacyArgument({ type: 'minecraft:entity', players_only: false, single_result: false })
        .properties,
    ).toEqual({ amount: 'multiple', type: 'entities' });
    expect(legacyArgument({ type: 'minecraft:score_holder', multiple: true }).properties).toEqual({
      amount: 'multiple',
    });
    expect(legacyArgument({ type: 'minecraft:score_holder', multiple: false }).properties).toEqual({
      amount: 'single',
    });
    expect(legacyArgument({ type: 'minecraft:time' }).properties).toEqual({
      min: TIME_DEFAULT_MIN,
    });
    expect(legacyArgument({ type: 'minecraft:time', min: 1 }).properties).toEqual({ min: 1 });
  });

  it('drops what the old format never had and leaves no empty properties', () => {
    expect(legacyArgument({ type: 'minecraft:vec3', auto_center: true })).toEqual({
      parser: 'minecraft:vec3',
      dropped: ['auto_center'],
    });
    expect(legacyArgument({ type: 'minecraft:loot_table', context: 'minecraft:chest' })).toEqual({
      parser: 'minecraft:loot_table',
      dropped: ['context'],
    });
    // The checker reads a missing `properties` as "any id" for `resource_location`, an empty
    // object as "no category": never write `{}`.
    expect(legacyArgument({ type: 'minecraft:resource_location' })).toEqual({
      parser: 'minecraft:resource_location',
      dropped: [],
    });
  });

  it('passes unknown types and properties through', () => {
    expect(legacyArgument({ type: 'minecraft:resource', registry: 'minecraft:recipe' })).toEqual({
      parser: 'minecraft:resource',
      properties: { registry: 'minecraft:recipe' },
      dropped: [],
    });
    expect(legacyArgument({ type: 'example:new_type', size: 4 })).toEqual({
      parser: 'example:new_type',
      properties: { size: 4 },
      dropped: [],
    });
    // Entity and score holder properties are reshaped only when the nested ones are there.
    expect(legacyArgument({ type: 'minecraft:entity', amount: 'single' }).properties).toEqual({
      amount: 'single',
    });
  });
});

/**
 * The forward conversion, old format to nested, as Mojang's `26.4-pre-1` report and Spyglass's
 * own migration (`@spyglassmc/java-edition` 0.3.74) write it: types renamed, strings split, the
 * entity and score holder properties reshaped, the key types merged, `time`'s default `min` left
 * out, `permissions` on every node. Only for these tests.
 */
function toNested(node: CommandReportNode): CommandReportNode {
  const { parser, properties, children, permissions, ...rest } = node;
  const out: CommandReportNode = { ...rest };
  out.permissions = permissions ?? { type: 'minecraft:always_pass' };
  if (parser !== undefined) {
    const props: Record<string, unknown> = { ...properties };
    let type = parser;
    if (parser.startsWith('brigadier:') && parser !== 'brigadier:string') {
      type = `minecraft:${parser.slice('brigadier:'.length)}`;
    } else if (parser === 'brigadier:string') {
      const kind = props.type;
      delete props.type;
      type =
        { word: 'minecraft:word', phrase: 'minecraft:quoted_string' }[kind as string] ??
        'minecraft:greedy_string';
    } else if (parser === 'minecraft:entity') {
      type = parser;
      const { amount, type: kind } = props;
      delete props.amount;
      delete props.type;
      props.players_only = kind === 'players';
      props.single_result = amount === 'single';
    } else if (parser === 'minecraft:score_holder') {
      props.multiple = props.amount === 'multiple';
      delete props.amount;
    } else if (parser === 'minecraft:resource_key') {
      type = 'minecraft:resource';
    } else if (parser === 'minecraft:resource_or_tag_key') {
      type = 'minecraft:resource_or_tag';
    } else if (parser === 'minecraft:time' && props.min === TIME_DEFAULT_MIN) {
      delete props.min;
    } else if (parser === 'minecraft:vec3') {
      props.auto_center = true;
    }
    out.argument = { type, ...props };
  }
  if (children !== undefined) {
    out.children = Object.fromEntries(
      Object.entries(children).map(([name, child]) => [name, toNested(child)]),
    );
  }
  return out;
}

/** The old report with the merged key types written as their merged names. */
function withMergedKeyTypes(node: CommandReportNode): CommandReportNode {
  const out: CommandReportNode = { ...node };
  if (node.parser === 'minecraft:resource_key') out.parser = 'minecraft:resource';
  if (node.parser === 'minecraft:resource_or_tag_key') out.parser = 'minecraft:resource_or_tag';
  if (node.children !== undefined) {
    out.children = Object.fromEntries(
      Object.entries(node.children).map(([name, child]) => [name, withMergedKeyTypes(child)]),
    );
  }
  return out;
}

describe.each(VENDORED)('adaptCommandReport over the vendored $target report', ({ report }) => {
  it('leaves a report in the old format as it is', () => {
    const { tree, adaptation } = adaptCommandReport(report);
    expect(tree).toEqual(report);
    expect(adaptation).toEqual({
      format: 'parser-properties',
      converted: 0,
      renamed: {},
      dropped: {},
    });
  });

  it('undoes the nested format on every node but the merged key types', () => {
    const nested = toNested(report);
    expect(commandReportFormat(nested)).toBe('nested-argument');
    const { tree } = adaptCommandReport(nested);
    expect(tree).toEqual(withMergedKeyTypes(report));
    expect(validateCommands(tree)).toEqual([]);
  });
});
