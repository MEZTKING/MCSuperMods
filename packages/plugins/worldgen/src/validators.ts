/**
 * Cross-element checks of the worldgen chain (ADR 0022 D8). Every validator is pure and reads
 * only the project's elements and the target's facts; vanilla content is not visible, so the
 * checks compare project elements with each other. Codes:
 *
 * - `worldgen.feature-order` (error): placed features whose order within one decoration step
 *   forms a cycle across project biomes (two biomes listing two features in opposite order is
 *   the simplest case; a feature listed twice in one step is a cycle too). This is the class of
 *   the game's "Feature order cycle" crash. The game's sorter (`FeatureSorter`) makes one graph
 *   node per (step, feature) pair and an edge for each consecutive pair of a biome's features
 *   across all its steps; steps only increase along a biome's list, so a cycle can only form
 *   inside one step, and a feature listed in different steps is legal.
 * - `worldgen.vanilla-feature-order` (warning, ADR 0097 D2): with the target's
 *   `worldgen.vanillaFeatureOrder`, two vanilla placed features in one step of a project biome
 *   listed against vanilla's order, or project biomes whose lists, joined with vanilla's order,
 *   form a loop no project biome forms alone. A world holding these biomes and vanilla biomes
 *   stops with "Feature order cycle"; a dimension of project biomes only does not, so it is a
 *   warning. Skipped when the target has no such fact.
 * - `worldgen.feature-step-differs` (warning): the same placed feature in different decoration
 *   steps in two project biomes. The game accepts it, but the feature runs at a different point
 *   of decoration and with a different placement seed in those biomes, which is usually a
 *   mistake.
 *
 *   Both checks treat an id without a namespace as `minecraft:`, as the game does, so `oak` and
 *   `minecraft:oak` are the same feature.
 * - `worldgen.biome-unreachable` (warning): a project biome named by no biome source of a
 *   project dimension or world preset.
 * - `worldgen.preset-not-selectable` (info): a project world preset in neither the
 *   `minecraft:normal` nor the `minecraft:extended` world preset tag of the project.
 * - `worldgen.preset-missing-overworld` (error): a world preset without a
 *   `minecraft:overworld` dimension. The game requires only the overworld; the nether and the
 *   end may be left out.
 * - `worldgen.placed-feature-unused` (info): a project placed feature that no other project
 *   element names.
 *
 * Dimension types (ADR 0100 D3), for every `minecraft:dimension_type` element and every
 * dimension type written inline in a project dimension's `type`:
 *
 * - `worldgen.dimension-height-multiple` (error): `min_y` or `height` is not a whole multiple
 *   of the target's `worldgen.dimensionHeight.step` (16).
 * - `worldgen.dimension-height-range` (error): `min_y` below the target's lowest, `height`
 *   below one step, or the top (`min_y + height - 1`) above the target's highest block y.
 * - `worldgen.dimension-logical-height` (error): `logical_height` above `height`.
 * - `worldgen.dimension-attribute-unknown` (error): an `attributes` key the target's
 *   `worldgen.environmentAttributes` does not list; the game refuses the whole data pack.
 * - `worldgen.dimension-attribute-mod-particle` (info): an attribute names a project particle
 *   type (`msm:particle`), so vanilla data packs leave the file out (ADR 0066, ADR 0080 D10).
 *
 * The height checks are skipped on a target without `dimensionHeight`, the attribute check on
 * one without `environmentAttributes`; values the schema rejects (not numbers) are left to it.
 */
import type {
  Element,
  Json,
  Problem,
  ProjectValidator,
  ResourceLocation,
  TargetFacts,
} from '@msm/plugin-api';

const BIOME = 'minecraft:worldgen/biome';
const PLACED_FEATURE = 'minecraft:worldgen/placed_feature';
const DIMENSION = 'minecraft:dimension';
const WORLD_PRESET = 'minecraft:worldgen/world_preset';
const BIOME_TAG = 'minecraft:tag/worldgen/biome';
const WORLD_PRESET_TAG = 'minecraft:tag/worldgen/world_preset';
const DIMENSION_TYPE = 'minecraft:dimension_type';
const PARTICLE = 'msm:particle';

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

