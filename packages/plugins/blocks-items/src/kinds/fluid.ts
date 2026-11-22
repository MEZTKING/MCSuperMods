/**
 * The `msm:fluid` kind (ADR 0099 D1): a project liquid, folder `fluid`, registry `fluid`. One
 * element registers the fluid (and on targets that register a liquid as two fluids also
 * `<ns>:flowing_<path>`), its liquid block under the element id and its bucket
 * `<ns>:<path>_bucket`; with `cauldron` and `bottle` (ADR 0108 D2, D3) also the block
 * `<ns>:<path>_cauldron` and the item `<ns>:<path>_bottle`.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerFluid } from '../lowering/fluid';

export {
  BOTTLE_FALLBACK_LAYERS,
  CAULDRON_BLOCK_TAGS,
  CAULDRON_PICTURES,
  CAULDRON_TEMPLATES,
  EMPTY_CAULDRON,
  FLUID_BOTTLE_SUFFIX,
  FLUID_CAULDRON_SUFFIX,
  fluidBottleId,
  fluidCauldronHasLevels,
  fluidCauldronId,
  fluidCompanionIds,
  hasFluidBottle,
  hasFluidCauldron,
  lowerCauldron,
  WATER_BOTTLE_COLOUR,
} from '../lowering/cauldron';

export {
  FLOWING_FLUID_PREFIX,
  FLUID_BUCKET_SUFFIX,
  FLUID_EDITOR_FIELDS,
  FLUID_FALLBACK_TEXTURES,
  FLUID_FLOW_DEFAULTS,
  FLUID_TAG_SCHEMA,
  type FluidBehaviour,
  type FluidFlowNumbers,
  type FluidTextureSlot,
  flowingFluidId,
  fluidBehaviourOf,
  fluidBlockModel,
  fluidBucketId,
  fluidDefinition,
  fluidFlowOf,
  fluidRegistryIds,
  fluidSpreadDistance,
  fluidTextureOf,
  fluidTextures,
  lowerFluid,
} from '../lowering/fluid';

/** Kind id of fluids (ADR 0099 D1). */
export const FLUID_KIND = 'msm:fluid';

/** The registry fluids belong to. */
export const FLUID_REGISTRY = 'fluid';

/**
 * Fluids (ADR 0099 D1). The default behaves like water, with vanilla water's pictures (named,
 * never bundled) tinted vanilla water's blue, so a new fluid looks and flows like water until
 * it is given its own pictures and numbers.
 */
export const fluidKind: ElementKind = {
  id: FLUID_KIND,
  schema: MSM_SCHEMA_REFS.fluid,
  folder: 'fluid',
  registry: FLUID_REGISTRY,
  defaultData: {
    format: 1,
    behaves_like: 'water',
    tint: 0x3f76e4,
    textures: {
      still: 'minecraft:block/water_still',
      flowing: 'minecraft:block/water_flow',
      overlay: 'minecraft:block/water_overlay',
      bucket: 'minecraft:item/water_bucket',
    },
  },
  // `format` is written by lowering, so the form hides it.
  hiddenPaths: ['/format'],
  lower: lowerFluid,
};
