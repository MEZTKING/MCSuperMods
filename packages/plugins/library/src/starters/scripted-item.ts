/**
 * The Scripted behaviour starter and Creator flow (ADR 0043 D2): an `msm:item` whose
 * `msm:on_use` event runs a `run_script` action, and the generated `msm:script` that defines
 * the handler, chosen from a few behaviours (heal, launch upward, strike lightning where the
 * player looks, give an effect) with their numbers as parameters. The script's lines come from
 * one template string per behaviour, so the user can open it in the Script Studio and edit it;
 * the library test type-checks every behaviour against the scripting plugin's typings. Scripts
 * run only in the Fabric mod jar export (with `msm_runtime`).
 */
import type { BundleContext, ContentBundle, StarterParameter } from '@msm/plugin-api';
import {
  COLOURS,
  element,
  KINDS,
  modIdFromNamespace,
  packElement,
  rl,
  texture,
} from '../content/bundle';
import {
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The behaviours, in the order the flow lists them. */
const BEHAVIOURS: readonly { value: string; label: string }[] = [
  { value: 'heal', label: 'Heal the player' },
  { value: 'launch', label: 'Launch the player upward' },
  { value: 'lightning', label: 'Strike lightning where the player looks' },
  { value: 'effect', label: 'Give the player an effect' },
];

/** Vanilla mob effects the `effect` behaviour can give. */
const EFFECTS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:speed', label: 'Speed' },
  { value: 'minecraft:strength', label: 'Strength' },
  { value: 'minecraft:regeneration', label: 'Regeneration' },
  { value: 'minecraft:jump_boost', label: 'Jump boost' },
  { value: 'minecraft:night_vision', label: 'Night vision' },
  { value: 'minecraft:fire_resistance', label: 'Fire resistance' },
  { value: 'minecraft:resistance', label: 'Resistance' },
];

/** The Scripted behaviour flow's questions (ADR 0043 D2), groups "Item" and "Behaviour". */
export const SCRIPTED_ITEM_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'item_name',
    label: 'Item name',
    description: 'The English name. Ids derive from it: Ruby Wand gives ruby_wand.',
    group: 'Item',
    type: 'string',
    default: 'Ruby Wand',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder texture.',
    group: 'Item',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'cooldown_seconds',
    label: 'Cooldown in seconds',
    description: 'How long the player waits before using it again.',
    group: 'Item',
    type: 'number',
    default: 2,
    min: 0,
    max: 60,
    step: 1,
  },
  {
    id: 'behaviour',
    label: 'What it does when used',
    group: 'Behaviour',
    type: 'choice',
    default: 'heal',
    choices: BEHAVIOURS.map((entry) => ({ ...entry })),
  },
  {
    id: 'heal_amount',
    label: 'Health restored',
    description: 'In half hearts (20 is full health). Used by "Heal the player".',
    group: 'Behaviour',
    type: 'number',
    default: 6,
    min: 1,
    max: 40,
    step: 1,
  },
  {
    id: 'launch_height',
    label: 'Launch height in blocks',
    description: 'Used by "Launch the player upward"; the player then falls slowly.',
    group: 'Behaviour',
    type: 'number',
    default: 8,
    min: 1,
    max: 30,
    step: 1,
  },
  {
    id: 'lightning_distance',
    label: 'Lightning distance in blocks',
    description: 'How far ahead of the player the lightning strikes. Used by "Strike lightning".',
    group: 'Behaviour',
    type: 'number',
    default: 10,
    min: 2,
    max: 32,
    step: 1,
  },
  {
    id: 'effect',
    label: 'Effect',
    description: 'Used by "Give the player an effect".',
    group: 'Behaviour',
    type: 'choice',
    default: 'minecraft:speed',
    choices: EFFECTS.map((entry) => ({ ...entry })),
  },
  {
    id: 'effect_seconds',
    label: 'Effect length in seconds',
    group: 'Behaviour',
    type: 'number',
    default: 30,
    min: 1,
    max: 600,
    step: 1,
  },
  {
    id: 'effect_level',
    label: 'Effect level',
    description: '1 is the weakest (Speed I).',
    group: 'Behaviour',
    type: 'number',
    default: 1,
    min: 1,
    max: 5,
    step: 1,
  },
]);

/**
 * The script body of each behaviour: a template string whose `{{name}}` placeholders the
 * builder fills in. `{{handler}}` is the handler id and `{{item}}` the item's English name.
 */
const SCRIPT_TEMPLATES: Readonly<Record<string, string>> = {
  heal: `// Runs when a player uses the {{item}}: heals {{amount}} half hearts.
msm.actions.define("{{handler}}", (e) => {
  if (e.player === undefined) return;
  e.player.heal({{amount}});
  e.world.spawnParticle("minecraft:heart", e.player.pos.offset(0, 2, 0), { count: 5, spread: 0.5 });
  e.world.playSound("minecraft:entity.player.levelup", e.player.pos, { pitch: 1.5 });
});`,
  launch: `// Runs when a player uses the {{item}}: levitation rises {{height}} blocks in half a second,
// then slow falling brings the player down gently.
msm.actions.define("{{handler}}", (e) => {
  if (e.player === undefined) return;
  e.player.addEffect("minecraft:levitation", 10, {{amplifier}});
  e.player.addEffect("minecraft:slow_falling", 110, 0);
  e.world.spawnParticle("minecraft:cloud", e.player.pos, { count: 12, spread: 0.5 });
  e.world.playSound("minecraft:entity.firework_rocket.launch", e.player.pos);
});`,
  lightning: `// Runs when a player uses the {{item}}: lightning strikes {{distance}} blocks ahead of the
// player's eyes, in the direction they look.
msm.actions.define("{{handler}}", (e) => {
  if (e.player === undefined) return;
  e.world.runCommand(
    "execute as " + e.player.uuid + " at @s anchored eyes positioned ^ ^ ^{{distance}} run summon minecraft:lightning_bolt ~ ~ ~",
  );
});`,
  effect: `// Runs when a player uses the {{item}}: gives {{effect}} at level {{level}} for {{seconds}} seconds.
msm.actions.define("{{handler}}", (e) => {
  if (e.player === undefined) return;
  e.player.addEffect("{{effect}}", {{ticks}}, {{amplifier}});
  e.world.spawnParticle("minecraft:happy_villager", e.player.pos.offset(0, 1, 0), { count: 8, spread: 0.5 });
});`,
};

