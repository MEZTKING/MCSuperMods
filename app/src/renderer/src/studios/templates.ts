/**
 * "New element" templates (Resource Pack Studio and Data Pack Studio). Each template picks a
 * kind, an id prefix or a default name (and optionally a default namespace), and starting
 * data with the user's namespace substituted. Kinds without a template are offered
 * generically, with the kind's own `defaultData`.
 *
 * Data pack templates use the current target's JSON shapes (verified against the vendored
 * schemas in `app/test/session-templates.test.ts`).
 *
 * @packageDocumentation
 */

import type { Json, ResourceLocation } from '@msm/core';
import { defaultElementData } from '../session/element-defaults';

/** What a template may know about the open project when it builds its data. */
export interface TemplateContext {
  /** The project's namespace names. */
  namespaces: readonly string[];
}

/** One entry of the template picker. */
export interface ElementTemplate {
  /** Stable id, also used in `data-testid="template-<id>"`. */
  id: string;
  label: string;
  description: string;
  /** The element kind the template creates. */
  kind: string;
  /** Prepended to the name the user types (`block/`, `item/` or empty). */
  prefix: string;
  /** The name filled in when the template is chosen (`en_us`, `sounds`, `pack`). */
  defaultName?: string;
  /** The name cannot be changed (one `sounds` file per namespace). */
  fixedName?: boolean;
  /**
   * The namespace preselected when the template is chosen (`minecraft` for the `tick` and
   * `load` function tags); otherwise the user's current namespace.
   */
  defaultNamespace?: string;
  /**
   * Starting data for the element `id`. `kindDefault` is the kind's `defaultData`; `context`
   * names the project's namespaces (templates that refer to the project's own ids use the
   * first namespace other than `minecraft`).
   */
  data(id: ResourceLocation, kindDefault: Json | undefined, context?: TemplateContext): Json;
}

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
  (id: ResourceLocation, kindDefault: Json | undefined): Json =>
    defaultElementData(kind, id, kindDefault);

/**
 * The project's own namespace for a template's references: the first project namespace other
 * than `minecraft`, else the element's namespace when it is not `minecraft`, else
 * `my_project`.
 */
export function projectNamespace(id: ResourceLocation, context?: TemplateContext): string {
  const own = context?.namespaces.find((name) => name !== 'minecraft');
  if (own !== undefined) return own;
  const { namespace } = pathOf(id);
  return namespace === 'minecraft' ? 'my_project' : namespace;
}

/** The Resource Pack Studio templates, in picker order. */
export const RESOURCE_PACK_TEMPLATES: readonly ElementTemplate[] = [
  {
    id: 'block_model',
    label: 'Block model',
    description: 'A full cube with one texture on every side.',
    kind: 'minecraft:model',
    prefix: 'block/',
    data: (id) => {
      const { namespace, path } = pathOf(id);
      return {
        parent: 'minecraft:block/cube_all',
        textures: { all: `${namespace}:block/${bare(path)}` },
      };
    },
  },
  {
    id: 'item_model',
    label: 'Item model',
    description: 'A flat item drawn from one texture.',
    kind: 'minecraft:model',
    prefix: 'item/',
    data: (id) => {
      const { namespace, path } = pathOf(id);
      return {
        parent: 'minecraft:item/generated',
        textures: { layer0: `${namespace}:item/${bare(path)}` },
      };
    },
  },
  {
    id: 'blockstate',
    label: 'Blockstate',
    description: 'Which block model a block uses.',
    kind: 'minecraft:block_definition',
    prefix: '',
    data: fromKind('minecraft:block_definition'),
  },
  {
    id: 'item_definition',
    label: 'Item definition',
    description: 'Which model an item uses.',
    kind: 'minecraft:item_definition',
    prefix: '',
    data: fromKind('minecraft:item_definition'),
  },
  {
    id: 'lang',
    label: 'Language file',
    description: 'Translations, for example en_us.',
    kind: 'minecraft:lang',
    prefix: '',
    defaultName: 'en_us',
    data: fromKind('minecraft:lang'),
  },
  {
    id: 'sounds',
    label: 'Sounds',
    description: 'Sound events of the namespace (one per namespace).',
    kind: 'minecraft:sounds',
    prefix: '',
    defaultName: 'sounds',
    fixedName: true,
    data: fromKind('minecraft:sounds'),
  },
  {
    id: 'pack',
    label: 'Pack metadata',
    description: 'The pack description shown in the game (pack.mcmeta).',
    kind: 'minecraft:pack_mcmeta',
    prefix: '',
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
    label: name === 'tick' ? 'Tick function tag' : 'Load function tag',
    description,
    kind: FUNCTION_TAG,
    prefix: '',
    defaultName: name,
    defaultNamespace: 'minecraft',
    data: (id, _kindDefault, context) => ({ values: [`${projectNamespace(id, context)}:${name}`] }),
  };
}

