/**
 * `msm:block` templates of the `portal` type (ADR 0078 D3, category "Portals"): a portal to the
 * Nether, one to the End and one lit only by a trigger. They use vanilla frames, igniters and
 * dimensions and vanilla's Nether portal surface (no `textures`: lowering then references
 * `minecraft:block/nether_portal`). A portal has no item, no loot and is unbreakable by default
 * (ADR 0077 D1), so the templates set none of these.
 */
import type { ElementTemplate, Json, JsonObject, TemplateContext } from '@msm/plugin-api';
import { BLOCK_KIND } from '../kinds';
import { displayName } from './shared';

const CATEGORY = 'Portals';

/** A template of the portals category whose data `build` makes. */
function portalTemplate(
  id: string,
  title: string,
  description: string,
  build: (context: TemplateContext) => JsonObject,
): ElementTemplate {
  return {
    id,
    kind: BLOCK_KIND,
    category: CATEGORY,
    title,
    description,
    data: (context): Json => ({
      format: 1,
      display_name: displayName(context.path),
      type: 'portal',
      ...build(context),
    }),
  };
}

/** The ember orange of the Nether template's dust particles. */
const EMBER_ORANGE = 0xe0561c;

export const portalTemplates: readonly ElementTemplate[] = [
  portalTemplate(
    'msm_block_portal_nether',
    'Portal to the Nether',
    'A portal in a frame of crying obsidian, lit with flint and steel, that leads to the Nether and back. Like the Nether portal, one block in the Nether is eight in the overworld, and it sparkles with ember-orange dust. Needs the Fabric mod jar.',
    () => ({
      frame: 'minecraft:crying_obsidian',
      destination: 'minecraft:the_nether',
      particles: { color: EMBER_ORANGE },
    }),
  ),
  portalTemplate(
    'msm_block_portal_end',
    'Portal to the End',
    'A portal in a frame of end stone bricks, lit with flint and steel, that leads to the End and back. Travellers land on the ground near the same place rather than in a portal built for them; the way back is a portal you build in the End. Needs the Fabric mod jar.',
    () => ({
      frame: 'minecraft:end_stone_bricks',
      destination: 'minecraft:the_end',
      travel: { arrival: 'surface' },
      particles: { type: 'minecraft:reverse_portal' },
    }),
  ),
  portalTemplate(
    'msm_block_portal_trigger_lit',
    'Trigger-lit portal',
    'A portal to the Nether in a frame of quartz blocks that no item lights. Light it from an event of a block, item or effect with the action { "type": "light_portal", "portal": "<this block\'s id>" }, for example in a button block\'s msm:on_interact next to the frame. Needs the Fabric mod jar.',
    () => ({
      frame: 'minecraft:quartz_block',
      igniter: false,
      destination: 'minecraft:the_nether',
    }),
  ),
];
