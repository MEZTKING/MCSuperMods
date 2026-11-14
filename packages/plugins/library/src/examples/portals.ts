/**
 * The portal example (ADR 0078 D4): "Two-way sky portal", built from the Portal Creator flow
 * with answers of its own (a flat dimension with the overworld's dimension type, a new frame
 * block), without the pack and mod elements (an example is copied into a project that has them
 * already), plus a beacon block whose `msm:on_interact` runs the `light_portal` action and an
 * `on_travel` event whose function says a line. Its ids differ from the other block examples',
 * so the `examples/blocks-items` mirror holds them all in one project.
 *
 * The vanilla data pack export keeps the dimension, its travel function and the arrival
 * function, leaves out the frame block's and the beacon's recipes and loot tables (ADR 0066 D3)
 * and makes the portal's `#minecraft:portals` entry optional (D4). Portals need the Fabric mod
 * jar export.
 */
import type { ContentBundle, ExampleProject, JsonObject } from '@msm/plugin-api';
import { COLOURS, element, KINDS, rl } from '../content/bundle';
import { hexFromRgb } from '../content/parameters';
import { hasFabric } from '../content/supports';
import { portalBundle } from '../starters/portal';
import { defineExample } from './define';

/** The gallery category of the portal example (the block examples' own). */
const BLOCKS = 'Blocks';

/** The Portal flow's answers the example uses. */
const SKY_PORTAL_VALUES = {
  portal_name: 'Sky Gate',
  destination: 'new',
  dimension_name: 'Sky Isle',
  terrain: 'flat',
  biome: 'minecraft:plains',
  sky: 'day',
  colour: hexFromRgb(COLOURS.sapphire),
  particles: 'dust',
};

function skyPortal(
  namespace: string,
  projectName: string,
  target: Parameters<typeof portalBundle>[0]['target'],
): ContentBundle {
  const flow = portalBundle({ namespace, projectName, target, values: { ...SKY_PORTAL_VALUES } });
  const portal = rl(namespace, 'sky_gate');
  const travelled = rl(namespace, 'sky_gate_travelled');
  const arrived = rl(namespace, 'sky_gate/arrived');
  const beacon = rl(namespace, 'sky_gate_beacon');
  const lightIt = rl(namespace, 'sky_gate_beacon_used');
  const elements = flow.elements
    .filter((entry) => entry.kind !== KINDS.pack && entry.kind !== KINDS.mod)
    .map((entry) => {
      if (entry.id !== portal) return entry;
      const data = { ...(entry.data as JsonObject) };
      data.on_travel = travelled;
      data.events = {
        [travelled]: { actions: [{ type: 'run_function', function: arrived }] },
      };
      return {
        ...entry,
        data,
        notes: `${entry.notes ?? ''} on_travel runs the event ${travelled} after each trip, with the traveller as self: its run_function action runs ${arrived} as the traveller, which says a line.`,
      };
    });
  elements.push(
    element(
      arrived,
      KINDS.function,
      {
        lines: [
          '# Run as whoever came through the Sky Gate (on_travel).',
          'say I came through the Sky Gate.',
        ],
      },
      `The function the portal's on_travel event runs as the traveller after each trip: say speaks as them, so the chat shows who came through. Any function works here: give an effect, play a sound, count trips.`,
    ),
    element(
      beacon,
      KINDS.block,
      {
        format: 1,
        model: 'minecraft:block/lodestone',
        display_name: 'Sky Gate Beacon',
        sound_type: 'metal',
        loot: 'self',
        item: { creative_tab: 'minecraft:functional_blocks' },
        components: {
          'msm:breakable': { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' },
          'msm:on_interact': { event: lightIt },
        },
        events: {
          [lightIt]: { actions: [{ type: 'light_portal', portal }] },
        },
      },
      `A block that lights the Sky Gate without flint and steel. Put it on the ground just in front of the opening of a finished frame (next to the bottom of the opening) and use it: msm:on_interact fires the event ${lightIt}, whose light_portal action lights an empty frame of ${portal} at the beacon or next to it. Nothing happens with no frame there. Any trigger can run light_portal: a mob's death, an item used on a block, a pressure plate. It reuses the vanilla lodestone model.`,
    ),
  );
  return { elements, assets: flow.assets };
}

/** The portal examples, in gallery order. */
export const portalExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_sky_portal',
    title: 'Two-way sky portal',
    description:
      'A portal from the Portal flow to a flat sky dimension and back, in a frame of its own block, lit with flint and steel or by using a beacon block (light_portal), with blue dust and an on_travel function that says a line.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['portal', 'dimension', 'light_portal', 'events', 'mod'],
    supports: hasFabric,
    build: ({ namespace, projectName, target }) => skyPortal(namespace, projectName, target),
  }),
];
