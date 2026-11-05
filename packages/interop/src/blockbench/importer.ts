/**
 * The Blockbench importer (ADR 0029 D3), registered by the app as a host importer.
 *
 * Dispatches on the file name's suffix: `.bbmodel` is converted with {@link convertBbmodel};
 * `.geo.json` and `.animation.json` (or `.animations.json`) pass through after a format check;
 * any other `.json` is refused with `blockbench.not-a-model`. A `.bbmodel` yields:
 *
 * - one `msm:geo_model` element `<ns>:entity/<name>`;
 * - one `msm:animation` element `<ns>:entity/<name>_animations` when the file has animations;
 * - texture assets `textures/entity/<name>.png`, or `textures/entity/<name>_<n>.png` (`n` the
 *   texture's index in the file) when it embeds several;
 * - the original file as the asset `blockbench/<name>.bbmodel` (`application/octet-stream`),
 *   which the exporters skip.
 */
import type {
  Element,
  ImportedFile,
  Importer,
  ImportResult,
  Json,
  Problem,
  ResourceLocation,
} from '@msm/plugin-api';
import { cleanModelName, convertBbmodel } from './convert';
import { checkAnimationJson, checkGeoJson } from './passthrough';
import { ANIMATION_KIND, GEO_MODEL_KIND } from './types';

/** Which kind of Blockbench file a name denotes. */
export type BlockbenchFileType = 'bbmodel' | 'geo' | 'animation' | 'other';

const SUFFIXES: readonly [string, BlockbenchFileType][] = [
  ['.bbmodel', 'bbmodel'],
  ['.geo.json', 'geo'],
  ['.animation.json', 'animation'],
  ['.animations.json', 'animation'],
];

/**
 * Classifies a file by its full suffix and returns the model name before it.
 *
 * @param fileName - For example `Ruby Golem.geo.json`.
 * @returns For example `{ type: 'geo', name: 'ruby_golem' }`.
 */
export function blockbenchFileType(fileName: string): { type: BlockbenchFileType; name: string } {
  const base = fileName.replace(/^.*[\\/]/, '');
  const lower = base.toLowerCase();
  for (const [suffix, type] of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length > suffix.length) {
      return { type, name: cleanModelName(base.slice(0, -suffix.length)) };
    }
  }
  const dot = base.lastIndexOf('.');
  return { type: 'other', name: cleanModelName(dot > 0 ? base.slice(0, dot) : base) };
}

/** Options for {@link createBlockbenchImporter}. */
export interface BlockbenchImporterOptions {
  /** Returns the `meta.createdAt` timestamp; the current time by default. */
  now?: () => string;
}

function animationElementName(name: string): string {
  return name.endsWith('_animations') ? name : `${name}_animations`;
}

function element(id: ResourceLocation, kind: string, data: Json, createdAt: string): Element {
  return { formatVersion: 1, id, kind, data, meta: { createdAt } };
}

function failure(file: ImportedFile, code: string, message: string): ImportResult {
  return {
    elements: [],
    assets: [],
    problems: [{ severity: 'error', code, message, file: file.name }],
  };
}

function parseJson(file: ImportedFile): { ok: true; json: Json } | { ok: false; error: string } {
  try {
    return { ok: true, json: JSON.parse(new TextDecoder().decode(file.bytes)) as Json };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Imports one Blockbench file. Never throws.
 *
 * @param file - The file.
 * @param namespace - The namespace of the new elements and assets.
 * @param options - See {@link BlockbenchImporterOptions}.
 * @returns The elements, assets and `blockbench.*` problems.
 */
export function importBlockbenchFile(
  file: ImportedFile,
  namespace: string,
  options: BlockbenchImporterOptions = {},
): ImportResult {
  const { type, name } = blockbenchFileType(file.name);
  if (type === 'other') {
    return failure(
      file,
      'blockbench.not-a-model',
      `${file.name} is not a Blockbench model: expected .bbmodel, .geo.json or .animation.json.`,
    );
  }
  const parsed = parseJson(file);
  if (!parsed.ok) {
    return failure(file, 'blockbench.invalid-json', `${file.name} is not valid JSON: ${parsed.error}`);
  }
  const createdAt = (options.now ?? (() => new Date().toISOString()))();
  const geoId = `${namespace}:entity/${name}` as ResourceLocation;
  const animationId = `${namespace}:entity/${animationElementName(name)}` as ResourceLocation;
  const withFile = (problems: Problem[], elementId?: ResourceLocation): Problem[] =>
    problems.map((problem) => ({
      ...problem,
      file: file.name,
      ...(elementId && problem.elementId === undefined ? { elementId } : {}),
    }));

  if (type === 'geo') {
    const result = checkGeoJson(parsed.json);
    return {
      elements: result.data ? [element(geoId, GEO_MODEL_KIND, result.data, createdAt)] : [],
      assets: [],
      problems: withFile(result.problems, result.data ? geoId : undefined),
    };
  }
  if (type === 'animation') {
    const result = checkAnimationJson(parsed.json);
    return {
      elements: result.data ? [element(animationId, ANIMATION_KIND, result.data, createdAt)] : [],
      assets: [],
      problems: withFile(result.problems, result.data ? animationId : undefined),
    };
  }

  const conversion = convertBbmodel(parsed.json, { name });
  if (!conversion.geometry) {
    return { elements: [], assets: [], problems: withFile(conversion.problems) };
  }
  const elements: Element[] = [
    element(geoId, GEO_MODEL_KIND, conversion.geometry as unknown as Json, createdAt),
  ];
  if (conversion.animations) {
    elements.push(
      element(animationId, ANIMATION_KIND, conversion.animations as unknown as Json, createdAt),
    );
  }
  const several = conversion.textures.length > 1;
  const assets: ImportResult['assets'] = conversion.textures.map((texture) => ({
    asset: {
      path: `textures/entity/${several ? `${name}_${texture.index}` : name}.png`,
      mediaType: 'image/png',
    },
    bytes: texture.bytes,
  }));
  assets.push({
    asset: { path: `blockbench/${name}.bbmodel`, mediaType: 'application/octet-stream' },
    bytes: file.bytes,
  });
  return { elements, assets, problems: withFile(conversion.problems, geoId) };
}

/**
 * Creates the Blockbench importer. `extensions` lists `bbmodel` and `json`: the host matches on
 * the last extension, and `import()` checks the full suffix (`.geo.json`, `.animation.json`).
 *
 * @param options - See {@link BlockbenchImporterOptions}.
 */
export function createBlockbenchImporter(options: BlockbenchImporterOptions = {}): Importer {
  return {
    id: 'blockbench',
    displayName: 'Blockbench model (.bbmodel, .geo.json, .animation.json)',
    extensions: ['bbmodel', 'json'],
    import: async (file, namespace) => importBlockbenchFile(file, namespace, options),
  };
}

/** The Blockbench importer, stamping elements with the current time. */
export const blockbenchImporter: Importer = createBlockbenchImporter();
