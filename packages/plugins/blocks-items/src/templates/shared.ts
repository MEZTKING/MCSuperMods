/**
 * Helpers shared by the templates.
 */
import type { TemplateContext } from '@msm/plugin-api';

/** `ruby_ore` (or `ores/ruby_ore`) becomes `Ruby Ore`: the last path segment in title case. */
export function displayName(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last
    .split(/[_\-.]+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/** An event id derived from the element's own id: `<ns>:<path>_<suffix>`. */
export const ownEvent = (context: TemplateContext, suffix: string): string =>
  `${context.id}_${suffix}`;
