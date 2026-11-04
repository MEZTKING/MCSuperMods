/**
 * Cross-element checks of the worldgen chain (ADR 0022 D8). Every validator is pure and reads
 * only the project's elements and the target's facts; vanilla content is not visible, so the
 * checks compare project elements with each other. Codes:
 *
 * - `worldgen.feature-order` (error): a placed feature in different decoration steps in two
 *   project biomes, or placed features whose order within one step forms a cycle across
 *   project biomes (two biomes listing two features in opposite order is the simplest case).
 *   This is the class of the game's "Feature order cycle" crash.
 * - `worldgen.biome-unreachable` (warning): a project biome named by no biome source of a
 *   project dimension or world preset.
 * - `worldgen.preset-not-selectable` (info): a project world preset in neither the
 *   `minecraft:normal` nor the `minecraft:extended` world preset tag of the project.
 * - `worldgen.preset-missing-overworld` (error): a world preset without a
 *   `minecraft:overworld` dimension. The game requires only the overworld; the nether and the
 *   end may be left out.
 * - `worldgen.placed-feature-unused` (info): a project placed feature that no other project
 *   element names.
 */
import type { Element, Json, Problem, ProjectValidator, ResourceLocation } from '@msm/plugin-api';

const BIOME = 'minecraft:worldgen/biome';
const PLACED_FEATURE = 'minecraft:worldgen/placed_feature';
const DIMENSION = 'minecraft:dimension';
const WORLD_PRESET = 'minecraft:worldgen/world_preset';
const BIOME_TAG = 'minecraft:tag/worldgen/biome';
const WORLD_PRESET_TAG = 'minecraft:tag/worldgen/world_preset';

/** The world preset tags that the Create World screen offers (`#normal`, `#extended`). */
const SELECTABLE_PRESET_TAGS = ['minecraft:normal', 'minecraft:extended'] as const;
const OVERWORLD = 'minecraft:overworld';

type JsonRecord = { [key: string]: Json };

const isRecord = (value: Json | undefined): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `foo` becomes `minecraft:foo`; namespaced ids are returned unchanged. */
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

const ofKind = (elements: readonly Element[], kind: string): Element[] =>
  elements.filter((element) => element.kind === kind);

const list = (items: readonly string[]): string => items.map((item) => `"${item}"`).join(', ');

// ---------------------------------------------------------------------------------------------
// Feature order

/** One placed feature reference in a biome: `features[step][index]`. */
interface Occurrence {
  biome: ResourceLocation;
  step: number;
  index: number;
  feature: string;
}

/**
 * The placed feature ids each project biome lists per step, bounded by the target's step
 * count. Inline placed features and tag references (`#...`) carry no comparable id and are
 * skipped.
 */
function biomeSteps(biome: Element, stepCount: number): string[][] {
  const features = isRecord(biome.data) ? biome.data.features : undefined;
  if (!Array.isArray(features)) return [];
  return features
    .slice(0, stepCount)
    .map((step) =>
      Array.isArray(step)
        ? step.flatMap((entry) =>
            typeof entry === 'string' && !entry.startsWith('#') ? [namespaced(entry)] : [],
          )
        : [],
    );
}

/** Strongly connected components of a directed graph with more than one node or a self-loop. */
function cycles(
  nodes: readonly string[],
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of [...(edges.get(node) ?? [])].sort()) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) as number, low.get(next) as number));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) as number, index.get(next) as number));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop() as string;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || edges.get(node)?.has(node) === true) found.push(component.sort());
    }
  };
  for (const node of nodes) if (!index.has(node)) visit(node);
  return found;
}

