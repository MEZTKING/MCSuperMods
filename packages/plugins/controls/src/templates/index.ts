/**
 * "New element" templates of `@msm/plugin-controls` (ADR 0091 D3), category "Controls and HUD":
 * Dash key, Ability key with cooldown, Mana bar, Stamina bar, Coordinates text and Score
 * counter. They name only vanilla effects and sounds, event ids derived from their own id, and
 * script data in their own namespace, so each validates on its own in any project. Their
 * default keys (Z and K) are free on both targets: no vanilla control and no runtime vehicle
 * key uses them.
 */
import type { ElementTemplate, TemplateContext } from '@msm/plugin-api';
import { HUD_KIND, KEY_BIND_KIND } from '../kinds';

const CATEGORY = 'Controls and HUD';

/** The Controls group the key templates share, and its name. */
const ABILITY_CATEGORY = 'abilities';
const ABILITY_CATEGORY_NAME = 'Abilities';

/** An event id derived from the element's own id: `<ns>:<path>_<suffix>`. */
const ownEvent = (context: TemplateContext, suffix: string): string => `${context.id}_${suffix}`;

/** `dash` (or `keys/dash`) becomes `Dash`: the last path segment in title case. */
function displayName(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last
    .split(/[_\-.]+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

const TEMPLATES: ElementTemplate[] = [
  {
    id: 'msm_key_bind_dash',
    kind: KEY_BIND_KIND,
    category: CATEGORY,
    title: 'Dash key',
    description:
      'Pressing Z dashes the player forward where they look, with a whoosh, at most once a second. Players can change the key in Controls.',
    defaultName: 'dash',
    data: (context) => {
      const press = ownEvent(context, 'press');
      return {
        format: 1,
        display_name: displayName(context.path),
        default_key: 'key.keyboard.z',
        category: ABILITY_CATEGORY,
        category_name: ABILITY_CATEGORY_NAME,
        when: 'on_foot',
        cooldown_ticks: 20,
        'msm:on_press': press,
        events: {
          [press]: {
            actions: [
              { type: 'launch', strength: 1.2, direction: 'horizontal', up: 0.2 },
              { type: 'play_sound', sound: 'minecraft:entity.breeze.wind_burst' },
            ],
          },
        },
      };
    },
  },
  {
    id: 'msm_key_bind_ability',
    kind: KEY_BIND_KIND,
    category: CATEGORY,
    title: 'Ability key with cooldown',
    description:
      'Pressing K gives the player Strength II for ten seconds, then the key rests for thirty seconds. Change the effect to your own ability.',
    defaultName: 'ability',
    data: (context) => {
      const press = ownEvent(context, 'press');
      return {
        format: 1,
        display_name: displayName(context.path),
        default_key: 'key.keyboard.k',
        category: ABILITY_CATEGORY,
        category_name: ABILITY_CATEGORY_NAME,
        cooldown_ticks: 600,
        'msm:on_press': press,
        events: {
          [press]: {
            actions: [
              { type: 'apply_effect', effect: 'minecraft:strength', seconds: 10, amplifier: 1 },
              { type: 'play_sound', sound: 'minecraft:block.beacon.power_select' },
            ],
          },
        },
      };
    },
  },
  {
    id: 'msm_hud_mana_bar',
    kind: HUD_KIND,
    category: CATEGORY,
    title: 'Mana bar',
    description:
      'A blue bar above the hotbar showing the player\'s "mana" out of 100, kept in script data. Rules and scripts fill it up and use it.',
    defaultName: 'mana',
    data: (context) => ({
      format: 1,
      type: 'bar',
      anchor: 'above_hotbar',
      value: { source: 'data', scope: 'player', namespace: context.namespace, key: 'mana' },
      max: 100,
      size: [81, 5],
      fill_color: '#3c6cf0',
      back_color: '#14183c',
    }),
  },
  {
    id: 'msm_hud_stamina_bar',
    kind: HUD_KIND,
    category: CATEGORY,
    title: 'Stamina bar',
    description:
      'A green bar above the hotbar showing the player\'s "stamina" out of 100, kept in script data. Rules and scripts drain it and fill it again.',
    defaultName: 'stamina',
    data: (context) => ({
      format: 1,
      type: 'bar',
      anchor: 'above_hotbar',
      order: 1,
      value: { source: 'data', scope: 'player', namespace: context.namespace, key: 'stamina' },
      max: 100,
      size: [81, 5],
      fill_color: '#4cc04c',
      back_color: '#142c14',
    }),
  },
  {
    id: 'msm_hud_coordinates',
    kind: HUD_KIND,
    category: CATEGORY,
    title: 'Coordinates text',
    description:
      "Shows the player's height (Y) in the top-left corner, read by their own game. Make copies with the stat set to x and z, each 10 pixels lower, for all three.",
    defaultName: 'coordinates',
    data: () => ({
      format: 1,
      type: 'text',
      anchor: 'top_left',
      offset: [4, 4],
      show: 'always',
      value: { source: 'player', stat: 'y' },
      text: 'Y: {value}',
      color: '#ffffff',
    }),
  },
  {
    id: 'msm_hud_score_counter',
    kind: HUD_KIND,
    category: CATEGORY,
    title: 'Score counter',
    description:
      'Shows the player\'s score in the "points" scoreboard objective in the top-right corner. Create the objective in a load function (scoreboard objectives add points dummy).',
    defaultName: 'score',
    data: () => ({
      format: 1,
      type: 'text',
      anchor: 'top_right',
      offset: [-4, 4],
      value: { source: 'score', objective: 'points' },
      text: 'Score: {value}',
      color: '#ffe060',
    }),
  },
];

export const controlsTemplates: readonly ElementTemplate[] = Object.freeze(TEMPLATES);
