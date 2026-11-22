/**
 * `fence_gate`: opens on use and fits fences and walls (ADR 0067 D2). Generated models are
 * vanilla's `template_fence_gate`, `_open`, `_wall` and `_wall_open` from `texture`.
 *
 * Weathering (ADR 0104 D1): `msm:weathering` and `msm:waxable` are allowed on this type
 * (`WEATHERING_BLOCK_TYPES`); lowering passes them through to the definition with full ids
 * (`lowering/weathering.ts`), and the block states and models are the same at every stage.
 *
 * Model slots: `closed` (also the item), `open`, `wall`, `wall_open`.
 */
import { HORIZONTAL_FACINGS, SOUTH_BASED_Y, variant, variants } from './blockstates';
import type { TypeLowering } from './models';

const FORMS = [
  { slot: 'closed', suffix: '', inWall: 'false', open: 'false' },
  { slot: 'open', suffix: '_open', inWall: 'false', open: 'true' },
  { slot: 'wall', suffix: '_wall', inWall: 'true', open: 'false' },
  { slot: 'wall_open', suffix: '_wall_open', inWall: 'true', open: 'true' },
] as const;

export const fenceGateType: TypeLowering = {
  slots: FORMS.map((form) => form.slot),
  generate: (texture) =>
    FORMS.map((form) => ({
      slot: form.slot,
      suffix: form.suffix,
      parent: `minecraft:block/template_fence_gate${form.suffix}`,
      textures: { texture: texture('texture') },
    })),
  blockstate: (models) =>
    variants(
      HORIZONTAL_FACINGS.flatMap((facing) =>
        FORMS.map(
          (form) =>
            [
              { facing, in_wall: form.inWall, open: form.open },
              variant(models[form.slot] ?? '', { y: SOUTH_BASED_Y[facing], uvlock: true }),
            ] as const,
        ),
      ),
    ),
  tags: () => ({ block: ['fence_gates'], item: ['fence_gates'] }),
};