function featureOrder(elements: readonly Element[], steps: readonly string[]): Problem[] {
  const problems: Problem[] = [];
  const biomes = ofKind(elements, BIOME).map((biome) => ({
    id: biome.id,
    steps: biomeSteps(biome, steps.length),
  }));
  const stepName = (step: number): string => steps[step] ?? String(step);

  // 1. The same placed feature in different steps: reported once for every occurrence whose
  //    step differs from the feature's first occurrence (in element order).
  const byFeature = new Map<string, Occurrence[]>();
  for (const biome of biomes) {
    biome.steps.forEach((features, step) => {
      features.forEach((feature, index) => {
        const entry = byFeature.get(feature) ?? [];
        entry.push({ biome: biome.id, step, index, feature });
        byFeature.set(feature, entry);
      });
    });
  }
  for (const [feature, occurrences] of [...byFeature].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const first = occurrences[0] as Occurrence;
    for (const occurrence of occurrences) {
      if (occurrence.step === first.step) continue;
      problems.push({
        severity: 'error',
        code: 'worldgen.feature-order',
        elementId: occurrence.biome,
        path: `/features/${occurrence.step}/${occurrence.index}`,
        message: `Placed feature "${feature}" is in step "${stepName(occurrence.step)}" here but in step "${stepName(first.step)}" in biome "${first.biome}". A placed feature must use the same step in every biome, or the game stops with "Feature order cycle".`,
      });
    }
  }

  // 2. Order within a step: consecutive features of every biome are edges; a cycle means no
  //    order satisfies every biome.
  for (let step = 0; step < steps.length; step += 1) {
    const edges = new Map<string, Set<string>>();
    const edgeOwners = new Map<string, Set<string>>();
    const nodes = new Set<string>();
    for (const biome of biomes) {
      const features = biome.steps[step] ?? [];
      features.forEach((feature, position) => {
        nodes.add(feature);
        const next = features[position + 1];
        if (next === undefined) return;
        const targets = edges.get(feature) ?? new Set<string>();
        targets.add(next);
        edges.set(feature, targets);
        const key = `${feature}\n${next}`;
        const owners = edgeOwners.get(key) ?? new Set<string>();
        owners.add(biome.id);
        edgeOwners.set(key, owners);
      });
    }
    for (const component of cycles([...nodes].sort(), edges)) {
      const members = new Set(component);
      const involved = new Set<string>();
      for (const [key, owners] of edgeOwners) {
        const [from, to] = key.split('\n') as [string, string];
        if (members.has(from) && members.has(to)) for (const owner of owners) involved.add(owner);
      }
      const ordered = biomes.map((biome) => biome.id).filter((id) => involved.has(id));
      const reported = ordered[ordered.length - 1] as ResourceLocation;
      problems.push({
        severity: 'error',
        code: 'worldgen.feature-order',
        elementId: reported,
        path: `/features/${step}`,
        message: `Placed features ${list(component)} are listed in conflicting orders in step "${stepName(step)}" by ${ordered.length === 1 ? 'this biome' : `biomes ${list(ordered)}`}. Every biome must list shared placed features in the same order, or the game stops with "Feature order cycle".`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Biome reachability

/** Tag entries: `"id"`, `"#tag"` or `{ "id": ..., "required": ... }`. */
function tagValues(tag: Element | undefined): string[] {
  const values = isRecord(tag?.data) ? tag.data.values : undefined;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (typeof value === 'string') return [value];
    if (isRecord(value) && typeof value.id === 'string') return [value.id];
    return [];
  });
}

/** Resolves `#tag` references against the project's tags of one kind, following nested tags. */
function expandTag(
  elements: readonly Element[],
  tagKind: string,
  reference: string,
  seen: Set<string> = new Set(),
): string[] {
  if (!reference.startsWith('#')) return [namespaced(reference)];
  const id = namespaced(reference.slice(1));
  if (seen.has(id)) return [];
  seen.add(id);
  const tag = elements.find((element) => element.kind === tagKind && element.id === id);
  return tagValues(tag).flatMap((value) => expandTag(elements, tagKind, value, seen));
}

/** Every biome a generator's biome source names (`biome`, `biomes` lists, entries or tags). */
function generatorBiomes(generator: Json | undefined, elements: readonly Element[]): string[] {
  const found: string[] = [];
  const visit = (value: Json | undefined, key: string | undefined): void => {
    if (typeof value === 'string') {
      if (key === 'biome' || key === 'biomes') found.push(...expandTag(elements, BIOME_TAG, value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key === 'biomes' ? 'biomes' : undefined);
      return;
    }
    if (isRecord(value)) for (const [child, inner] of Object.entries(value)) visit(inner, child);
  };
  visit(generator, undefined);
  return found;
}

function reachableBiomes(elements: readonly Element[]): Set<string> {
  const reachable = new Set<string>();
  const addDimension = (dimension: Json | undefined): void => {
    if (!isRecord(dimension)) return;
    for (const biome of generatorBiomes(dimension.generator, elements)) reachable.add(biome);
  };
  for (const dimension of ofKind(elements, DIMENSION)) addDimension(dimension.data);
  for (const preset of ofKind(elements, WORLD_PRESET)) {
    const dimensions = isRecord(preset.data) ? preset.data.dimensions : undefined;
    if (isRecord(dimensions))
      for (const dimension of Object.values(dimensions)) addDimension(dimension);
  }
  return reachable;
}

function biomeReachability(elements: readonly Element[]): Problem[] {
  const reachable = reachableBiomes(elements);
  return ofKind(elements, BIOME)
    .filter((biome) => !reachable.has(biome.id))
    .map((biome) => ({
      severity: 'warning' as const,
      code: 'worldgen.biome-unreachable',
      elementId: biome.id,
      message: `Biome "${biome.id}" is not in the biome source of any dimension or world preset of this project, so it never generates. Add it to a world preset's overworld (World Type) or to a dimension.`,
    }));
}

// ---------------------------------------------------------------------------------------------
// World presets

function presetTags(elements: readonly Element[]): Problem[] {
  const selectable = new Set(
    SELECTABLE_PRESET_TAGS.flatMap((tag) => expandTag(elements, WORLD_PRESET_TAG, `#${tag}`)),
  );
  return ofKind(elements, WORLD_PRESET)
    .filter((preset) => !selectable.has(preset.id))
    .map((preset) => ({
      severity: 'info' as const,
      code: 'worldgen.preset-not-selectable',
      elementId: preset.id,
      message: `World preset "${preset.id}" is not in the "minecraft:normal" or "minecraft:extended" world preset tag, so it does not appear under World Type. Add a world preset tag "minecraft:normal" listing it.`,
    }));
}

function presetOverworld(elements: readonly Element[]): Problem[] {
  return ofKind(elements, WORLD_PRESET).flatMap((preset): Problem[] => {
    const dimensions = isRecord(preset.data) ? preset.data.dimensions : undefined;
    const keys = isRecord(dimensions) ? Object.keys(dimensions).map(namespaced) : [];
    if (keys.includes(OVERWORLD)) return [];
    return [
      {
        severity: 'error',
        code: 'worldgen.preset-missing-overworld',
        elementId: preset.id,
        path: '/dimensions',
        message: `World preset "${preset.id}" has no "${OVERWORLD}" dimension; the game rejects a world preset without one.`,
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------------
// Unused placed features

/** Every string in `value`, as a namespaced id (tags keep their `#`). */
function strings(value: Json, into: Set<string>): void {
  if (typeof value === 'string') {
    into.add(value.startsWith('#') ? `#${namespaced(value.slice(1))}` : namespaced(value));
  } else if (Array.isArray(value)) {
    for (const item of value) strings(item, into);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) strings(item, into);
  }
}

function placedFeatureUsage(elements: readonly Element[]): Problem[] {
  const placed = ofKind(elements, PLACED_FEATURE);
  if (placed.length === 0) return [];
  const named = new Map<string, Set<string>>();
  for (const element of elements) {
    const into = new Set<string>();
    strings(element.data, into);
    named.set(`${element.kind}\n${element.id}`, into);
  }
  return placed
    .filter(
      (feature) =>
        !elements.some(
          (element) =>
            !(element.kind === PLACED_FEATURE && element.id === feature.id) &&
            named.get(`${element.kind}\n${element.id}`)?.has(feature.id) === true,
        ),
    )
    .map((feature) => ({
      severity: 'info' as const,
      code: 'worldgen.placed-feature-unused',
      elementId: feature.id,
      message: `Placed feature "${feature.id}" is not used by any biome or other element of this project, so it only generates if a vanilla file or another pack names it.`,
    }));
}

// ---------------------------------------------------------------------------------------------

/** Kinds whose elements can name a placed feature (biomes, features, tags, template pools). */
const PLACED_FEATURE_USERS = [
  BIOME,
  PLACED_FEATURE,
  'minecraft:worldgen/feature',
  'minecraft:tag/worldgen/placed_feature',
  'minecraft:worldgen/template_pool',
] as const;

/** The worldgen validators, in a stable order. */
export const worldgenValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.worldgen.feature-order',
    kinds: [BIOME],
    validate: ({ elements, target }) => featureOrder(elements, target.worldgen.featureSteps),
  },
  {
    id: 'msm.worldgen.biome-reachability',
    kinds: [BIOME, DIMENSION, WORLD_PRESET, BIOME_TAG],
    validate: ({ elements }) => biomeReachability(elements),
  },
  {
    id: 'msm.worldgen.preset-selectable',
    kinds: [WORLD_PRESET, WORLD_PRESET_TAG],
    validate: ({ elements }) => presetTags(elements),
  },
  {
    id: 'msm.worldgen.preset-overworld',
    kinds: [WORLD_PRESET],
    validate: ({ elements }) => presetOverworld(elements),
  },
  {
    id: 'msm.worldgen.placed-feature-usage',
    kinds: [...PLACED_FEATURE_USERS],
    validate: ({ elements }) => placedFeatureUsage(elements),
  },
] satisfies ProjectValidator[]);

/** The problem codes the validators report. */
export const WORLDGEN_PROBLEM_CODES = Object.freeze([
  'worldgen.feature-order',
  'worldgen.biome-unreachable',
  'worldgen.preset-not-selectable',
  'worldgen.preset-missing-overworld',
  'worldgen.placed-feature-unused',
] as const);
