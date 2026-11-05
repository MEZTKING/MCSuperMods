/**
 * The 26.3 Java generator (ADR 0033 D3): identifier derivation, one golden per kind built from
 * the runtime's GameTest kitchen-sink definitions (copied from
 * `engine-mod/src/gametest/resources/msm/msm_test/` into `test/fixtures/java-project/input/`),
 * determinism, and the errors the exporter reports as `export.java-generation-failed`.
 * `UPDATE_GOLDENS=1` rewrites `test/fixtures/java-project/expected/`.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefinitionInput, GeneratedFile, JavaProjectInput, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { target } from '../src/index';
import { className, constantName, eventMethodName, generateJavaProject } from '../src/java-project/index';
import { eventMethodNames, NameTable } from '../src/java-project/names';

const update = process.env.UPDATE_GOLDENS === '1';
const here = dirname(fileURLToPath(import.meta.url));
const inputRoot = join(here, 'fixtures', 'java-project', 'input');
const expectedRoot = join(here, 'fixtures', 'java-project', 'expected');

async function definition(kind: string, path: string, namespace = 'msm_test'): Promise<DefinitionInput> {
  const json = JSON.parse(await readFile(join(inputRoot, `${kind}-${path}.json`), 'utf8')) as JsonObject;
  return { id: `${namespace}:${path}`, path: `msm/${namespace}/${kind}/${path}.json`, definition: json };
}

function input(parts: Partial<JavaProjectInput>): JavaProjectInput {
  return {
    modId: 'msm_test',
    javaPackage: 'msm_test',
    modClassName: 'MsmTestMod',
    blocks: [],
    items: [],
    entities: [],
    geckolib: false,
    ...parts,
  };
}

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)));
    else out.push(path);
  }
  return out.sort();
}

/** Compares generated files with `expected/<name>/`, or rewrites it with `UPDATE_GOLDENS=1`. */
async function golden(name: string, files: GeneratedFile[]): Promise<void> {
  const root = join(expectedRoot, name);
  if (update) {
    await rm(root, { recursive: true, force: true });
    for (const file of files) {
      const out = join(root, ...file.path.split('/'));
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, file.contents);
    }
  }
  expect(await listFiles(root)).toEqual(files.map((file) => file.path));
  for (const file of files) {
    expect(file.contents, file.path).toBe(await readFile(join(root, ...file.path.split('/')), 'utf8'));
  }
}

describe('Java identifiers', () => {
  it('derives constants, classes and event methods from ids', () => {
    expect(constantName('ruby_ore')).toBe('RUBY_ORE');
    expect(constantName('ores/deep-ruby')).toBe('ORES_DEEP_RUBY');
    expect(constantName('9lives')).toBe('ID_9LIVES');
    expect(className('ruby_ore', 'Block')).toBe('RubyOreBlock');
    expect(className('chime_block', 'Block')).toBe('ChimeBlock');
    expect(className('ores/deep-ruby', 'Item')).toBe('OresDeepRubyItem');
    expect(className('9lives', 'Entity')).toBe('Id9livesEntity');
    expect(eventMethodName('example:wake')).toBe('event_wake');
    expect(eventMethodName('example:a/b-c')).toBe('event_a_b_c');
    expect(eventMethodName('example:wake', true)).toBe('event_example_wake');
  });

  it('keeps event methods and names unique', () => {
    expect([...eventMethodNames(['a:wake', 'b:wake', 'a:sleep'])]).toEqual([
      ['a:sleep', 'event_sleep'],
      ['a:wake', 'event_a_wake'],
      ['b:wake', 'event_b_wake'],
    ]);
    const table = new NameTable();
    expect(table.take('RUBY', (name) => [name, `${name}_KEY`])).toBe('RUBY');
    expect(table.take('RUBY_KEY')).toBe('RUBY_KEY_2');
    expect(table.take('RUBY', (name) => [name, `${name}_KEY`])).toBe('RUBY_2');
  });
});