/** The Data Pack Studio templates, in picker order. */
export const DATA_PACK_TEMPLATES: readonly ElementTemplate[] = [
  {
    id: 'recipe_shaped',
    label: 'Shaped recipe',
    description: 'A crafting recipe with a fixed pattern.',
    kind: RECIPE,
    prefix: '',
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
    label: 'Shapeless recipe',
    description: 'A crafting recipe whose ingredients go anywhere in the grid.',
    kind: RECIPE,
    prefix: '',
    data: () => ({
      type: 'minecraft:crafting_shapeless',
      category: 'misc',
      ingredients: ['minecraft:gravel', 'minecraft:flint'],
      result: { id: 'minecraft:flint', count: 2 },
    }),
  },
  {
    id: 'recipe_smelting',
    label: 'Smelting recipe',
    description: 'A furnace recipe: one ingredient, one result.',
    kind: RECIPE,
    prefix: '',
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
    label: 'Block loot table',
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
    label: 'Advancement',
    description: 'A root advancement with its own tab, granted on the first tick.',
    kind: 'minecraft:advancement',
    prefix: '',
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
    label: 'Predicate',
    description: 'A reusable condition, for example a random chance.',
    kind: 'minecraft:predicate',
    prefix: '',
    data: fromKind('minecraft:predicate'),
  },
  {
    id: 'item_modifier',
    label: 'Item modifier',
    description: 'Changes an item stack, for example its count.',
    kind: 'minecraft:item_modifier',
    prefix: '',
    data: fromKind('minecraft:item_modifier'),
  },
  {
    id: 'function',
    label: 'Function',
    description: 'A list of commands, run with /function.',
    kind: FUNCTION,
    prefix: '',
    data: (id) => ({ lines: [`# Run with /function ${id}`, 'say Hello'] }),
  },
  functionTagTemplate('tick', 'Runs <namespace>:tick every game tick (#minecraft:tick).'),
  functionTagTemplate('load', 'Runs <namespace>:load when the data pack loads (#minecraft:load).'),
  {
    id: 'tag_item',
    label: 'Item tag',
    description: 'A named group of items, used as #<namespace>:<name>.',
    kind: 'minecraft:tag/item',
    prefix: '',
    data: fromKind('minecraft:tag/item'),
  },
  {
    id: 'tag_block',
    label: 'Block tag',
    description: 'A named group of blocks, used as #<namespace>:<name>.',
    kind: 'minecraft:tag/block',
    prefix: '',
    data: fromKind('minecraft:tag/block'),
  },
];

/** Every built-in template, in picker order. */
export const BUILT_IN_TEMPLATES: readonly ElementTemplate[] = [
  ...RESOURCE_PACK_TEMPLATES,
  ...DATA_PACK_TEMPLATES,
];

/**
 * The templates for the registered kinds: every built-in template whose kind is registered,
 * then one generic entry per registered kind no template covers.
 *
 * @param kinds - The registered kind ids.
 */
export function templatesFor(kinds: readonly string[]): ElementTemplate[] {
  const registered = new Set(kinds);
  const out = BUILT_IN_TEMPLATES.filter((template) => registered.has(template.kind));
  const covered = new Set(out.map((template) => template.kind));
  for (const kind of kinds) {
    if (covered.has(kind)) continue;
    out.push({
      id: `kind:${kind}`,
      label: kind,
      description: 'An element of this kind with its default data.',
      kind,
      prefix: '',
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
  const path = trimmed.startsWith(template.prefix) ? trimmed : `${template.prefix}${trimmed}`;
  if (!/^[a-z0-9_.\-/]+$/.test(path) || path.split('/').some((part) => part === '')) {
    throw new Error(
      `"${path}" is not a valid name: use lower-case letters, digits, "_", "-", "." and "/".`,
    );
  }
  return `${namespace}:${path}`;
}
