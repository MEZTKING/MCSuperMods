/**
 * "New element" templates (Resource Pack Studio). Each template picks a kind, an id prefix or
 * a default name, and starting data with the user's namespace substituted. Kinds without a
 * template are offered generically, with the kind's own `defaultData`.
 *
 * @packageDocumentation
 */

import type { Json, ResourceLocation } from '@msm/core';
import { defaultElementData } from '../session/element-defaults';

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
   * Starting data for the element `id`. `kindDefault` is the kind's `defaultData`.
   */
  data(id: ResourceLocation, kindDefault: Json | undefined): Json;
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

/**
 * The templates for the registered kinds: every built-in template whose kind is registered,
 * then one generic entry per registered kind no template covers.
 *
 * @param kinds - The registered kind ids.
 */
export function templatesFor(kinds: readonly string[]): ElementTemplate[] {
  const registered = new Set(kinds);
  const out = RESOURCE_PACK_TEMPLATES.filter((template) => registered.has(template.kind));
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
