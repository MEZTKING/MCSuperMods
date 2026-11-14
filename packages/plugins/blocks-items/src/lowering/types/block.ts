/**
 * `block` (and absent `type`): today's block, the same in every state (ADR 0067 D1). Its one
 * appearance is the element's `model` field, as a single-variant block state.
 *
 * Model slots: `default` (the element's `model`).
 */
import { variant } from './blockstates';
import type { TypeLowering } from './models';

export const blockType: TypeLowering = {
  slots: ['default'],
  acceptsModel: true,
  generate: () => [],
  blockstate: (models) => ({ variants: { '': variant(models.default ?? '') } }),
};
