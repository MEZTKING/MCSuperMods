import raw from '../../mcdoc/msm/symbols.json' with { type: 'json' };
import { parseVanillaMcdocSymbols, type VanillaMcdocSymbols } from '../symbols/parse';

/**
 * Schema references for MSM's own types (ADR 0025 D7), compiled from
 * `packages/schemas/mcdoc/msm/*.mcdoc` by `tools/build-msm-mcdoc`. They resolve through
 * `SchemaIndex.resolveSchemaRef` (and the type paths through `SchemaIndex.resolve`) on every
 * index, whatever the target: the MSM types are version-independent.
 *
 * - `block` / `item`: element data of the `msm:block` / `msm:item` kinds (definition plus the
 *   editor fields `model`, `display_name`, `loot`, and `tool` / `min_tier` on `msm:breakable`).
 * - `blockDefinition` / `itemDefinition`: the runtime definitions written to
 *   `msm/<ns>/block/<path>.json` and `msm/<ns>/item/<path>.json`.
 * - `mod`: element data of the singleton `msm:mod` kind.
 * - `entity` / `entityDefinition`: element data of the `msm:entity` kind (definition plus
 *   `display_name` and the spawn egg's `texture` / `display_name`) and the runtime definition
 *   written to `msm/<ns>/entity/<path>.json` (ADR 0028).
 * - `geoModel` / `animation`: element data of the `msm:geo_model` and `msm:animation` kinds,
 *   the Bedrock geometry and animation JSON GeckoLib reads (ADR 0029).
 * - `effect` / `effectDefinition`: element data of the `msm:effect` kind (definition plus
 *   `display_name`) and the runtime definition written to `msm/<ns>/effect/<path>.json`
 *   (ADR 0055).
 * - `potion` / `potionDefinition`: element data of the `msm:potion` kind (definition plus editor
 *   fields) and the runtime definition written to `msm/<ns>/potion/<path>.json` (ADR 0063).
 * - `biomeAddition` / `biomeAdditionDefinition`, `lootAddition` / `lootAdditionDefinition`:
 *   element data of the `msm:biome_addition` and `msm:loot_addition` kinds and the runtime
 *   definitions written to `msm/<ns>/biome_addition/<path>.json` and
 *   `msm/<ns>/loot_addition/<path>.json` (ADR 0060 D2, D3). A biome addition is a union of two
 *   structs (at least one of `features` and `spawns`), not a struct; a loot addition's `pools`
 *   are `any` in MSM mcdoc, and `resolveSchemaRef` substitutes the target's
 *   `::java::data::loot::LootPool` for their items (`SchemaIndex.resolveSchemaRef`).
 * - `particle` / `particleDefinition`: element data of the `msm:particle` kind (the definition
 *   with `format` optional) and the runtime definition written to
 *   `msm/<ns>/particle/<path>.json` (ADR 0080 D1).
 * - `keyBind` / `keyBindDefinition`, `hud` / `hudDefinition`: element data of the
 *   `msm:key_bind` and `msm:hud` kinds (the definition with `format` optional; key binds add
 *   `display_name` and `category_name`) and the runtime definitions written to
 *   `msm/<ns>/key_bind/<path>.json` and `msm/<ns>/hud/<path>.json` (ADR 0088 D3, ADR 0089 D1).
 * - `vehicle` / `vehicleDefinition`: element data of the `msm:vehicle` kind (the definition with
 *   `format` optional, plus `display_name` and `item_display_name`) and the runtime definition
 *   written to `msm/<ns>/vehicle/<path>.json` (ADR 0090 D2).
 * - `command` / `commandDefinition`, `creativeTab` / `creativeTabDefinition`: element data of
 *   the `msm:command` and `msm:creative_tab` kinds (the definition with `format` optional;
 *   commands add `feedback_text`, tabs `display_name`) and the runtime definitions written to
 *   `msm/<ns>/command/<path>.json` and `msm/<ns>/creative_tab/<path>.json` (ADR 0096 D1, D2).
 * - `villagerProfession` / `villagerProfessionDefinition`, `fluid` / `fluidDefinition`: element
 *   data of the `msm:villager_profession` and `msm:fluid` kinds (the definition with `format`
 *   optional; professions add `display_name` and `textures`, fluids `display_name`,
 *   `bucket_display_name` and `textures`) and the runtime definitions written to
 *   `msm/<ns>/villager_profession/<path>.json` and `msm/<ns>/fluid/<path>.json` (ADR 0098 D2,
 *   ADR 0099 D1).
 * - `vanillaBlockRules` / `vanillaBlockRulesDefinition`: element data of the
 *   `msm:vanilla_block_rules` addition kind (the definition as written) and the runtime
 *   definition written to `msm/<ns>/vanilla_block_rules/<path>.json` (ADR 0105 D4).
 * - `villagerType` / `villagerTypeDefinition`, `gameRule` / `gameRuleDefinition`, `stat` /
 *   `statDefinition`: element data of the `msm:villager_type`, `msm:game_rule` and `msm:stat`
 *   kinds (the definition with `format` optional; villager types add `textures`, game rules
 *   `display_name` and `description`, statistics `display_name`) and the runtime definitions
 *   written to `msm/<ns>/villager_type/<path>.json`, `msm/<ns>/game_rule/<path>.json` and
 *   `msm/<ns>/stat/<path>.json` (ADR 0107 D5, ADR 0111 D5, D6).
 * - `rules`: element data of the `msm:rules` kind, a rule book (ADR 0082 D2, D5). Editor-only:
 *   the rules plugin compiles it at lowering time into events and a script, so no runtime
 *   definition exists and the conformance corpus has no rule book files.
 * - `worldSetup`, `oneBlock`, `team`, `objective`, `timer`, `area`: element data of the games
 *   plugin's six kinds `msm:world_setup`, `msm:one_block`, `msm:team`, `msm:objective`,
 *   `msm:timer` and `msm:area` (ADR 0113 D2 to D7, `games.mcdoc`). Editor-only: the games plugin
 *   lowers them to plain data pack files, so no runtime definition exists and the conformance
 *   corpus has no games files.
 * - `machineRecipe`: a machine recipe file `data/<ns>/recipe/<path>.json` whose `type` is a
 *   machine block's id (ADR 0075 D2, D8); vanilla's recipe dispatch does not know such types.
 */