/** Fills the `{{name}}` placeholders of a template. */
function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** The ids the Scripted behaviour starter uses for an item id path `itemId`. */
export function scriptedItemIds(namespace: string, itemId: string) {
  return {
    item: rl(namespace, itemId),
    model: rl(namespace, `item/${itemId}`),
    script: rl(namespace, `${itemId}_behaviour`),
    handler: rl(namespace, `${itemId}_power`),
    event: rl(namespace, `${itemId}_used`),
  };
}

export function scriptedItemBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(SCRIPTED_ITEM_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'item_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const behaviourValue = stringValue(values, 'behaviour');
  const behaviour =
    BEHAVIOURS.find((entry) => entry.value === behaviourValue) ??
    (BEHAVIOURS[0] as (typeof BEHAVIOURS)[number]);
  const cooldown = Math.round(numberValue(values, 'cooldown_seconds')) * 20;
  const effect =
    EFFECTS.find((entry) => entry.value === stringValue(values, 'effect')) ??
    (EFFECTS[0] as (typeof EFFECTS)[number]);
  const level = Math.round(numberValue(values, 'effect_level'));
  const seconds = Math.round(numberValue(values, 'effect_seconds'));
  const height = Math.round(numberValue(values, 'launch_height'));
  const ids = scriptedItemIds(namespace, name.id);
  const body = fill(SCRIPT_TEMPLATES[behaviour.value] as string, {
    item: name.display,
    handler: ids.handler,
    amount: Math.round(numberValue(values, 'heal_amount')),
    height,
    // Levitation rises 0.05 blocks a tick per level: 10 ticks at amplifier 2h - 1 rise h blocks.
    amplifier: behaviour.value === 'launch' ? height * 2 - 1 : level - 1,
    distance: Math.round(numberValue(values, 'lightning_distance')),
    effect: effect.value,
    level,
    seconds,
    ticks: seconds * 20,
  });
  const what: Readonly<Record<string, string>> = {
    heal: 'heals the player',
    launch: 'launches the player upward',
    lightning: 'strikes lightning where the player looks',
    effect: `gives the player ${effect.label.toLowerCase()}`,
  };
  const scriptsNeedTheJar =
    'Scripts run only in the Fabric mod jar export, with msm_runtime; the vanilla packs and the Java project export leave them out.';

  return {
    elements: [
      packElement(
        namespace,
        `${projectName}: the ${name.display}`,
        'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.',
      ),
      element(
        rl(namespace, 'mod'),
        KINDS.mod,
        {
          mod_id: modIdFromNamespace(namespace),
          version: '1.0.0',
          name: projectName,
          description: `Adds the ${name.display}, an item that ${what[behaviour.value]}.`,
          authors: [],
          licence: 'All-Rights-Reserved',
        },
        'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New items and scripts exist only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime); msm_runtime runs the scripts. The mod id must stay unique among the mods you install.',
      ),
      element(
        ids.item,
        KINDS.item,
        {
          format: 1,
          model: ids.model,
          max_stack_size: 1,
          creative_tab: 'minecraft:tools_and_utilities',
          components: { 'msm:on_use': { event: ids.event, cooldown_ticks: cooldown } },
          events: { [ids.event]: { actions: [{ type: 'run_script', handler: ids.handler }] } },
        },
        `A new item. msm:on_use fires the event ${ids.event} when a player uses it${cooldown > 0 ? `, at most once every ${cooldown} ticks` : ''}. The event's only action is run_script, which calls the handler ${ids.handler} that the script ${ids.script} defines: it ${what[behaviour.value]}.`,
      ),
      element(
        ids.model,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: ids.model } },
        `A flat item model drawn from textures/item/${name.id}.png. Paint over the placeholder to restyle it.`,
      ),
      element(
        ids.script,
        KINDS.script,
        { lines: ['import { msm } from "msm:runtime";', '', ...body.split('\n')] },
        `The script behind the ${name.display}: msm.actions.define registers the handler ${ids.handler}, which the item's run_script action calls with the player who used it. Open it in the Script Studio to change what the item does. ${scriptsNeedTheJar}`,
      ),
      element(
        rl(namespace, 'en_us'),
        KINDS.lang,
        { [`item.${namespace}.${name.id}`]: name.display },
        `The English name of the item: item.${namespace}.${name.id} is its translation key.`,
      ),
    ],
    assets: [texture(namespace, `item/${name.id}`, 'gem', colour)],
  };
}