describe('Java generator (mc-26.3)', () => {
  it('is the target fact', () => {
    expect(target.javaProject).toBeDefined();
  });

  it('generates the kitchen-sink block and a block without behaviour', async () => {
    const { files, entrypoints } = generateJavaProject(
      input({ blocks: [await definition('block', 'defaults'), await definition('block', 'kitchen_sink')] }),
    );
    expect(entrypoints).toEqual({ main: 'msm_test.MsmTestMod', client: undefined });
    await golden('block', files);
  });

  it('generates the kitchen-sink items (tool, durability, on_use; food)', async () => {
    const { files } = generateJavaProject(
      input({ items: [await definition('item', 'gadget'), await definition('item', 'snack')] }),
    );
    await golden('item', files);
  });

  it('generates the kitchen-sink entity with GeckoLib and the client entrypoint', async () => {
    const { files, entrypoints } = generateJavaProject(
      input({ entities: [await definition('entity', 'kitchen_sink')], geckolib: true }),
    );
    expect(entrypoints.client).toBe('msm_test.client.MsmTestModClient');
    await golden('entity', files);
  });

  it('generates a blank project as the mod class alone', () => {
    const files = target.javaProject?.generate(input({})) ?? [];
    expect(files.map((file) => file.path)).toEqual(['src/main/java/msm_test/MsmTestMod.java']);
    expect(files[0]?.contents.startsWith('// Generated by MCSuperMods')).toBe(true);
  });

  it('is deterministic and sorted, with a header, LF and four-space indents', async () => {
    const all = input({
      blocks: [await definition('block', 'kitchen_sink')],
      items: [await definition('item', 'gadget')],
      entities: [await definition('entity', 'kitchen_sink')],
      geckolib: true,
    });
    const first = target.javaProject?.generate(all) ?? [];
    const second = target.javaProject?.generate(structuredClone(all)) ?? [];
    expect(second).toEqual(first);
    const paths = first.map((file) => file.path);
    expect(paths).toEqual([...paths].sort());
    for (const file of first) {
      expect(file.contents.startsWith('// Generated by MCSuperMods'), file.path).toBe(true);
      expect(file.contents.includes('\r'), file.path).toBe(false);
      expect(file.contents.includes('\t'), file.path).toBe(false);
      expect(file.contents.endsWith('}\n'), file.path).toBe(true);
      const imports = file.contents.split('\n').filter((line) => line.startsWith('import '));
      expect(imports, file.path).toEqual([...imports].sort());
    }
  });

  it('names one class per id and avoids clashes across namespaces', async () => {
    const block = await definition('block', 'kitchen_sink');
    const other = { ...block, id: 'other:kitchen_sink', path: 'msm/other/block/kitchen_sink.json' };
    const { files } = generateJavaProject(input({ blocks: [block, other] }));
    const paths = files.map((file) => file.path);
    expect(paths).toContain('src/main/java/msm_test/block/KitchenSinkBlock.java');
    expect(paths).toContain('src/main/java/msm_test/block/KitchenSinkBlock2.java');
    const modBlocks = files.find((file) => file.path.endsWith('/ModBlocks.java'))?.contents ?? '';
    expect(modBlocks).toContain('KITCHEN_SINK_2_KEY');
  });

  describe('errors name the definition', () => {
    const block = (definition: JsonObject): DefinitionInput => ({
      id: 'msm_test:bad',
      path: 'msm/msm_test/block/bad.json',
      definition,
    });
    const generate = (parts: Partial<JavaProjectInput>) => () => generateJavaProject(input(parts));

    it('rejects unknown components, actions and keys', () => {
      expect(generate({ blocks: [block({ format: 1, components: { 'msm:glow': {} } })] })).toThrow(
        /msm\/msm_test\/block\/bad\.json \(msm_test:bad\): .*unknown component 'msm:glow'/,
      );
      expect(
        generate({
          blocks: [
            block({
              format: 1,
              components: { 'msm:on_interact': { event: 'msm_test:x' } },
              events: { 'msm_test:x': { actions: [{ type: 'run_script', handler: 'msm_test:h' }] } },
            }),
          ],
        }),
      ).toThrow(/action type 'run_script' cannot be ejected/);
      expect(generate({ blocks: [block({ format: 1, colour: 'red' })] })).toThrow(/unknown top-level key 'colour'/);
      expect(generate({ blocks: [block({ format: 2 })] })).toThrow(/format 2/);
    });

    it('rejects undeclared events', () => {
      expect(
        generate({ blocks: [block({ format: 1, components: { 'msm:on_interact': { event: 'msm_test:missing' } } })] }),
      ).toThrow(/names event msm_test:missing, which is not declared/);
      expect(
        generate({
          blocks: [
            block({
              format: 1,
              events: { 'msm_test:a': { actions: [{ type: 'trigger_event', event: 'msm_test:b' }] } },
            }),
          ],
        }),
      ).toThrow(/trigger_event names event msm_test:b/);
    });

    it('rejects entities without GeckoLib and unknown goals', async () => {
      const entity = await definition('entity', 'kitchen_sink');
      expect(generate({ entities: [entity] })).toThrow(/GeckoLib/);
      const goals = structuredClone(entity);
      (goals.definition.components as JsonObject)['msm:ai_goals'] = { goals: [{ type: 'dance' }] };
      expect(generate({ entities: [goals], geckolib: true })).toThrow(/goal type 'dance' cannot be ejected/);
    });
  });
});
