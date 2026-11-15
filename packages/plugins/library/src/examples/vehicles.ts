/**
 * The vehicle and controls examples (ADR 0091 D3): the per-kind examples of `msm:vehicle`
 * ("Vehicles: a tank battle"), `msm:key_bind` ("Controls: a dash ability") and `msm:hud` ("Controls:
 * a score and a mana bar"), and the behaviour example "Vehicles: a seaside" (a motorboat, a raft
 * and a dock block). Every vehicle is complete: the vehicle, its geo model, its textures and item
 * picture, so it exports on its own. Vehicles, key binds and HUD elements need the Fabric mod jar
 * export; the vanilla pack exports carry only the models, textures and language keys.
 *
 * Choices are inspired by the vehicle mods the research surveyed; nothing is copied from them.
 */
import type { ExampleProject } from '@msm/plugin-api';
import { COLOURS, element, KINDS, mobSkinTexture, rl, texture } from '../content/bundle';
import { hasFabric } from '../content/supports';
import {
  type VehicleModel,
  vehicleModelGeometry,
  vehicleModelTextureSize,
} from '../content/vehicle-models';
import { defineExample } from './define';

const VEHICLE_KIND = 'msm:vehicle';
const KEY_BIND_KIND = 'msm:key_bind';
const HUD_KIND = 'msm:hud';

/** The gallery categories. */
const VEHICLES = 'Vehicles';
const CONTROLS = 'Controls and HUD';

const MODEL_NOTE =
  'Its geometry, texture, item model and item picture are in this example, named after the vehicle.';

/** The geo model, texture and item picture of a vehicle. */
function vehicleLooks(
  namespace: string,
  name: string,
  model: VehicleModel,
  colour: typeof COLOURS.slate,
) {
  const size = vehicleModelTextureSize(model);
  const own = rl(namespace, `entity/${name}`);
  return {
    elements: [
      element(
        own,
        KINDS.geoModel,
        vehicleModelGeometry(model, `entity.${name}`),
        `The boxed model of the ${name.replace(/_/g, ' ')}, drawn for MSM. The vehicle names its bones in turret, parts and muzzle.`,
      ),
      element(
        rl(namespace, `item/${name}`),
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: rl(namespace, `item/${name}`) } },
        `The flat item model of the ${name.replace(/_/g, ' ')}'s item (item.model), drawn from textures/item/${name}.png.`,
      ),
    ],
    assets: [
      mobSkinTexture(namespace, `entity/${name}`, size, size, colour),
      texture(namespace, `item/${name}`, 'plain', colour),
    ],
  };
}

const SOUNDS = {
  ground: 'minecraft:entity.minecart.riding',
  paddle: 'minecraft:entity.boat.paddle_water',
  horn: 'minecraft:item.goat_horn.sound.0',
  start: 'minecraft:block.piston.extend',
  cannon: 'minecraft:entity.generic.explode',
} as const;

/** The tank battle: tank, shell crate and the HUD reload text. */
function tankBattle(namespace: string) {
  const tank = rl(namespace, 'tank');
  const looks = vehicleLooks(namespace, 'tank', 'tank', COLOURS.jade);
  const crate = rl(namespace, 'shell_crate');
  const crateModel = rl(namespace, 'block/shell_crate');
  const own = rl(namespace, 'entity/tank');
  return {
    elements: [
      element(
        tank,
        VEHICLE_KIND,
        {
          format: 1,
          display_name: 'Tank',
          model: { geometry: own, texture: own },
          item: { model: rl(namespace, 'item/tank') },
          size: [3, 1.6],
          movement: {
            mode: 'ground',
            max_speed: 0.25,
            acceleration: 0.01,
            turn_rate: 3,
            turns_in_place: true,
            step_height: 1,
            grip: 1,
          },
          seats: [{ offset: [0, 1.6, 0] }],
          engine: { sound: SOUNDS.ground, start_sound: SOUNDS.start },
          health: {
            max: 120,
            repair: [{ item: 'minecraft:iron_ingot', amount: 20 }],
            explodes: 2,
            immune_to: ['#minecraft:is_fire'],
          },
          weapons: [
            {
              id: 'cannon',
              key: 'fire',
              projectile: 'minecraft:fire_charge',
              speed: 2.5,
              inaccuracy: 0.5,
              cooldown_ticks: 60,
              ammo: { item: 'minecraft:fire_charge', capacity: 16 },
              muzzle: { bone: 'barrel', offset: [0, 1.3, 2.5] },
              sound: SOUNDS.cannon,
              recoil: 0.1,
            },
          ],
          turret: { bone: 'turret', pitch_bone: 'barrel', pitch_limit: [-20, 10], turn_rate: 4 },
          camera: { distance: 8 },
        },
        `A slow, tough tank that turns on the spot. movement.mode ground drives it on the vanilla movement keys; turns_in_place lets it spin without moving. The turret follows where the driver looks, within pitch_limit, and the weapon cannon is fired with the Vehicle: fire key (R by default, changeable in Controls) every 60 ticks, using one fire charge from its ammunition (loaded by using fire charges on the tank, up to 16). health.repair lets iron ingots mend it, and explodes makes it blow up when destroyed. ${MODEL_NOTE} A vehicle needs the Fabric mod jar export; its item places it on the ground.`,
      ),
      ...looks.elements,
      element(
        rl(namespace, 'reload'),
        HUD_KIND,
        {
          format: 1,
          type: 'text',
          anchor: 'bottom',
          offset: [0, -50],
          show: 'driving',
          value: { source: 'vehicle', stat: 'reload', weapon: 'cannon' },
          text: 'Cannon: {value}',
          color: '#ffe060',
        },
        'A line of text above the hotbar that shows only while the player drives a vehicle. Its value is the vehicle stat reload, the ticks until the cannon can fire again; the server keeps it up to date. {value} in text is replaced by the number.',
      ),
      element(
        crate,
        KINDS.block,
        {
          format: 1,
          model: crateModel,
          display_name: 'Shell Crate',
          sound_type: 'wood',
          loot: 'self',
          item: { creative_tab: 'minecraft:functional_blocks' },
          components: { 'msm:breakable': { hardness: 2, resistance: 3 } },
        },
        'A plain crate to mark an ammunition store. It is an ordinary block that drops itself; the tank is loaded by using fire charges on it, not from the crate.',
      ),
      element(
        crateModel,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: crateModel } },
        'The crate: a full cube drawn from textures/block/shell_crate.png.',
      ),
    ],
    assets: [...looks.assets, texture(namespace, 'block/shell_crate', 'plain', COLOURS.wood)],
  };
}