function featureOrder(
  elements: readonly Element[],
  steps: readonly string[],
  vanillaOrder: Readonly<Record<string, readonly string[]>> | undefined,
): Problem[] {
  const problems: Problem[] = [];
  const biomes = ofKind(elements, BIOME).map((biome) => ({
    id: biome.id,
    steps: biomeSteps(biome, steps.length),
  }));
  const stepName = (step: number): string => steps[step] ?? String(step);

  // 1. The same placed feature in different steps: legal (the game's sort nodes are
  //    (step, feature) pairs), so a warning once for every occurrence whose step differs from
  //    the feature's first occurrence (in element order).
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
        severity: 'warning',
        code: 'worldgen.feature-step-differs',
        elementId: occurrence.biome,
        path: `/features/${occurrence.step}/${occurrence.index}`,
        message: `Placed feature "${feature}" is in step "${stepName(occurrence.step)}" here but in step "${stepName(first.step)}" in biome "${first.biome}". The game accepts this, but the feature runs at a different point of decoration and with a different placement seed in these biomes, which is usually a mistake.`,
      });
    }
  }

  // 2. Order within a step: consecutive features of every biome are edges; a cycle means no
  //    order satisfies every biome and the game stops with "Feature order cycle". Edges across
  //    steps cannot close a cycle, so each step is checked on its own.
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
    const vanilla = vanillaOrder?.[stepName(step)];
    if (vanilla !== undefined && vanilla.length > 0) {
      problems.push(...vanillaStepOrder(biomes, step, stepName(step), vanilla, edges, edgeOwners));
    }
  }
  return problems;
}

/**
 * Vanilla's order in one step (ADR 0097 D2). First every pair of vanilla placed features a
 * project biome lists against `vanilla` (adjacent within the biome's vanilla features, so each
 * inversion is reported once). Then the project's edges joined with vanilla's order between
 * the vanilla features the project uses: a loop that neither a single inverted pair nor the
 * project's own lists explain, which only a project feature between vanilla ones can close.
 */
