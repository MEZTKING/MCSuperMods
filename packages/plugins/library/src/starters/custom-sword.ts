/**
 * The Custom sword starter (ADR 0040 D2): an `msm:item` with the `msm:tool` sword component
 * and `msm:durability`, a placeholder handheld texture and model, a shaped recipe (two of the
 * chosen ingredient over a stick), the English name as a language key and the `msm:mod`
 * metadata. Attack damage and speed come from the tool tier (the runtime gives a sword the
 * vanilla values of that material; the MSM item schema has no separate damage field). The
 * sword exists only in the Fabric mod jar export (with `msm_runtime`); the vanilla pack
 * exports carry the model, texture, language key and recipe.
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
  articleFor,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The tool tiers the MSM item schema defines, in the order the wizard lists them. */
const TIERS: readonly { value: string; label: string }[] = [
  { value: 'wood', label: 'Wood' },
  { value: 'stone', label: 'Stone' },
  { value: 'copper', label: 'Copper' },
  { value: 'iron', label: 'Iron' },
  { value: 'gold', label: 'Gold' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'netherite', label: 'Netherite' },
];

/** Vanilla ingots and gems the recipe may use. */
const INGREDIENTS: readonly { value: string; label: string; name: string }[] = [
  { value: 'minecraft:emerald', label: 'Emerald', name: 'emeralds' },
  { value: 'minecraft:diamond', label: 'Diamond', name: 'diamonds' },
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard', name: 'amethyst shards' },
  { value: 'minecraft:quartz', label: 'Nether quartz', name: 'nether quartz' },
  { value: 'minecraft:lapis_lazuli', label: 'Lapis lazuli', name: 'lapis lazuli' },
  { value: 'minecraft:copper_ingot', label: 'Copper ingot', name: 'copper ingots' },
  { value: 'minecraft:iron_ingot', label: 'Iron ingot', name: 'iron ingots' },
  { value: 'minecraft:gold_ingot', label: 'Gold ingot', name: 'gold ingots' },
  { value: 'minecraft:netherite_ingot', label: 'Netherite ingot', name: 'netherite ingots' },
];

/** The Custom sword wizard's questions (ADR 0040 D2), steps "Sword", "Stats" and "Recipe". */
export const CUSTOM_SWORD_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'sword_name',
    label: 'Sword name',
    description: 'The English name. Ids derive from it: Ruby Sword gives ruby_sword.',
    group: 'Sword',
    type: 'string',
    default: 'Ruby Sword',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Blade colour',
    description: 'The colour of the placeholder texture.',
    group: 'Sword',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'tool_tier',
    label: 'Material tier',
    description: 'Attack damage and attack speed match the vanilla sword of this material.',
    group: 'Stats',
    type: 'choice',
    default: 'diamond',
    choices: TIERS.map((tier) => ({ ...tier })),
  },
  {
    id: 'durability',
    label: 'Durability',
    description: 'Hits before the sword breaks.',
    group: 'Stats',
    type: 'number',
    default: 1561,
    min: 1,
    max: 5000,
    step: 1,
  },
  {
    id: 'ingredient',
    label: 'Crafting ingredient',
    description: 'The recipe puts two of it above a stick.',
    group: 'Recipe',
    type: 'choice',
    default: 'minecraft:emerald',
    choices: INGREDIENTS.map(({ value, label }) => ({ value, label })),
  },
]);

export function customSwordBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(CUSTOM_SWORD_PARAMETERS, context);
  const sword = nameForms(stringValue(values, 'sword_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const tier = TIERS.find((entry) => entry.value === stringValue(values, 'tool_tier')) ?? {
    value: 'diamond',
    label: 'Diamond',
  };
  const durability = Math.round(numberValue(values, 'durability'));
  const ingredient =
    INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient')) ??
    (INGREDIENTS[0] as (typeof INGREDIENTS)[number]);
  const ingredientPath = ingredient.value.slice('minecraft:'.length);

  const item = rl(namespace, sword.id);
  const model = rl(namespace, `item/${sword.id}`);
  const nameKey = `item.${namespace}.${sword.id}`;
  return {
    elements: [
      packElement(
        namespace,
        `${projectName}: the ${sword.display}`,
        'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.',
      ),
      element(
        rl(namespace, 'mod'),
        KINDS.mod,
        {
          mod_id: modIdFromNamespace(namespace),
          version: '1.0.0',
          name: projectName,
          description: `Adds the ${sword.display}, a new sword.`,
          authors: [],
          licence: 'All-Rights-Reserved',
        },
        'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. The sword is a new item, so it exists only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime). The mod id must stay unique among the mods you install.',
      ),
      element(
        item,
        KINDS.item,
        {
          format: 1,
          model,
          max_stack_size: 1,
          creative_tab: 'minecraft:combat',
          components: {
            'msm:tool': { type: 'sword', tier: tier.value },
            'msm:durability': { max: durability },
          },
        },
        `A new item. msm:tool makes it a sword of the ${tier.value} tier, so its attack damage and attack speed are those of the vanilla ${tier.label.toLowerCase()} sword. msm:durability gives it ${durability} uses before it breaks (instead of the tier's own durability) and keeps it in stacks of one. Its English name comes from the language file below. The sword reaches the game only in the Fabric mod jar export; the vanilla packs carry its model, texture, name and recipe.`,
      ),
      element(
        model,
        KINDS.model,
        { parent: 'minecraft:item/handheld', textures: { layer0: model } },
        `A handheld item model: held like a tool, drawn from textures/item/${sword.id}.png. Paint over the placeholder to restyle the blade.`,
      ),
      element(
        rl(namespace, 'en_us'),
        KINDS.lang,
        { [nameKey]: sword.display },
        `The English name of the sword: the key ${nameKey} is the translation key of the item ${item}. Another language file (for example de_de) can give it a name in that language. Setting display_name on the item writes the same key for you.`,
      ),
      element(
        rl(namespace, `${sword.id}_from_${ingredientPath}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'equipment',
          pattern: ['I', 'I', 'S'],
          key: { I: ingredient.value, S: 'minecraft:stick' },
          result: { id: item, count: 1 },
        },
        `Two ${ingredient.name} above a stick craft ${articleFor(sword.lower)} ${sword.lower}, like the vanilla swords. Element ids are unique across kinds, so the recipe cannot share the sword's id ${sword.id} and has a name of its own.`,
      ),
    ],
    assets: [texture(namespace, `item/${sword.id}`, 'sword', colour)],
  };
}
