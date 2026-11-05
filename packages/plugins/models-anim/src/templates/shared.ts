/**
 * Helpers shared by the templates.
 */
import type { TemplateContext } from '@msm/plugin-api';

/** The id prefix of entity models and animation sets (ADR 0029 D2). */
export const ENTITY_PREFIX = 'entity/';

/**
 * The geometry identifier for a new model: `geometry.<last path segment>`, for example
 * `geometry.ruby_golem` for `mymod:entity/ruby_golem`.
 */
export function geometryIdentifier(context: TemplateContext): string {
  const last = context.path.split('/').pop() ?? context.path;
  return `geometry.${last.length > 0 ? last : 'unknown'}`;
}