function vanillaStepOrder(
  biomes: readonly { id: ResourceLocation; steps: string[][] }[],
  step: number,
  name: string,
  vanilla: readonly string[],
  edges: ReadonlyMap<string, ReadonlySet<string>>,
  edgeOwners: ReadonlyMap<string, ReadonlySet<string>>,
): Problem[] {
  const problems: Problem[] = [];
  const position = new Map(vanilla.map((id, index) => [id, index] as const));
  const explained: [string, string][] = [];
  const used = new Set<string>();
  for (const biome of biomes) {
    const features = biome.steps[step] ?? [];
    let previous: string | undefined;
    features.forEach((feature, index) => {
      const at = position.get(feature);
      if (at === undefined) return;
      used.add(feature);
      if (previous !== undefined && (position.get(previous) as number) > at) {
        explained.push([previous, feature]);
        problems.push({
          severity: 'warning',
          code: 'worldgen.vanilla-feature-order',
          elementId: biome.id,
          path: `/features/${step}/${index}`,
          message: `Vanilla runs "${feature}" before "${previous}" in step "${name}"; a world with this biome and vanilla biomes stops with "Feature order cycle". Swap them.`,
        });
      }
      if (previous !== feature) previous = feature;
    });
  }
  // The project's edges plus vanilla's chain over the vanilla features the project uses.
  const chain = vanilla.filter((id) => used.has(id));
  if (chain.length < 2) return problems;
  const joined = new Map<string, Set<string>>();
  const nodes = new Set<string>();
  for (const [from, targets] of edges) {
    nodes.add(from);
    for (const to of targets) nodes.add(to);
    joined.set(from, new Set(targets));
  }
  chain.forEach((id, index) => {
    const next = chain[index + 1];
    if (next === undefined) return;
    const targets = joined.get(id) ?? new Set<string>();
    targets.add(next);
    joined.set(id, targets);
  });
  for (const id of chain) nodes.add(id);
  const projectCycles = cycles([...nodes].sort(), edges).map((component) => new Set(component));
  for (const component of cycles([...nodes].sort(), joined)) {
    const members = new Set(component);
    // Already an error (the project's own lists loop) or an inverted pair reported above.
    if (projectCycles.some((own) => [...own].every((id) => members.has(id)))) continue;
    if (explained.some(([a, b]) => members.has(a) && members.has(b))) continue;
    const involved = new Set<string>();
    for (const [key, owners] of edgeOwners) {
      const [from, to] = key.split('\n') as [string, string];
      if (members.has(from) && members.has(to)) for (const owner of owners) involved.add(owner);
    }
    const ordered = biomes.map((biome) => biome.id).filter((id) => involved.has(id));
    const reported = ordered[ordered.length - 1];
    if (reported === undefined) continue;
    problems.push({
      severity: 'warning',
      code: 'worldgen.vanilla-feature-order',
      elementId: reported,
      path: `/features/${step}`,
      message: `Placed features ${list(component)} in step "${name}" are listed by ${ordered.length === 1 ? 'this biome' : `biomes ${list(ordered)}`} in an order that loops with vanilla's own order; a world with these biomes and vanilla biomes stops with "Feature order cycle". Keep vanilla features in vanilla's order around your own.`,
    });
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
// Dimension types (ADR 0100 D3)

/** One dimension type to check: its element, its data and where it sits in the element. */
interface DimensionTypeAt {
  elementId: ResourceLocation;
  data: JsonRecord;
  /** JSON pointer of the dimension type in the element: empty, or `/type` when inline. */
  base: string;
}

/** The project's dimension types: `minecraft:dimension_type` elements and inline `type`s. */
function dimensionTypes(elements: readonly Element[]): DimensionTypeAt[] {
  const found: DimensionTypeAt[] = [];
  for (const element of elements) {
    if (element.kind === DIMENSION_TYPE && isRecord(element.data)) {
      found.push({ elementId: element.id, data: element.data, base: '' });
    } else if (element.kind === DIMENSION && isRecord(element.data)) {
      const inline = element.data.type;
      if (isRecord(inline)) found.push({ elementId: element.id, data: inline, base: '/type' });
    }
  }
  return found;
}

const isInteger = (value: Json | undefined): value is number =>
  typeof value === 'number' && Number.isInteger(value);

/** JSON pointer escaping of one key (`~` and `/`). */
const pointerKey = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

function dimensionHeights(elements: readonly Element[], target: TargetFacts): Problem[] {
  const bounds = target.worldgen.dimensionHeight;
  if (bounds === undefined) return [];
  const { minY, maxY, step } = bounds;
  const problems: Problem[] = [];
  for (const { elementId, data, base } of dimensionTypes(elements)) {
    const { min_y: low, height, logical_height: logical } = data;
    for (const [key, value] of [
      ['min_y', low],
      ['height', height],
    ] as const) {
      if (isInteger(value) && value % step !== 0) {
        problems.push({
          severity: 'error',
          code: 'worldgen.dimension-height-multiple',
          elementId,
          path: `${base}/${key}`,
          message: `${key} is ${value}; it must be a whole multiple of ${step} (for example ${Math.round(value / step) * step}), or the game refuses the dimension type.`,
        });
      }
    }
    if (isInteger(low) && low < minY) {
      problems.push({
        severity: 'error',
        code: 'worldgen.dimension-height-range',
        elementId,
        path: `${base}/min_y`,
        message: `min_y is ${low}; the lowest the game allows is ${minY}.`,
      });
    }
    if (isInteger(height) && height < step) {
      problems.push({
        severity: 'error',
        code: 'worldgen.dimension-height-range',
        elementId,
        path: `${base}/height`,
        message: `height is ${height}; a dimension is at least ${step} blocks high.`,
      });
    } else if (isInteger(low) && isInteger(height) && low + height - 1 > maxY) {
      problems.push({
        severity: 'error',
        code: 'worldgen.dimension-height-range',
        elementId,
        path: `${base}/height`,
        message: `min_y ${low} and height ${height} put the top at y ${low + height - 1}; the highest the game allows is y ${maxY}, so the height can be at most ${Math.max(step, Math.floor((maxY + 1 - low) / step) * step)}.`,
      });
    }
    if (isInteger(logical) && isInteger(height) && logical > height) {
      problems.push({
        severity: 'error',
        code: 'worldgen.dimension-logical-height',
        elementId,
        path: `${base}/logical_height`,
        message: `logical_height is ${logical}, above the height ${height}; it may not be more than the height.`,
      });
    }
  }
  return problems;
}

/** Every namespaced string in `value`, for the project particle check. */
function namespacedStrings(value: Json, into: Set<string>): void {
  if (typeof value === 'string') {
    // A project particle has its own namespace; bare ids are vanilla's.
    if (value.includes(':')) into.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) namespacedStrings(item, into);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) namespacedStrings(item, into);
  }
}