/** The per-kind examples of the three kinds, vehicle first, then key bind, then HUD. */
export const vehicleKindExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_vehicle',
    title: 'Vehicles: a tank battle',
    description:
      'A drivable tank with a turret that follows your view, a cannon, a shell crate and a reload line on the screen.',
    kind: VEHICLE_KIND,
    category: VEHICLES,
    tags: ['vehicle', 'tank', 'turret', 'weapons', 'hud', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => tankBattle(namespace),
  }),
  defineExample({
    id: 'example_msm_key_bind',
    title: 'Controls: a dash ability',
    description:
      'A key (Z by default, shown in Controls) that dashes the player forward once a second, with a charge bar on screen.',
    kind: KEY_BIND_KIND,
    category: CONTROLS,
    tags: ['key_bind', 'hud', 'cooldown', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => {
      const press = rl(namespace, 'dash_press');
      const bar = rl(namespace, 'dash_charge');
      return {
        elements: [
          element(
            rl(namespace, 'dash'),
            KEY_BIND_KIND,
            {
              format: 1,
              display_name: 'Dash',
              default_key: 'key.keyboard.z',
              category: 'abilities',
              category_name: 'Abilities',
              when: 'on_foot',
              cooldown_ticks: 20,
              'msm:on_press': press,
              events: {
                [press]: {
                  actions: [
                    { type: 'launch', strength: 1.2, direction: 'horizontal', up: 0.2 },
                    { type: 'play_sound', sound: 'minecraft:entity.breeze.wind_burst' },
                    { type: 'set_hud', hud: bar, value: 0 },
                  ],
                },
              },
            },
            `A key bind adds a key to the Controls screen. default_key names the key as vanilla does (key.keyboard.z); players can rebind it. category and category_name give the Controls group. when on_foot makes it work only while the player rides nothing, and cooldown_ticks 20 allows one press a second. msm:on_press names the event ${press}, run with the player as self: it launches the player forward, plays a whoosh and empties the charge bar. Key binds need the Fabric mod jar export; a new one needs a restart.`,
          ),
          element(
            bar,
            HUD_KIND,
            {
              format: 1,
              type: 'bar',
              anchor: 'above_hotbar',
              value: { source: 'set' },
              max: 100,
              size: [81, 5],
              fill_color: '#4cc04c',
              back_color: '#142c14',
              show: 'always',
            },
            'A green bar above the hotbar. Its value comes from source set, so only actions (here the dash key) and scripts change it; the dash empties it to 0. Rules or a script can fill it again.',
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_msm_hud',
    title: 'Controls: a score and a mana bar',
    description:
      'Two HUD elements: a mana bar above the hotbar and a score line in the top-right corner, both read from the game.',
    kind: HUD_KIND,
    category: CONTROLS,
    tags: ['hud', 'bar', 'text', 'scoreboard', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'mana'),
          HUD_KIND,
          {
            format: 1,
            type: 'bar',
            anchor: 'above_hotbar',
            value: { source: 'data', scope: 'player', namespace, key: 'mana' },
            max: 100,
            size: [81, 5],
            fill_color: '#3c6cf0',
            back_color: '#14183c',
          },
          'A HUD element draws on the player\'s screen. type bar fills a bar out of max; its value is script data of the player ("mana" in this project\'s namespace), which Rules counters and scripts set. fill_color and back_color are #rrggbb. HUD elements need the Fabric mod jar export; the server sends changed values every few ticks.',
        ),
        element(
          rl(namespace, 'score'),
          HUD_KIND,
          {
            format: 1,
            type: 'text',
            anchor: 'top_right',
            offset: [-4, 4],
            value: { source: 'score', objective: 'points' },
            text: 'Score: {value}',
            color: '#ffe060',
          },
          'A line of text in the top-right corner. Its value is the player\'s score in the "points" scoreboard objective (create it in a load function with scoreboard objectives add points dummy); {value} in text is replaced by the number.',
        ),
      ],
      assets: [],
    }),
  }),
];

