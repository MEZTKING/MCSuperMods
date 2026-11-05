/**
 * Builds {@link ExampleProject} entries: computes `requiresKinds` from the bundle and tags
 * every element with `example` and the example's category, so copied elements stay easy to
 * find.
 */
import type { BundleContext, ContentBundle, ExampleProject, TargetFacts } from '@msm/plugin-api';
import { kindsOf } from '../content/bundle';
import { PROBE_CONTEXT } from '../content/probe';

/** The element tag of an example category: lower case, spaces as hyphens. */
export function categoryTag(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export interface ExampleInput {
  id: string;
  title: string;
  description: string;
  kind: string;
  category: string;
  tags?: string[];
  build(context: BundleContext): ContentBundle;
  /** The targets the example works on; omitted means every target (ADR 0036 D4). */
  supports?(target: TargetFacts): boolean;
}

/**
 * An example entry. Its bundle's elements gain the meta tags `example` and the category tag
 * (kept when already present).
 */
export function defineExample(input: ExampleInput): ExampleProject {
  const elementTags = ['example', categoryTag(input.category)];
  const build = (context: BundleContext): ContentBundle => {
    const bundle = input.build(context);
    return {
      elements: bundle.elements.map((entry) => ({
        ...entry,
        tags: [...new Set([...(entry.tags ?? []), ...elementTags])],
      })),
      assets: bundle.assets,
    };
  };
  const entry: ExampleProject = {
    id: input.id,
    title: input.title,
    description: input.description,
    kind: input.kind,
    category: input.category,
    requiresKinds: kindsOf(build(PROBE_CONTEXT)).sort(),
    build,
  };
  if (input.tags !== undefined) entry.tags = [...input.tags];
  if (input.supports !== undefined) entry.supports = input.supports;
  return Object.freeze(entry);
}
