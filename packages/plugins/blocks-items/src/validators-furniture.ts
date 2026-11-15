/**
 * `blocks-items.*` project validators of the furniture, light, sign and stem block types (ADR
 * 0094 D3, D11). They read the element data (editor fields still present), the target's particle
 * facts and the vanilla ids of the registry index:
 *
 * - `blocks-items.generated-block-clash` (error): a torch, sign, hanging sign or stem whose
 *   generated companion id (`<id>_wall`, `<id>_attached`; `blockGeneratedBlockIds`) is the id
 *   of a project element or of another block's companion. The runtime skips the element then.
 * - `blocks-items.stem-fruit-unknown` (error): a `stem` whose `fruit` is neither a project block
 *   nor a vanilla block, so the stem would never grow a fruit.
 * - `blocks-items.torch-particle-not-simple` (error): a `torch` whose `particle` is a vanilla
 *   particle type that takes options (the target's `particles.withOptions`, such as
 *   `minecraft:dust`): a torch's flame must be a type without options (vanilla's `TorchBlock`
 *   takes a `SimpleParticleType`), so the runtime refuses it. Project particle types have no
 *   options (ADR 0080 D1). Skipped for a target without particle facts.
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  TargetFacts,
  ValidationRegistry,
} from '@msm/plugin-api';
import { BLOCK_KIND } from './kinds';
import { isRecord } from './lowering/paths';
import { blockGeneratedBlockIds } from './lowering/types/companions';

/** Every code these validators report. */
export const FURNITURE_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.generated-block-clash',
  'blocks-items.stem-fruit-unknown',
  'blocks-items.torch-particle-not-simple',
]);

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
const typeOf = (data: JsonObject): string => text(data.type) ?? 'block';

const blocksOfType = (elements: readonly Element[], type: string) =>
  elements
    .filter((element) => element.kind === BLOCK_KIND && typeOf(dataOf(element)) === type)
    .map((element) => ({ element, data: dataOf(element) }));

function generatedBlockClashes(elements: readonly Element[]): Problem[] {
  const ids = new Set(elements.map((element) => element.id as string));
  const owners = new Map<string, string>();
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== BLOCK_KIND) continue;
    for (const companion of blockGeneratedBlockIds(element.id, element.data)) {
      const other = owners.get(companion);
      if (ids.has(companion)) {
        problems.push({
          severity: 'error',
          code: 'blocks-items.generated-block-clash',
          elementId: element.id,
          path: '/type',
          message: `This ${typeOf(dataOf(element)).replace('_', ' ')} registers a second block "${companion}", but the project already has an element with that id, so the game would load neither. Rename that element, or this one.`,
        });
      } else if (other !== undefined) {
        problems.push({
          severity: 'error',
          code: 'blocks-items.generated-block-clash',
          elementId: element.id,
          path: '/type',
          message: `This block registers a second block "${companion}", and "${other}" registers one with the same id. Rename one of them.`,
        });
      } else {
        owners.set(companion, element.id);
      }
    }
  }
  return problems;
}

function unknownStemFruits(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  const stems = blocksOfType(elements, 'stem');
  if (stems.length === 0) return [];
  const projectBlocks = new Set<string>();
  for (const element of elements) {
    if (element.kind !== BLOCK_KIND) continue;
    projectBlocks.add(element.id);
    for (const id of blockGeneratedBlockIds(element.id, element.data)) projectBlocks.add(id);
  }
  const vanillaKnown = registry.ids('block').length > 0;
  const problems: Problem[] = [];
  for (const { element, data } of stems) {
    const fruit = text(data.fruit);
    if (fruit === undefined) continue;
    const id = namespaced(fruit);
    if (projectBlocks.has(id) || !vanillaKnown || registry.has('block', id)) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.stem-fruit-unknown',
      elementId: element.id,
      path: '/fruit',
      message: `Fruit "${fruit}" is neither a block of this project nor a vanilla block, so the stem would never grow one. Pick a block, usually a block or horizontal block of this project.`,
    });
  }
  return problems;
}

function torchParticles(elements: readonly Element[], target: TargetFacts): Problem[] {
  const withOptions = target.particles?.withOptions;
  if (withOptions === undefined) return [];
  const problems: Problem[] = [];
  for (const { element, data } of blocksOfType(elements, 'torch')) {
    const particle = text(data.particle);
    if (particle === undefined || !withOptions.includes(namespaced(particle))) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.torch-particle-not-simple',
      elementId: element.id,
      path: '/particle',
      message: `Particle "${particle}" needs options (such as a colour), and a torch's flame must be a particle without options. Pick another particle, such as "${target.blocks?.defaultTorchParticle ?? 'minecraft:flame'}", or one of this project's particles.`,
    });
  }
  return problems;
}

/** The validators of the furniture, light, sign and stem types. */
export const furnitureValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.furniture',
    kinds: [BLOCK_KIND],
    validate: ({ elements, registry, target }) => [
      ...generatedBlockClashes(elements),
      ...unknownStemFruits(elements, registry),
      ...torchParticles(elements, target),
    ],
  },
] satisfies ProjectValidator[]);