export const MSM_SCHEMA_REFS = {
  block: 'msm:block',
  item: 'msm:item',
  mod: 'msm:mod',
  blockDefinition: 'msm:block_definition',
  itemDefinition: 'msm:item_definition',
  entity: 'msm:entity',
  entityDefinition: 'msm:entity_definition',
  geoModel: 'msm:geo_model',
  animation: 'msm:animation',
  effect: 'msm:effect',
  effectDefinition: 'msm:effect_definition',
  potion: 'msm:potion',
  potionDefinition: 'msm:potion_definition',
  biomeAddition: 'msm:biome_addition',
  biomeAdditionDefinition: 'msm:biome_addition_definition',
  lootAddition: 'msm:loot_addition',
  lootAdditionDefinition: 'msm:loot_addition_definition',
  machineRecipe: 'msm:machine_recipe',
  particle: 'msm:particle',
  particleDefinition: 'msm:particle_definition',
  rules: 'msm:rules',
  keyBind: 'msm:key_bind',
  keyBindDefinition: 'msm:key_bind_definition',
  hud: 'msm:hud',
  hudDefinition: 'msm:hud_definition',
  vehicle: 'msm:vehicle',
  vehicleDefinition: 'msm:vehicle_definition',
  command: 'msm:command',
  commandDefinition: 'msm:command_definition',
  creativeTab: 'msm:creative_tab',
  creativeTabDefinition: 'msm:creative_tab_definition',
  villagerProfession: 'msm:villager_profession',
  villagerProfessionDefinition: 'msm:villager_profession_definition',
  fluid: 'msm:fluid',
  fluidDefinition: 'msm:fluid_definition',
  vanillaBlockRules: 'msm:vanilla_block_rules',
  vanillaBlockRulesDefinition: 'msm:vanilla_block_rules_definition',
  villagerType: 'msm:villager_type',
  villagerTypeDefinition: 'msm:villager_type_definition',
  gameRule: 'msm:game_rule',
  gameRuleDefinition: 'msm:game_rule_definition',
  stat: 'msm:stat',
  statDefinition: 'msm:stat_definition',
  worldSetup: 'msm:world_setup',
  oneBlock: 'msm:one_block',
  team: 'msm:team',
  objective: 'msm:objective',
  timer: 'msm:timer',
  area: 'msm:area',
} as const;

