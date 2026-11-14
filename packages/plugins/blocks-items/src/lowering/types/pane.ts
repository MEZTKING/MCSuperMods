/**
 * `pane`: connects to panes and walls, as glass panes and iron bars do (ADR 0067 D2).
 * Generated models are vanilla's `template_glass_pane_{post,side,side_alt,noside,noside_alt}`
 * from `pane` and `edge`; the item is a flat `minecraft:item/generated` model of the `pane`
 * texture, as vanilla's glass pane item.
 *
 * Model slots: `post`, `side`, `side_alt`, `noside`, `noside_alt`.
 */
import { part, variant } from './blockstates';
import { slotSpecs, type TypeLowering } from './models';

const SLOTS = ['post', 'side', 'side_alt', 'noside', 'noside_alt'] as const;

export const paneType: TypeLowering = {
  slots: SLOTS,
  generate: (texture) =>
    slotSpecs(SLOTS, (slot) => `minecraft:block/template_glass_pane_${slot}`, {
      edge: texture('edge'),
      pane: texture('pane'),
    }),
  itemTexture: (texture) => texture('pane'),
  blockstate: (models) => {
    const model = (slot: (typeof SLOTS)[number], y = 0) => variant(models[slot] ?? '', { y });
    return {
      multipart: [
        part(model('post')),
        part(model('side'), { north: 'true' }),
        part(model('side', 90), { east: 'true' }),
        part(model('side_alt'), { south: 'true' }),
        part(model('side_alt', 90), { west: 'true' }),
        part(model('noside'), { north: 'false' }),
        part(model('noside_alt'), { east: 'false' }),
        part(model('noside_alt', 90), { south: 'false' }),
        part(model('noside', 270), { west: 'false' }),
      ],
    };
  },
};
