/**
 * "New element" templates: host logic for the template picker (ADR 0020). Plugins contribute
 * {@link ElementTemplate}s through `contributes.elementTemplates`; the session collects them
 * (`session.library.templates`) and {@link templatesFor} merges them with the app's own
 * built-ins (until those move into the plugins) and a generic `kind:<id>` entry for every
 * registered kind no template covers, which starts from the kind's own `defaultData`.
 *
 * Data pack templates use the current target's JSON shapes (verified against the vendored
 * schemas in `app/test/session-templates.test.ts`).
 *
 * @packageDocumentation
 */

import type { ElementTemplate, Json, ResourceLocation, TemplateContext } from '@msm/plugin-api';
import { defaultElementData } from '../session/element-defaults';

export type { ElementTemplate, TemplateContext };

function pathOf(id: ResourceLocation): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/** Strips a leading `block/` or `item/` from a model path. */
function bare(path: string): string {
  return path.replace(/^(block|item)\//, '');
}

const fromKind =
  (kind: string) =>
  (context: TemplateContext): Json =>
    defaultElementData(kind, context.id, context.kindDefault);

/**
 * The project's own namespace for a template's references: the first project namespace other
 * than `minecraft`, else the element's namespace when it is not `minecraft`, else
 * `my_project`.
 *
 * @param id - The new element's id.
 * @param namespaces - The open project's namespaces.
 */
export function projectNamespace(id: ResourceLocation, namespaces: readonly string[] = []): string {
  const own = namespaces.find((name) => name !== 'minecraft');
  if (own !== undefined) return own;
  const { namespace } = pathOf(id);
  return namespace === 'minecraft' ? 'my_project' : namespace;
}

/**
 * The {@link TemplateContext} the host passes to `template.data` for a new element `id`.
 *
 * @param id - The new element's id.
 * @param namespaces - The open project's namespaces.
 * @param kindDefault - The kind's `defaultData`; deep-copied here.
 */
export function templateContext(
  id: ResourceLocation,
  namespaces: readonly string[],
  kindDefault: Json | undefined,
): TemplateContext {
  const { namespace, path } = pathOf(id);
  return {
    id,
    namespace,
    path,
    projectNamespace: projectNamespace(id, namespaces),
    namespaces: [...namespaces],
    kindDefault: kindDefault === undefined ? undefined : structuredClone(kindDefault),
  };
}

/** The Resource Pack Studio templates, in picker order. */
export const RESOURCE_PACK_TEMPLATES: readonly ElementTemplate[] = [
  {
    id: 'block_model',
    category: 'Models',
    title: 'Block model',
    description: 'A full cube with one texture on every side.',
    kind: 'minecraft:model',
    prefix: 'block/',
    data: ({ namespace, path }) => {
      return {
        parent: 'minecraft:block/cube_all',
        textures: { all: `${namespace}:block/${bare(path)}` },
      };
    },
  },
  {
    id: 'item_model',
    category: 'Models',
    title: 'Item model',
    description: 'A flat item drawn from one texture.',
    kind: 'minecraft:model',
    prefix: 'item/',
    data: ({ namespace, path }) => {
      return {
        parent: 'minecraft:item/generated',
        textures: { layer0: `${namespace}:item/${bare(path)}` },
      };
    },
  },
  {
    id: 'blockstate',
    category: 'Blockstates',
    title: 'Blockstate',
    description: 'Which block model a block uses.',
    kind: 'minecraft:block_definition',
    data: fromKind('minecraft:block_definition'),
  },
  {
    id: 'item_definition',
    category: 'Item definitions',
    title: 'Item definition',
    description: 'Which model an item uses.',
    kind: 'minecraft:item_definition',
    data: fromKind('minecraft:item_definition'),
  },
  {
    id: 'lang',
    category: 'Text',
    title: 'Language file',
    description: 'Translations, for example en_us.',
    kind: 'minecraft:lang',
    defaultName: 'en_us',
    data: fromKind('minecraft:lang'),
  },
  {
    id: 'sounds',
    category: 'Sounds',
    title: 'Sounds',
    description: 'Sound events of the namespace (one per namespace).',
    kind: 'minecraft:sounds',
    defaultName: 'sounds',
    fixedName: true,
    data: fromKind('minecraft:sounds'),
  },
  {
    id: 'pack',
    category: 'Pack',
    title: 'Pack metadata',
    description: 'The pack description shown in the game (pack.mcmeta).',
    kind: 'minecraft:pack_mcmeta',
    defaultName: 'pack',
    data: fromKind('minecraft:pack_mcmeta'),
  },
];

const RECIPE = 'minecraft:recipe';
const FUNCTION = 'minecraft:function';
const FUNCTION_TAG = 'minecraft:tag/function';

/** A `minecraft` function tag (`tick` or `load`) running `<project ns>:<name>`. */
function functionTagTemplate(name: 'tick' | 'load', description: string): ElementTemplate {
  return {
    id: `function_${name}`,
    category: 'Function tags',
    title: name === 'tick' ? 'Tick function tag' : 'Load function tag',
    description,
    kind: FUNCTION_TAG,
    defaultName: name,
    defaultNamespace: 'minecraft',
    data: (context) => ({ values: [`${context.projectNamespace}:${name}`] }),
  };
}

/** The Data Pack Studio templates, in picker order. */
export const DATA_PACK_TEMPLATES: readonly ElementTemplate[] = [
  {
    id: 'recipe_shaped',
    category: 'Recipes',
    title: 'Shaped recipe',
    description: 'A crafting recipe with a fixed pattern.',
    kind: RECIPE,
    data: () => ({
      type: 'minecraft:crafting_shaped',
      category: 'building',
      pattern: ['##', '##'],
      key: { '#': 'minecraft:stone' },
      result: { id: 'minecraft:stone_bricks', count: 4 },
    }),
  },
  {
    id: 'recipe_shapeless',
    category: 'Recipes',
    title: 'Shapeless recipe',
    description: 'A crafting recipe whose ingredients go anywhere in the grid.',
    kind: RECIPE,
    data: () => ({
      type: 'minecraft:crafting_shapeless',
      category: 'misc',
      ingredients: ['minecraft:gravel', 'minecraft:flint'],
      result: { id: 'minecraft:flint', count: 2 },
    }),
  },
  {
    id: 'recipe_smelting',
    category: 'Recipes',
    title: 'Smelting recipe',
    description: 'A furnace recipe: one ingredient, one result.',
    kind: RECIPE,
    data: () => ({
      type: 'minecraft:smelting',
      category: 'blocks',
      ingredient: 'minecraft:cobblestone',
      result: { id: 'minecraft:stone' },
      experience: 0.1,
      cookingtime: 200,
    }),
  },
  {
    id: 'loot_table_block',
    category: 'Loot tables',
    title: 'Block loot table',
    description: 'What a block drops when broken.',
    kind: 'minecraft:loot_table',
    prefix: 'blocks/',
    data: () => ({
      type: 'minecraft:block',
      pools: [
        {
          rolls: 1,
          entries: [{ type: 'minecraft:item', name: 'minecraft:stone' }],
          condition: { type: 'minecraft:survives_explosion' },
        },
      ],
    }),
  },
  {
    id: 'advancement',
    category: 'Advancements',
    title: 'Advancement',
    description: 'A root advancement with its own tab, granted on the first tick.',
    kind: 'minecraft:advancement',
    data: () => ({
      display: {
        icon: { id: 'minecraft:diamond' },
        title: 'My advancement',
        description: 'Describe what to do here',
        background: 'minecraft:gui/advancements/backgrounds/stone',
        frame: 'task',
      },
      criteria: { requirement: { trigger: 'minecraft:tick' } },
    }),
  },
  {
    id: 'predicate',
    category: 'Predicates',
    title: 'Predicate',
    description: 'A reusable condition, for example a random chance.',
    kind: 'minecraft:predicate',
    data: fromKind('minecraft:predicate'),
  },
  {
    id: 'item_modifier',
    category: 'Item modifiers',
    title: 'Item modifier',
    description: 'Changes an item stack, for example its count.',
    kind: 'minecraft:item_modifier',
    data: fromKind('minecraft:item_modifier'),
  },
  {
    id: 'function',
    category: 'Functions',
    title: 'Function',
    description: 'A list of commands, run with /function.',
    kind: FUNCTION,
    data: ({ id }) => ({ lines: [`# Run with /function ${id}`, 'say Hello'] }),
  },
  functionTagTemplate('tick', 'Runs <namespace>:tick every game tick (#minecraft:tick).'),
  functionTagTemplate('load', 'Runs <namespace>:load when the data pack loads (#minecraft:load).'),
  {
    id: 'tag_function',
    category: 'Function tags',
    title: 'Function tag',
    description: 'A named group of functions, run with /function #<namespace>:<name>.',
    kind: FUNCTION_TAG,
    data: fromKind(FUNCTION_TAG),
  },
  {
    id: 'tag_item',
    category: 'Tags',
    title: 'Item tag',
    description: 'A named group of items, used as #<namespace>:<name>.',
    kind: 'minecraft:tag/item',
    data: fromKind('minecraft:tag/item'),
  },
  {
    id: 'tag_block',
    category: 'Tags',
    title: 'Block tag',
    description: 'A named group of blocks, used as #<namespace>:<name>.',
    kind: 'minecraft:tag/block',
    data: fromKind('minecraft:tag/block'),
  },
];

/** Every built-in template, in picker order. */
export const BUILT_IN_TEMPLATES: readonly ElementTemplate[] = [
  ...RESOURCE_PACK_TEMPLATES,
  ...DATA_PACK_TEMPLATES,
];

/** The picker category of the generic `kind:<id>` entries. */
export const GENERIC_TEMPLATE_CATEGORY = 'Other';

/**
 * The templates for the registered kinds, in picker order: the plugin-contributed templates
 * whose kind is registered (first entry wins on a duplicate id), then the app's built-in
 * templates for registered kinds no plugin template covers, then one generic `kind:<id>`
 * entry per registered kind no template covers.
 *
 * @param kinds - The registered kind ids.
 * @param pluginTemplates - The plugins' templates (`session.library.templates`).
 */
export function templatesFor(
  kinds: readonly string[],
  pluginTemplates: readonly ElementTemplate[] = [],
): ElementTemplate[] {
  const registered = new Set(kinds);
  const out: ElementTemplate[] = [];
  const ids = new Set<string>();
  const add = (template: ElementTemplate): void => {
    if (ids.has(template.id)) return;
    ids.add(template.id);
    out.push(template);
  };
  for (const template of pluginTemplates) {
    if (registered.has(template.kind)) add(template);
  }
  const pluginKinds = new Set(out.map((template) => template.kind));
  for (const template of BUILT_IN_TEMPLATES) {
    if (registered.has(template.kind) && !pluginKinds.has(template.kind)) add(template);
  }
  const covered = new Set(out.map((template) => template.kind));
  for (const kind of kinds) {
    if (covered.has(kind)) continue;
    add({
      id: `kind:${kind}`,
      title: kind,
      description: 'An element of this kind with its default data.',
      category: GENERIC_TEMPLATE_CATEGORY,
      kind,
      data: fromKind(kind),
    });
  }
  return out;
}

/**
 * The element id a template produces for `namespace` and the typed `name`.
 *
 * @throws Error If the name is empty or not a valid resource path.
 */
export function templateElementId(
  template: ElementTemplate,
  namespace: string,
  name: string,
): ResourceLocation {
  const trimmed = (template.fixedName === true ? (template.defaultName ?? '') : name).trim();
  if (trimmed === '') throw new Error('Enter a name, for example "ruby_block".');
  const prefix = template.prefix ?? '';
  const path = trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`;
  if (!/^[a-z0-9_.\-/]+$/.test(path) || path.split('/').some((part) => part === '')) {
    throw new Error(
      `"${path}" is not a valid name: use lower-case letters, digits, "_", "-", "." and "/".`,
    );
  }
  return `${namespace}:${path}`;
}
