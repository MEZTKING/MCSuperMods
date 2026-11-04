/**
 * "New element" templates: host logic for the template picker (ADR 0020). Plugins contribute
 * {@link ElementTemplate}s through `contributes.elementTemplates`; the session collects them
 * (`session.library.templates`) and {@link templatesFor} adds a generic `kind:<id>` entry for
 * every registered kind no template covers (for example a third-party kind), which starts
 * from the kind's own `defaultData`. The app holds no template content of its own.
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

/** The picker category of the generic `kind:<id>` entries. */
export const GENERIC_TEMPLATE_CATEGORY = 'Other';

/**
 * The templates for the registered kinds, in picker order: the plugin-contributed templates
 * whose kind is registered (first entry wins on a duplicate id), then one generic `kind:<id>`
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
