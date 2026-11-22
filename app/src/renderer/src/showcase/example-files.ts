/**
 * A library example as the files a showcase clip plays (ADR 0118 D2, D5; B566): the example is
 * built for the namespace `showcase`, laid over an empty project with `bundlePreviewProject`
 * and lowered in memory with the plugins' project expanders (so Rules compile as on export),
 * then turned into Try it's `SimFiles`.
 *
 * - The bundle is lowered **without** the Creator's `withTypedBlockModels`: the typed blocks
 *   lower their own model files, and the extra model elements only make lowering conflicts
 *   (B565 Z1: 53 for the wood set).
 * - Textures are not in the lowered files, so the bundle is kept with them for
 *   {@link ExampleFiles.readAsset} (`bundleAssetReader`).
 * - Each example is built once per target in a session: the result (a Promise, so two cards
 *   asking at once share it) is cached by example id and target id.
 *
 * @packageDocumentation
 */

import {
  createEmptyProject,
  type ElementKindRegistry,
  lowerProjectAsync,
  type Problem,
} from '@msm/core';
import type { ContentBundle, ExampleProject, Plugin, Target } from '@msm/plugin-api';
import type { RuleBookInfo, SimFiles } from '@msm/sim';
import { bundleAssetReader, bundlePreviewProject } from '../preview/bundle-source';
import { ruleBooksOf, toSimFiles } from '../tryit/session-source';
import { type ClipIds, SHOWCASE_NAMESPACE } from './clip';

/** What lowering an example needs: the session's kind registry and the plugins to expand with. */
export interface ExampleFilesDeps {
  readonly registry: ElementKindRegistry;
  readonly plugins: readonly Plugin[];
}

/** One example, lowered for one target. */
export interface ExampleFiles {
  readonly exampleId: string;
  readonly target: Target;
  /** The built bundle (namespace `showcase`); its pictures are read by {@link readAsset}. */
  readonly bundle: ContentBundle;
  /** The lowered files as Try it reads them. */
  readonly files: SimFiles;
  /** The example's rule books, so the area names its rules. */
  readonly ruleBooks: readonly RuleBookInfo[];
  /** The example's own blocks and items (`showcase:` ids), for `validateClip`. */
  readonly ids: ClipIds & { readonly all: ReadonlySet<string> };
  /** Lowering's problems; none for a showcased example. */
  readonly problems: readonly Problem[];
  /** Reads a picture of the bundle (relative to `assets/<namespace>/`). */
  readonly readAsset: (namespace: string, path: string) => Promise<Uint8Array | null>;
}

const cache = new Map<string, Promise<ExampleFiles>>();

/** Forgets every cached example (tests). */
export function clearExampleFilesCache(): void {
  cache.clear();
}

/**
 * The example's files for `target`, built and lowered once per session. A failed build is not
 * kept, so a later call tries again.
 */
export function exampleFiles(
  example: ExampleProject,
  target: Target,
  deps: ExampleFilesDeps,
): Promise<ExampleFiles> {
  const key = `${example.id}\u0000${target.id}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = buildExampleFiles(example, target, deps);
  cache.set(key, made);
  made.catch(() => {
    if (cache.get(key) === made) cache.delete(key);
  });
  return made;
}

async function buildExampleFiles(
  example: ExampleProject,
  target: Target,
  deps: ExampleFilesDeps,
): Promise<ExampleFiles> {
  const bundle = await example.build({
    namespace: SHOWCASE_NAMESPACE,
    projectName: SHOWCASE_NAMESPACE,
    target,
    values: {},
  });
  const project = bundlePreviewProject(createEmptyProject(SHOWCASE_NAMESPACE), bundle);
  const lowered = await lowerProjectAsync(project, deps.registry, target, {
    plugins: [...deps.plugins],
  });
  const files = toSimFiles(lowered.files);
  const all = idsOf(files);
  return {
    exampleId: example.id,
    target,
    bundle,
    files,
    ruleBooks: ruleBooksOf(project),
    ids: { all, has: (id) => all.has(id) },
    problems: lowered.problems,
    readAsset: bundleAssetReader(bundle, async () => null),
  };
}

const OWN_PATH = new RegExp(
  `^assets/${SHOWCASE_NAMESPACE}/(?:blockstates|items)/([a-z0-9_./-]+)\\.json$`,
);

/** The `showcase:` blocks (block state files) and items (item definitions) of the files. */
export function idsOf(files: SimFiles): Set<string> {
  const out = new Set<string>();
  for (const path of files.keys()) {
    const match = OWN_PATH.exec(path);
    if (match !== null) out.add(`${SHOWCASE_NAMESPACE}:${match[1]}`);
  }
  return out;
}
