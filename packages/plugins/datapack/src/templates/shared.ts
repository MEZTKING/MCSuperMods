/**
 * Helpers shared by the data pack templates.
 */
import type { Json, TemplateContext } from '@msm/plugin-api';

/** The kind's `defaultData` the host passed in, else `fallback`. */
export function kindDefaultOr(context: TemplateContext, fallback: Json): Json {
  return structuredClone(context.kindDefault ?? fallback);
}

/** `<projectNamespace>:root`, the project's root advancement that child templates hang from. */
export function rootAdvancement(context: TemplateContext): string {
  return `${context.projectNamespace}:root`;
}