function dimensionAttributes(elements: readonly Element[], target: TargetFacts): Problem[] {
  const known =
    target.worldgen.environmentAttributes === undefined
      ? undefined
      : new Set(target.worldgen.environmentAttributes);
  const particles = new Set<string>(
    ofKind(elements, PARTICLE)
      .map((particle) => particle.id)
      .filter((id) => !id.startsWith('minecraft:')),
  );
  const problems: Problem[] = [];
  for (const { elementId, data, base } of dimensionTypes(elements)) {
    const { attributes } = data;
    if (!isRecord(attributes)) continue;
    for (const [key, value] of Object.entries(attributes)) {
      const path = `${base}/attributes/${pointerKey(key)}`;
      if (known !== undefined && !known.has(namespaced(key))) {
        problems.push({
          severity: 'error',
          code: 'worldgen.dimension-attribute-unknown',
          elementId,
          path,
          message: `"${key}" is not an environment attribute of this Minecraft version; the game refuses the whole data pack. Remove it or pick one the Dimension Type Studio lists.`,
        });
      }
      if (particles.size === 0) continue;
      const named = new Set<string>();
      namespacedStrings(value, named);
      const used = [...named].filter((id) => particles.has(id)).sort();
      if (used.length > 0) {
        problems.push({
          severity: 'info',
          code: 'worldgen.dimension-attribute-mod-particle',
          elementId,
          path,
          message: `"${key}" names your particle ${list(used)}, which only the Fabric mod jar adds, so vanilla data packs leave this dimension type out (a vanilla server would refuse the whole pack). Use a vanilla particle to keep it in vanilla packs.`,
        });
      }
    }
  }
  return problems;
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
    validate: ({ elements, target }) =>
      featureOrder(elements, target.worldgen.featureSteps, target.worldgen.vanillaFeatureOrder),
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
  {
    id: 'msm.worldgen.dimension-height',
    kinds: [DIMENSION_TYPE, DIMENSION],
    validate: ({ elements, target }) => dimensionHeights(elements, target),
  },
  {
    id: 'msm.worldgen.dimension-attributes',
    kinds: [DIMENSION_TYPE, DIMENSION, PARTICLE],
    validate: ({ elements, target }) => dimensionAttributes(elements, target),
  },
] satisfies ProjectValidator[]);

/** The problem codes the validators report. */
export const WORLDGEN_PROBLEM_CODES = Object.freeze([
  'worldgen.feature-order',
  'worldgen.vanilla-feature-order',
  'worldgen.feature-step-differs',
  'worldgen.biome-unreachable',
  'worldgen.preset-not-selectable',
  'worldgen.preset-missing-overworld',
  'worldgen.placed-feature-unused',
  'worldgen.dimension-height-multiple',
  'worldgen.dimension-height-range',
  'worldgen.dimension-logical-height',
  'worldgen.dimension-attribute-unknown',
  'worldgen.dimension-attribute-mod-particle',
] as const);
