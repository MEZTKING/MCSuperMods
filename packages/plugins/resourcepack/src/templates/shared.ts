/**
 * Helpers shared by the resource pack templates: references derived from the new element's
 * own id, and the kind's default data.
 */
import type { Json, TemplateContext } from '@msm/plugin-api';

/** The new element's name without a leading `block/` or `item/` folder. */
export function bareName(context: TemplateContext): string {
  return context.path.replace(/^(block|item)\//, '');
}

/**
 * `<namespace>:<folder>/<name>`, a model or texture reference derived from the element's id
 * (`demo:block/ruby` and `demo:ruby` both give `demo:block/ruby` for `block`).
 *
 * @param context - The template context.
 * @param folder - `block` or `item`.
 * @param suffix - Appended to the name, for example `_top`.
 */
export function ownReference(
  context: TemplateContext,
  folder: 'block' | 'item',
  suffix = '',
): string {
  return `${context.namespace}:${folder}/${bareName(context)}${suffix}`;
}

/** The kind's `defaultData` when the host passes one, else a deep copy of `fallback`. */
export function kindDefaultOr(context: TemplateContext, fallback: Json): Json {
  return context.kindDefault ?? (JSON.parse(JSON.stringify(fallback)) as Json);
}
