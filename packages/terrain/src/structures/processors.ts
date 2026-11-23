/**
 * The structure processors (ADR 0122 D6; B638 builds them from the spike's processor list:
 * 18 rows exact, 4 about right, 3 named). Stub made by B635: it changes nothing and names every
 * rule as only in the game.
 */

import type { ProcessedTemplate, ProcessInput } from './api';

/** Applies a processor list to a template (B638). The stub leaves the template unchanged. */
export function processTemplate(input: ProcessInput): ProcessedTemplate {
  return {
    template: input.template,
    after: input.template.blocks ?? [],
    palette: input.template.palette,
    rules: [],
  };
}