/** The seaside behaviour example: a motorboat, a raft and a dock block. */
export const vehicleBehaviourExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_vehicles_seaside',
    title: 'Vehicles: a seaside',
    description:
      'A motorboat with a horn, a four-seat raft with a crate and a dock block to tie them up at.',
    kind: VEHICLE_KIND,
    category: VEHICLES,
    tags: ['vehicle', 'boat', 'water', 'storage', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => {
      const boat = vehicleLooks(namespace, 'motorboat', 'motorboat', COLOURS.sapphire);
      const raft = vehicleLooks(namespace, 'raft', 'raft', COLOURS.wood);
      const dock = rl(namespace, 'dock');
      const dockModel = rl(namespace, 'block/dock');
      return {
        elements: [
          element(
            rl(namespace, 'motorboat'),
            VEHICLE_KIND,
            {
              format: 1,
              display_name: 'Motorboat',
              model: {
                geometry: rl(namespace, 'entity/motorboat'),
                texture: rl(namespace, 'entity/motorboat'),
              },
              item: { model: rl(namespace, 'item/motorboat'), places_on: 'water' },
              size: [1.6, 0.7],
              movement: { mode: 'water', max_speed: 0.4, turn_rate: 4 },
              seats: [{ offset: [0, 0.3, 0] }, { offset: [0, 0.3, -0.6] }],
              engine: { sound: SOUNDS.paddle, horn: SOUNDS.horn },
              health: { max: 30 },
              parts: { propellers: ['propeller'] },
              camera: { distance: 5 },
            },
            `A quick two-seat boat. movement.mode water keeps it on the water surface, and item.places_on water lets its item be placed on water only. engine.horn is a sound the Vehicle: horn key plays. parts.propellers lists the bones that spin while it moves. ${MODEL_NOTE}`,
          ),
          element(
            rl(namespace, 'raft'),
            VEHICLE_KIND,
            {
              format: 1,
              display_name: 'Raft',
              model: {
                geometry: rl(namespace, 'entity/raft'),
                texture: rl(namespace, 'entity/raft'),
              },
              item: { model: rl(namespace, 'item/raft'), places_on: 'water' },
              size: [1.8, 0.4],
              movement: { mode: 'water', max_speed: 0.15, acceleration: 0.01, turn_rate: 3 },
              seats: [
                { offset: [-0.4, 0.2, 0.4] },
                { offset: [0.4, 0.2, 0.4] },
                { offset: [-0.4, 0.2, -0.2] },
                { offset: [0.4, 0.2, -0.2] },
              ],
              engine: { sound: SOUNDS.paddle },
              health: { max: 20 },
              storage: { rows: 1 },
              camera: { distance: 5 },
            },
            `A slow raft for four. The first seat drives; the others ride along. storage.rows 1 gives it a crate of one row of nine slots that opens from the seat. ${MODEL_NOTE}`,
          ),
          ...boat.elements,
          ...raft.elements,
          element(
            dock,
            KINDS.block,
            {
              format: 1,
              model: dockModel,
              display_name: 'Dock Planks',
              sound_type: 'wood',
              loot: 'self',
              item: { creative_tab: 'minecraft:building_blocks' },
              components: { 'msm:breakable': { hardness: 2, resistance: 3 } },
            },
            'A plain wooden block to build a pier from.',
          ),
          element(
            dockModel,
            KINDS.model,
            { parent: 'minecraft:block/cube_all', textures: { all: dockModel } },
            'The dock block: a full cube drawn from textures/block/dock.png.',
          ),
        ],
        assets: [
          ...boat.assets,
          ...raft.assets,
          texture(namespace, 'block/dock', 'plain', COLOURS.wood),
        ],
      };
    },
  }),
];