/** The mcdoc type path behind each MSM schema reference. */
export const MSM_TYPE_PATHS = {
  block: '::msm::element::Block',
  item: '::msm::element::Item',
  mod: '::msm::Mod',
  blockDefinition: '::msm::definition::Block',
  itemDefinition: '::msm::definition::Item',
  entity: '::msm::element::Entity',
  entityDefinition: '::msm::definition::Entity',
  geoModel: '::msm::geometry::Geometry',
  animation: '::msm::animation::Animations',
  effect: '::msm::element::Effect',
  effectDefinition: '::msm::definition::Effect',
  potion: '::msm::element::Potion',
  potionDefinition: '::msm::definition::Potion',
  biomeAddition: '::msm::element::BiomeAddition',
  biomeAdditionDefinition: '::msm::definition::BiomeAddition',
  lootAddition: '::msm::element::LootAddition',
  lootAdditionDefinition: '::msm::definition::LootAddition',
  machineRecipe: '::msm::recipe::MachineRecipe',
  particle: '::msm::element::Particle',
  particleDefinition: '::msm::definition::Particle',
  rules: '::msm::rules::RuleBook',
  keyBind: '::msm::element::KeyBind',
  keyBindDefinition: '::msm::definition::KeyBind',
  hud: '::msm::element::Hud',
  hudDefinition: '::msm::definition::Hud',
  vehicle: '::msm::element::Vehicle',
  vehicleDefinition: '::msm::definition::Vehicle',
  command: '::msm::element::Command',
  commandDefinition: '::msm::definition::Command',
  creativeTab: '::msm::element::CreativeTab',
  creativeTabDefinition: '::msm::definition::CreativeTab',
  villagerProfession: '::msm::element::VillagerProfession',
  villagerProfessionDefinition: '::msm::definition::VillagerProfession',
  fluid: '::msm::element::Fluid',
  fluidDefinition: '::msm::definition::Fluid',
  vanillaBlockRules: '::msm::element::VanillaBlockRules',
  vanillaBlockRulesDefinition: '::msm::definition::VanillaBlockRules',
  villagerType: '::msm::element::VillagerType',
  villagerTypeDefinition: '::msm::definition::VillagerType',
  gameRule: '::msm::element::GameRule',
  gameRuleDefinition: '::msm::definition::GameRule',
  stat: '::msm::element::Stat',
  statDefinition: '::msm::definition::Stat',
  worldSetup: '::msm::games::WorldSetup',
  oneBlock: '::msm::games::OneBlock',
  team: '::msm::games::Team',
  objective: '::msm::games::Objective',
  timer: '::msm::games::Timer',
  area: '::msm::games::Area',
  action: '::msm::action::Action',
} as const;

