/**
 * End to end through `@msm/core` (B368): a project with a block, two items and a rule book is
 * lowered by `lowerProjectAsync` with the plugins given, so core expands it first (B367:
 * `expandProject` runs the rules expander and patches copies), on every built-in target. The
 * patched definitions validate against the MSM definition schemas, the book lowers to its
 * generated script, the saved project is untouched, and core's expansion agrees with the
 * expander's patches applied by hand.
 *
 * `@msm/core` and `@msm/plugin-blocks-items` are read from source by relative path: neither is a
 * dependency of this plugin (plugins ship only against the plugin API), and adding a dev
 * dependency would change the lockfile.
 */
import type { Element, JsonObject, OutputFile, Project } from '@msm/plugin-api';
import { validateJson } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  ElementKindRegistry,
  expandProject,
  lowerProjectAsync,
  registerPlugin,
} from '../../../core/src/index';
import blocksItems from '../../blocks-items/src/index';
import rules, { compileRuleBook, expandRules, ruleEventId } from '../src/index';
import { applyPatches, book, element, indexesFor } from './support';

const BLOCK = element('msm:block', 'demo:ruby_block', {
  components: { 'msm:on_interact': { event: 'demo:ruby_block_use' } },
  display_name: 'Ruby Block',
  events: {
    'demo:ruby_block_use': {
      actions: [{ sound: 'minecraft:block.amethyst_block.chime', type: 'play_sound' }],
    },
  },
  format: 1,
  model: 'minecraft:block/stone',
});
const WAND = element('msm:item', 'demo:wand', { display_name: 'Wand', format: 1 });
const RUBY = element('msm:item', 'demo:ruby', { display_name: 'Ruby', format: 1 });
const BOOK = book(
  [
    {
      do: [
        { count: 1, item: 'demo:ruby', step: 'give_item' },
        { sound: 'minecraft:block.note_block.chime', step: 'play_sound' },
      ],
      key: 'ruby_gift',
      when: { subject: 'demo:ruby_block', trigger: 'block_used' },
    },
    {
      do: [{ amount: 1, counter: 'uses', scope: 'player', step: 'add_to_counter' }],
      key: 'count_uses',
      only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
      when: { options: { cooldown_seconds: 1 }, subject: 'demo:wand', trigger: 'item_used' },
    },
  ],
  [{ name: 'uses', scope: 'player', start: 0 }],
);

const ELEMENTS: readonly Element[] = [BLOCK, WAND, RUBY, BOOK];

const projectOf = (elements: Element[]): Project => ({
  formatVersion: 1,
  name: 'Demo',
  namespaces: [{ name: 'demo', elements, assets: [] }],
  targets: [],
  plugins: ['msm.blocks-items', 'msm.rules'],
  settings: {},
});

const registry = new ElementKindRegistry();
registerPlugin(registry, blocksItems);
registerPlugin(registry, rules);

const text = (file: OutputFile | undefined): string =>
  new TextDecoder().decode(file?.contents as Uint8Array);

/** A JSON output's value. */
const json = (file: OutputFile | undefined): JsonObject =>
  (file?.contents instanceof Uint8Array ? JSON.parse(text(file)) : file?.contents) as JsonObject;

describe('rules end to end through @msm/core', () => {
  for (const bundle of builtInTargets) {
    const { target } = bundle;
    it(`lowers the expanded project on ${target.id}`, async () => {
      const saved = projectOf([...ELEMENTS]);
      const before = structuredClone(saved);
      const { files, problems } = await lowerProjectAsync(saved, registry, target, {
        plugins: [blocksItems, rules],
      });
      expect(problems).toEqual([]);
      expect(saved).toEqual(before);

      const expansion = expandRules({ elements: ELEMENTS, target });
      expect(expansion.problems).toEqual([]);
      const core = await expandProject(saved, [blocksItems, rules], target);
      expect(core.problems).toEqual([]);
      expect(core.project.namespaces[0]?.elements).toEqual(
        applyPatches(ELEMENTS, expansion.patches),
      );

      const byPath = new Map(files.map((file) => [file.path, file]));
      const blockFile = byPath.get('msm/demo/block/ruby_block.json');
      const itemFile = byPath.get('msm/demo/item/wand.json');
      expect(blockFile).toBeDefined();
      expect(itemFile).toBeDefined();

      const blockJson = json(blockFile);
      const blockEvent = ruleEventId('demo:ruby_block', 'block_used');
      expect((blockJson.components as JsonObject)['msm:on_interact']).toEqual({
        event: blockEvent,
      });
      expect((blockJson.events as JsonObject)[blockEvent]).toEqual({
        actions: [
          { event: 'demo:ruby_block_use', type: 'trigger_event' },
          { count: 1, item: 'demo:ruby', type: 'give_item' },
          { sound: 'minecraft:block.note_block.chime', type: 'play_sound' },
        ],
      });
      const itemJson = json(itemFile);
      const itemEvent = ruleEventId('demo:wand', 'item_used');
      expect((itemJson.events as JsonObject)[itemEvent]).toEqual({
        actions: [{ handler: 'demo:rules/rules/wand/item_used', type: 'run_script' }],
      });
      expect((itemJson.components as JsonObject)['msm:on_use']).toMatchObject({
        event: itemEvent,
      });

      const indexes = await indexesFor(bundle);
      for (const file of [blockFile, itemFile]) {
        if (file?.schema === undefined) throw new Error(`${file?.path} has no schema`);
        const node = indexes.schemaIndex.resolveSchemaRef(file.schema);
        const blocking = validateJson(json(file), node, {
          registries: indexes.registries,
        }).filter((p) => p.severity === 'error' || p.code === 'schema.unknown-id');
        expect(blocking, file.path).toEqual([]);
      }

      const script = byPath.get('msm/demo/script/rules/rules.ts');
      expect(script).toMatchObject({ layer: 'msm', language: 'typescript' });
      const compiled = compileRuleBook(BOOK, ELEMENTS, target);
      expect(text(script)).toBe(`${(compiled.script ?? []).join('\n')}\n`);
      expect(files.filter((file) => file.path.includes('/script/'))).toHaveLength(1);
    });
  }
});