/** `resolveSchemaRef` aliases: MSM schema reference -> mcdoc type path. */
export const MSM_SCHEMA_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  [MSM_SCHEMA_REFS.block]: MSM_TYPE_PATHS.block,
  [MSM_SCHEMA_REFS.item]: MSM_TYPE_PATHS.item,
  [MSM_SCHEMA_REFS.mod]: MSM_TYPE_PATHS.mod,
  [MSM_SCHEMA_REFS.blockDefinition]: MSM_TYPE_PATHS.blockDefinition,
  [MSM_SCHEMA_REFS.itemDefinition]: MSM_TYPE_PATHS.itemDefinition,
  [MSM_SCHEMA_REFS.entity]: MSM_TYPE_PATHS.entity,
  [MSM_SCHEMA_REFS.entityDefinition]: MSM_TYPE_PATHS.entityDefinition,
  [MSM_SCHEMA_REFS.geoModel]: MSM_TYPE_PATHS.geoModel,
  [MSM_SCHEMA_REFS.animation]: MSM_TYPE_PATHS.animation,
  [MSM_SCHEMA_REFS.effect]: MSM_TYPE_PATHS.effect,
  [MSM_SCHEMA_REFS.effectDefinition]: MSM_TYPE_PATHS.effectDefinition,
  [MSM_SCHEMA_REFS.potion]: MSM_TYPE_PATHS.potion,
  [MSM_SCHEMA_REFS.potionDefinition]: MSM_TYPE_PATHS.potionDefinition,
  [MSM_SCHEMA_REFS.biomeAddition]: MSM_TYPE_PATHS.biomeAddition,
  [MSM_SCHEMA_REFS.biomeAdditionDefinition]: MSM_TYPE_PATHS.biomeAdditionDefinition,
  [MSM_SCHEMA_REFS.lootAddition]: MSM_TYPE_PATHS.lootAddition,
  [MSM_SCHEMA_REFS.lootAdditionDefinition]: MSM_TYPE_PATHS.lootAdditionDefinition,
  [MSM_SCHEMA_REFS.machineRecipe]: MSM_TYPE_PATHS.machineRecipe,
  [MSM_SCHEMA_REFS.particle]: MSM_TYPE_PATHS.particle,
  [MSM_SCHEMA_REFS.particleDefinition]: MSM_TYPE_PATHS.particleDefinition,
  [MSM_SCHEMA_REFS.rules]: MSM_TYPE_PATHS.rules,
  [MSM_SCHEMA_REFS.keyBind]: MSM_TYPE_PATHS.keyBind,
  [MSM_SCHEMA_REFS.keyBindDefinition]: MSM_TYPE_PATHS.keyBindDefinition,
  [MSM_SCHEMA_REFS.hud]: MSM_TYPE_PATHS.hud,
  [MSM_SCHEMA_REFS.hudDefinition]: MSM_TYPE_PATHS.hudDefinition,
  [MSM_SCHEMA_REFS.vehicle]: MSM_TYPE_PATHS.vehicle,
  [MSM_SCHEMA_REFS.vehicleDefinition]: MSM_TYPE_PATHS.vehicleDefinition,
  [MSM_SCHEMA_REFS.command]: MSM_TYPE_PATHS.command,
  [MSM_SCHEMA_REFS.commandDefinition]: MSM_TYPE_PATHS.commandDefinition,
  [MSM_SCHEMA_REFS.creativeTab]: MSM_TYPE_PATHS.creativeTab,
  [MSM_SCHEMA_REFS.creativeTabDefinition]: MSM_TYPE_PATHS.creativeTabDefinition,
  [MSM_SCHEMA_REFS.villagerProfession]: MSM_TYPE_PATHS.villagerProfession,
  [MSM_SCHEMA_REFS.villagerProfessionDefinition]: MSM_TYPE_PATHS.villagerProfessionDefinition,
  [MSM_SCHEMA_REFS.fluid]: MSM_TYPE_PATHS.fluid,
  [MSM_SCHEMA_REFS.fluidDefinition]: MSM_TYPE_PATHS.fluidDefinition,
  [MSM_SCHEMA_REFS.vanillaBlockRules]: MSM_TYPE_PATHS.vanillaBlockRules,
  [MSM_SCHEMA_REFS.vanillaBlockRulesDefinition]: MSM_TYPE_PATHS.vanillaBlockRulesDefinition,
  [MSM_SCHEMA_REFS.villagerType]: MSM_TYPE_PATHS.villagerType,
  [MSM_SCHEMA_REFS.villagerTypeDefinition]: MSM_TYPE_PATHS.villagerTypeDefinition,
  [MSM_SCHEMA_REFS.gameRule]: MSM_TYPE_PATHS.gameRule,
  [MSM_SCHEMA_REFS.gameRuleDefinition]: MSM_TYPE_PATHS.gameRuleDefinition,
  [MSM_SCHEMA_REFS.stat]: MSM_TYPE_PATHS.stat,
  [MSM_SCHEMA_REFS.statDefinition]: MSM_TYPE_PATHS.statDefinition,
  [MSM_SCHEMA_REFS.worldSetup]: MSM_TYPE_PATHS.worldSetup,
  [MSM_SCHEMA_REFS.oneBlock]: MSM_TYPE_PATHS.oneBlock,
  [MSM_SCHEMA_REFS.team]: MSM_TYPE_PATHS.team,
  [MSM_SCHEMA_REFS.objective]: MSM_TYPE_PATHS.objective,
  [MSM_SCHEMA_REFS.timer]: MSM_TYPE_PATHS.timer,
  [MSM_SCHEMA_REFS.area]: MSM_TYPE_PATHS.area,
});

let parsed: VanillaMcdocSymbols | undefined;

/**
 * The compiled MSM mcdoc export, validated once. Its `ref` is a hash of the sources
 * (`msm-mcdoc:sha256:...`), not a git commit.
 */
export function msmMcdocSymbols(): VanillaMcdocSymbols {
  parsed ??= parseVanillaMcdocSymbols(raw);
  return parsed;
}

/**
 * `vanilla` with the MSM types and dispatchers added. MSM type paths live under `::msm` and
 * dispatchers under `msm:`, so nothing vanilla is replaced; on a clash the vanilla entry wins.
 * The vanilla overlay (`vanilla_overlay.mcdoc`, B549) is the one exception to the `msm:` rule:
 * its members of `minecraft:` dispatchers (such as `minecraft:structure_placement`'s
 * `dimension_origin`, which the vendored vanilla-mcdoc lacks) join the vanilla dispatcher, and a
 * member the vanilla export has itself still wins.
 */
export function mergeMsmSymbols(vanilla: VanillaMcdocSymbols): VanillaMcdocSymbols {
  const msm = msmMcdocSymbols();
  const dispatchers: VanillaMcdocSymbols['dispatchers'] = { ...msm.dispatchers };
  for (const [registry, members] of Object.entries(vanilla.dispatchers)) {
    dispatchers[registry] = Object.hasOwn(msm.dispatchers, registry)
      ? { ...msm.dispatchers[registry], ...members }
      : members;
  }
  return {
    ref: vanilla.ref,
    mcdoc: { ...msm.mcdoc, ...vanilla.mcdoc },
    dispatchers,
  };
}
