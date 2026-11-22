import { describe, expect, it } from 'vitest';
import {
  ART_RECIPE_NAMES,
  MOBS_COMMANDS_FLOW_ANSWERS,
  MOBS_COMMANDS_PROMPT_CODES,
  MOBS_COMMANDS_PROMPT_TEMPLATES,
  NEW_FLOW_PROMPT_IDS,
  PLANTS_STORAGE_FLOW_ANSWERS,
  PLANTS_STORAGE_PROMPT_CODES,
  PLANTS_STORAGE_PROMPT_TEMPLATES,
  projectContextBlock,
  RULES_PROMPT_CANCELLABLE,
  RULES_PROMPT_IDS,
  RULES_PROMPT_PLAIN_STEPS,
  RULES_PROMPT_TEMPLATES,
  systemPrompt,
  TEXTURE_PROMPT_RECIPES,
  VILLAGERS_FLUIDS_FLOW_ANSWERS,
  VILLAGERS_FLUIDS_PROMPT_CODES,
  VILLAGERS_FLUIDS_PROMPT_TEMPLATES,
  WORLD_FLOW_ANSWERS,
} from '../src/index';

describe('systemPrompt', () => {
  it.each(['chat', 'build'] as const)('is identical across calls in %s mode', (mode) => {
    expect(systemPrompt(mode)).toBe(systemPrompt(mode));
  });

  it('has no dates or times', () => {
    for (const mode of ['chat', 'build'] as const) {
      const text = systemPrompt(mode);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(text).not.toMatch(/\d{1,2}:\d{2}/);
      expect(text).not.toMatch(/\b(19|20)\d{2}\b/);
    }
  });

  it('states the rules and the build procedure', () => {
    const build = systemPrompt('build');
    expect(build).toContain('propose_plan');
    expect(build).toContain('checkpoint');
    expect(build).toContain('run_checks');
    expect(build).toContain('msm:mod');
    expect(build).toContain('British English');
    expect(systemPrompt('chat')).not.toContain('Mode: build');
  });
});

describe('projectContextBlock', () => {
  it('renders the volatile facts deterministically', () => {
    const block = projectContextBlock({
      targetId: 'mc-test',
      mcVersion: '1.0',
      namespaces: ['zeta', 'alpha'],
      kindCounts: { 'msm:item': 2, 'minecraft:recipe': 3 },
      hasModElement: false,
      pendingSummary: '',
    });
    expect(block).toBe(
      [
        '<project_context>',
        'Target: mc-test (Minecraft 1.0)',
        'Namespaces: alpha, zeta',
        'Elements per kind: minecraft:recipe: 3, msm:item: 2',
        'msm:mod element: absent',
        'Pending changes: (none)',
        '</project_context>',
      ].join('\n'),
    );
  });
});

describe('systemPrompt effects and throwables paragraph (ADR 0055 D11)', () => {
  it.each(['chat', 'build'] as const)(
    'names the kinds, the sound rule and the gaps in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      expect(text).toContain('msm:effect');
      expect(text).toContain('msm:throwable');
      expect(text).toContain('msm:on_tick');
      expect(text).toContain('run_script');
      expect(text).toContain('{ "sound_id": "namespace:event" }');
      expect(text).toContain('plain project sound id');
      expect(text).toContain('Entity.runCommand');
      expect(text).toContain('note_missing_feature');
    },
  );
});

describe('systemPrompt vanilla additions, triggers and saved data paragraphs (ADRs 0060-0062)', () => {
  it.each(['chat', 'build'] as const)('names the kinds, triggers and stores in %s mode', (mode) => {
    const text = systemPrompt(mode);
    // W-D6: ore targets use vanilla's replaceable tags, not block_match on stone and deepslate.
    expect(text).not.toContain('minecraft:block_match');
    for (const term of [
      'msm:biome_addition',
      'msm:loot_addition',
      'underground_ores',
      'minecraft:tag_match',
      'minecraft:stone_ore_replaceables',
      'minecraft:deepslate_ore_replaceables',
      'minecraft:all_of',
      '"condition"',
      '"burn_seconds"',
      'minecraft:villager_trade',
      'Extra drop',
      'msm:on_hit',
      'msm:on_use_on_block',
      'msm:while_held',
      'msm:while_worn',
      'msm:on_break',
      'msm:on_place',
      'msm:on_random_tick',
      'msm:on_entity_inside',
      'msm:on_spawn',
      'player.data',
      'msm.storage',
      '16 KiB',
      'server.started',
    ]) {
      expect(text, term).toContain(term);
    }
  });
});

describe('systemPrompt potions, data kinds and Script API 1.1 paragraphs (ADRs 0063-0065)', () => {
  it.each(['chat', 'build'] as const)('names the kinds and limits in %s mode', (mode) => {
    const text = systemPrompt(mode);
    for (const term of [
      'msm:potion',
      'minecraft:awkward',
      'Potion creator flow',
      'Fabric mod jar',
      'Mob skin',
      'Goat horn',
      'minecraft:goat_horn',
      'enchantment providers',
      'sound_id',
      'player.inventory',
      'player.tick',
      'at least 5 ticks',
      'at most 32 per namespace',
      'at most 128 blocks',
      'Entity.damage',
      'block.place',
      'custom commands',
      'note_missing_feature',
    ]) {
      expect(text, term).toContain(term);
    }
  });
});

describe('systemPrompt block types and plants paragraph (ADR 0069 D6)', () => {
  it.each(['chat', 'build'] as const)('names the types, fields and flows in %s mode', (mode) => {
    const text = systemPrompt(mode);
    for (const term of [
      '"type"',
      '"pillar"',
      '"stairs"',
      '"fence_gate"',
      '"pressure_plate"',
      '"crop"',
      '"sapling"',
      '"leaves"',
      'base_block',
      'wood_type',
      'set_type',
      'weighted_max',
      'max_age',
      'crop_drops',
      'leaves_drops',
      '"textures"',
      'msm:strippable',
      'msm:flammable',
      'item.id',
      '#minecraft:logs',
      'Wood set',
      'Stone set',
      '"Crop"',
      '"Tree"',
      'wood-set',
      'stone-set',
      'add_starter',
      'note_missing_feature',
    ]) {
      expect(text, term).toContain(term);
    }
  });
});

describe('systemPrompt mobs paragraph (ADR 0073 D6)', () => {
  it.each(['chat', 'build'] as const)(
    'names the bases, modes, components, goals, flows and limits in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const term of [
        '"base"',
        '"animal"',
        '"monster"',
        '"mode"',
        '"fly"',
        '"swim"',
        '"amphibious"',
        'breathes_air',
        '"water_animal"',
        'msm:ranged_attack',
        'msm:tameable',
        'msm:breedable',
        'msm:rideable',
        'msm:variants',
        'msm:boss_bar',
        'projectileItems',
        '"tempt"',
        '"panic"',
        '"leap_at_target"',
        '"ranged_attack"',
        '"renderer"',
        '"auto"',
        '"Pet" (pet:',
        'farm-animal',
        'mount',
        'flying-mob',
        'water-mob',
        '"Boss" (boss:',
        'pet_name',
        'variant_count',
        'variant_<n>_biome',
        '"archer"',
        'add_starter',
        'note_missing_feature',
        'restart',
        'same mod jar',
      ]) {
        expect(text, term).toContain(term);
      }
    },
  );
});

describe('systemPrompt containers and machines paragraph (ADR 0076 D6)', () => {
  it.each(['chat', 'build'] as const)('names the components and the limits in %s mode', (mode) => {
    const text = systemPrompt(mode);
    for (const term of [
      'msm:container',
      'msm:machine',
      'keep_contents',
      'world.getContainer(pos)',
      'recipe_types',
      'vanilla screen',
      'three slots',
      'vanilla data pack leaves out machine recipes',
      'note_missing_feature',
    ]) {
      expect(text, term).toContain(term);
    }
  });
});

describe('systemPrompt portals paragraph (ADR 0078 D5)', () => {
  it.each(['chat', 'build'] as const)(
    'names the type, fields, action and limits in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const term of [
        'type "portal"',
        'frame_block',
        'return_to',
        'light_portal',
        'on_travel',
        'arrival',
        'Portal to a dimension',
        'need the Fabric mod jar',
        'vertical only',
        'note_missing_feature',
      ]) {
        expect(text, term).toContain(term);
      }
    },
  );
});

describe('systemPrompt particles paragraph (ADR 0081 D7)', () => {
  it.each(['chat', 'build'] as const)(
    'names the kind, the forms and the limits in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const term of [
        'msm:particle',
        'textures/particle/',
        'frame_ticks',
        'always_show',
        'msm:ambient_particles',
        'spawn_particle',
        'motion',
        'force',
        'options object',
        'minecraft:dust',
        'add_starter "particle"',
        'retextures a vanilla particle',
        'on the client and the server',
        'a restart is needed',
        'note_missing_feature',
      ]) {
        expect(text, term).toContain(term);
      }
    },
  );
});

describe('systemPrompt Script API 1.3 and 1.4 lines', () => {
  it.each(['chat', 'build'] as const)('names the additions in %s mode', (mode) => {
    const text = systemPrompt(mode);
    for (const term of [
      'Script API 1.3',
      'Script API 1.4',
      'world.spawnParticle(particle, pos, options)',
      'world.dayTime',
      '13000 nightfall',
      'world.isRaining',
      'world.isThundering',
      'world.setWeather',
      'world.explode',
      'world.dropItem',
      'world.breakBlock',
      'Entity.remove()',
      'weather is server-wide',
    ]) {
      expect(text, term).toContain(term);
    }
  });
});

describe('systemPrompt rules paragraph (ADR 0082 D10)', () => {
  it.each(['chat', 'build'] as const)(
    'prefers rule books and names the catalogue, plain versus script and the limits in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const term of [
        'msm:rules',
        'prefer a rule book for behaviour',
        'rather than a script',
        '"only_if"',
        '"<namespace>:rules"',
        '"<subject id>_rules_<trigger>"',
        'Copy as my own script',
        'at most 3 levels deep',
        'at most 50 steps',
        'at most 100 times',
        'at most 64 blocks',
        'needs a game restart',
        'reload',
        'Fabric mod jar',
        'rules.needs-jar',
        'rules.not-in-eject',
        'run_checks compiles the books',
      ]) {
        expect(text, term).toContain(term);
      }
    },
  );

  it('names every catalogue id, plain step, cancellable trigger and template it lists', () => {
    const text = systemPrompt('build');
    const all = [
      ...Object.values(RULES_PROMPT_IDS).flat(),
      ...RULES_PROMPT_PLAIN_STEPS,
      ...RULES_PROMPT_CANCELLABLE,
      ...RULES_PROMPT_TEMPLATES,
    ];
    for (const id of all) expect(text, id).toMatch(new RegExp(`\\b${id}\\b`));
    expect(RULES_PROMPT_PLAIN_STEPS.every((id) => RULES_PROMPT_IDS.steps.includes(id))).toBe(true);
    expect(RULES_PROMPT_CANCELLABLE.every((id) => RULES_PROMPT_IDS.triggers.includes(id))).toBe(
      true,
    );
  });
});

describe('systemPrompt vehicles, key binds and HUD paragraphs (ADR 0091 D8)', () => {
  it.each(['chat', 'build'] as const)(
    'names the kinds, flows, keys and limits in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const term of [
        'msm:vehicle',
        'msm:key_bind',
        'msm:hud',
        'max_speed in blocks a tick',
        'the first seat drives',
        "Its item has the vehicle's id",
        '"Car" (vehicle-car)',
        '"Tank" (vehicle-tank',
        '"Plane" (vehicle-plane)',
        '"Boat" (vehicle-boat)',
        'car_name',
        'fire (R), second fire (V), horn (H) and descend (Left Alt)',
        'never a key bind',
        'default_key',
        'key.keyboard.j',
        'msm:on_press',
        'msm:on_release',
        'msm:while_held',
        'a button for every player',
        'while a screen or the chat is open',
        '"above_hotbar"',
        '{value}',
        'speed in blocks a second',
        'rules.counter.<name>',
        'show_hud, hide_hud and set_hud',
        'not with show_action_bar',
        'needs a game restart',
        'never run on rails',
        'hoppers do not reach their storage',
        'controls.needs-jar',
        'vehicles.needs-jar',
        'note_missing_feature',
        // Script API 1.5 (B421).
        'Script API 1.5',
        'player.showHud(id)',
        'player.setHud(id, value)',
        'Entity.asVehicle()',
        'damageTaken and setDamageTaken',
        'ammo(weapon) and setAmmo',
        'key.pressed',
        'vehicle.destroyed',
        'not reported to scripts',
      ]) {
        expect(text, term).toContain(term);
      }
    },
  );
});

describe('systemPrompt vanilla parity paragraphs (ADR 0101 D7)', () => {
  it.each(['chat', 'build'] as const)(
    'names the types, components, kinds, flows and limits in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const term of [
        '"bed" (rule "bed" or "straw_bed"',
        '"hanging_sign" (wood_type required)',
        '"stem" (fruit block required',
        '"<id>_wall"',
        '"<id>_attached"',
        'hanging_gui',
        'msm:waterloggable',
        'msm:weathering',
        'msm:waxable',
        '"oxidized"',
        'honeycomb',
        'Machines cannot age',
        'msm:item_inventory',
        'sneak_use',
        'msm:bundle',
        'bundle_textures',
        'max_stack_size 1',
        'bags never go into bags',
        'msm:command',
        'msm:creative_tab',
        '$(name)',
        'never both',
        'feedback_text',
        '"as_listed" or "by_name"',
        'is not registered under that name',
        'raw macro text',
        'names or selectors',
        'permission level 2',
        'block items, then items, then spawn eggs',
        'shows no picture',
        '/reload',
        '"Lights" (lights',
        '"Bed" (bed',
        '"Copper set" (copper-set',
        '"Backpack" (backpack',
        '"Custom command" (custom-command',
        '"Creative tab" (creative-tab',
        'export.needs-jar',
        'For custom commands and creative tabs use',
      ]) {
        expect(text, term).toContain(term);
      }
      expect(text).not.toContain('Signs, hanging signs, boats and shelves are not available');
    },
  );
});

describe('systemPrompt traders, jobs, storage, shoulder pets, fluids and dimension types (ADR 0101 D7, batch 2)', () => {
  it.each(['chat', 'build'] as const)(
    'names the kinds, components, ids, flows, codes and limits in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const term of [
        'msm:trader',
        'msm:villager_profession',
        'msm:storage',
        'msm:shoulder_riding',
        'msm:fluid',
        'minecraft:villager_trade',
        'minecraft:trade_set',
        'minecraft:tag/villager_trade',
        'minecraft:dimension_type',
        // The trade editor's layout (B480).
        '"<id>/level_<n>"',
        '"#<id>/level_<n>_trades"',
        '"<id>/level_<n>/<price>_<product>"',
        'emerald_copper_ingot',
        'update_element the mob',
        // Professions (ADR 0098 D2, B476).
        '"<id>/level_1" to "<id>/level_5"',
        'two random trades',
        '"#minecraft:<job>/level_<n>"',
        'entity/villager/profession/',
        // Storage and shoulders (ADR 0098 D3, D4 as amended).
        'needs_chest',
        'inventory key while riding',
        'at most 0.7 blocks wide',
        'two pets at most, one on each shoulder',
        // Fluids (ADR 0099 with B475's findings).
        'behaves_like',
        'ceil(8 / drop_off) - 1',
        '"<id>_bucket"',
        '"flowing_"',
        'on_entity_inside',
        'only vanilla lava does',
        'blocks.fluidModel is "two_fluids"',
        'a resource pack can repaint a fluid',
        // Dimension types (ADR 0100).
        'worldgen.dimensionHeight',
        'worldgen.environmentAttributes',
        'minecraft:visual/sky_color',
        'minecraft:visual/has_sky_occluder',
        'Gravity per dimension',
        // Limits for the user (B474).
        'no gossip, no Hero of the Village',
        'Villager Trade Rebalance experiment',
        // Flows.
        '"Wandering merchant" (wandering-merchant',
        '"Village job" (village-job',
        '"Fluid" (fluid',
        '"Carries a chest"',
        '"Rides on your shoulder"',
        '"Give it its own sky and rules"',
        'export.not-in-eject',
        'note_missing_feature',
      ]) {
        expect(text, term).toContain(term);
      }
      for (const code of VILLAGERS_FLUIDS_PROMPT_CODES) expect(text, code).toContain(`"${code}"`);
      for (const id of VILLAGERS_FLUIDS_PROMPT_TEMPLATES) expect(text, id).toContain(id);
      for (const answer of Object.values(VILLAGERS_FLUIDS_FLOW_ANSWERS).flat()) {
        expect(text, answer).toContain(answer);
      }
      // Fluids and dimension types are no longer listed as missing.
      expect(text).not.toContain('fluids and energy are not available');
      expect(text).not.toContain('dimension types cannot be edited here');
    },
  );
});

describe('systemPrompt plants, pots, storage, sounds and vanilla block rules (ADRs 0103 to 0106, ADR 0112 D2, batch 1)', () => {
  it.each(['chat', 'build'] as const)(
    'names the types, fields, components, kinds, flows, codes and limits in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const term of [
        // The five types (ADR 0103 D1, D2 as frozen by B506).
        '"growing_plant"',
        '"column_plant"',
        '"multiface"',
        '"dripleaf"',
        '"flower_pot"',
        'max_age 0 to 25',
        'at most 26 blocks',
        'growth_chance',
        'needs_water',
        'berries { item, light }',
        'style "cane", "cactus" or "bamboo"',
        'min_height',
        'blocks.plantSoils',
        'needs_water_nearby',
        'touch_damage',
        'tilt_ticks [2, 10, 10]',
        'grows_into',
        'pot (default "minecraft:flower_pot")',
        '"<id>_plant"',
        '"<id>_shoot"',
        '"<id>_stem"',
        '"<pot path>_<plant path>"',
        'head_berries',
        'stem_bottom',
        // Storage (ADR 0104 D3 to D6).
        'double, per_player',
        'one six-row chest',
        'as an ender chest',
        'rod, button, pressure_plate, fence, fence_gate and wall',
        'lightning scrapes it back',
        'double chests hold water by themselves',
        'containers and machines included',
        // Sounds, set types and pairs (ADR 0105 as frozen by B506).
        'block_sounds',
        'blocks.soundTypes',
        'blocks.soundModel is "block_sound_set"',
        'after the world is opened again',
        'or an own set type object',
        'can_open_by_wind_charge',
        'arrows_press',
        'plate_sensitivity "everything"',
        'msm:flattenable',
        'msm:tillable',
        'msm:vanilla_block_rules',
        'burn_odds and ignite_odds',
        "replaces vanilla's and warns",
        // Data kinds (ADR 0106 D1, D2).
        'minecraft:decorated_pot_pattern',
        'minecraft:block_transformer',
        'minecraft:test_environment',
        'minecraft:test_instance',
        'minecraft:sulfur_cube_archetype',
        'minecraft:context_int_provider',
        'minecraft:context_float_provider',
        'minecraft:post_effect',
        'minecraft:shader',
        'minecraft:waypoint_style',
        'Import assets, Shaders',
        'MSM does not check them',
        'Wolf sound variants are not available yet',
        // Flows (B508, B518).
        '"Cave plants" (cave-plants',
        '"Desert plants" (desert-plants',
        '"Flower pot" (flower-pot',
        '"Banner pattern" (banner-pattern',
        '"Armour trim" (armour-trim',
        '"Glider" (glider',
        '"Pot pattern" (pot-pattern',
        'fence_gate, wall and chest',
        'vanilla items with components',
        // The limits (plan N1 to N9, the notes of B509 to B518).
        'export.needs-jar',
        'export.not-in-eject',
        'holds only the plants it lists',
        'looks flat in it',
        'flowers potted',
        'lightning ignores waxed blocks',
        'project rods do not attract it',
        'copper golems do not wax or scrape project blocks',
        'a double chest always holds water',
        'follow the player, not the block',
        'a machine cannot age',
        'from its spawn egg',
        'no palette file',
      ]) {
        expect(text, term).toContain(term);
      }
      for (const code of PLANTS_STORAGE_PROMPT_CODES) expect(text, code).toContain(`"${code}"`);
      for (const id of PLANTS_STORAGE_PROMPT_TEMPLATES) expect(text, id).toContain(id);
      for (const answer of Object.values(PLANTS_STORAGE_FLOW_ANSWERS).flat()) {
        expect(text, answer).toContain(answer);
      }
      // No longer described as missing.
      expect(text).not.toContain('Containers and machines cannot hold water or age');
      expect(text).not.toContain('No glow lichen, kelp');
    },
  );

  it('mentions the Try it Grow and Lightning tools', () => {
    const text = systemPrompt('chat');
    expect(text).toContain('Grow tool');
    expect(text).toContain('Lightning tool');
  });
});

describe('systemPrompt buckets, flight, habits, boats, fluids 2, villager looks, game rules and statistics (ADRs 0107 to 0111, ADR 0112 D2, batch 2)', () => {
  it.each(['chat', 'build'] as const)(
    'names the fields, components, kinds, flows, codes and limits in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const term of [
        // Traders 2, villager homes and looks (ADR 0107 as amended).
        'reputation { hurt',
        'gift_item',
        'decay_per_day',
        'price_step',
        'demand (default true',
        'work_site, a block or "#" tag',
        'within 16 blocks',
        "not vanilla's gossip",
        'only while they work',
        'Villagers claim a project bed',
        'msm:villager_type',
        'entity/villager/type/<path>',
        'entity/zombie_villager/type/<path>',
        'entities.villagerTypes',
        'only a look and a biome list',
        // Fluids 2 (ADR 0108 as amended).
        'mixing: 1 to 16 rules',
        'cauldron { levels }',
        'bottle { food, effects, on_drink }',
        '"<id>_cauldron"',
        '"<id>_bottle"',
        '1.6 seconds',
        'boats float and paddle on a water-like fluid',
        'dispensers do not fill or empty project cauldrons',
        // Mobs 2 (ADR 0109 as amended).
        'msm:bucketable',
        '"<id>_bucket" (stacks to 1',
        'bucket_display_name',
        '"hover" (floats hover_height',
        '"phase" (flies as "fly"',
        '"swoop"',
        '"roost"',
        '"collect_items"',
        '"dig_items"',
        '"play_dead"',
        '"barter"',
        'dash { power',
        'two pets at most',
        'parrots keep their shoulders',
        "a warden's senses",
        'keeps its normal pose',
        // Boats (ADR 0110).
        'msm:boat',
        '"<wood>_chest_boat"',
        '"<wood>_chest_raft"',
        'entity/boat/<wood>',
        'entity/chest_boat/<wood>',
        '"#minecraft:chest_boats"',
        'by dispensers',
        "reuses vanilla's pictures",
        // Commands, Rules, game rules and statistics (ADR 0111).
        '"player_crafted"',
        '"player_advancement"',
        'Crafters and dispensers do not fire',
        'recipe advancements',
        '"command_argument"',
        'world.gameRule(id)',
        'player.addStat(id, amount)',
        'player.openDialog(id)',
        'event.args',
        'item.picked_up',
        'player.woke',
        'rules.not-in-eject',
        '"<namespace>:allow_<name>"',
        // Limits N10 to N26 in plain words.
        "fixed at the game's start",
        'fish buckets are for swimming mobs only',
        "vanilla's three formats",
        'the Java project export includes the liquids, cauldrons, bottles, jobs, villager looks',
        'checked in the game',
        // Q27: gravity the vanilla way.
        'minecraft:gravity base set',
        // Flows.
        '"Villager look" (villager-look',
        '"Game rule" (game-rule',
      ]) {
        expect(text, term).toContain(term);
      }
      for (const code of MOBS_COMMANDS_PROMPT_CODES) expect(text, code).toContain(`"${code}"`);
      for (const id of MOBS_COMMANDS_PROMPT_TEMPLATES) expect(text, id).toContain(id);
      for (const answer of Object.values(MOBS_COMMANDS_FLOW_ANSWERS).flat()) {
        expect(text, answer).toContain(answer);
      }
      for (const [flow, parameter] of Object.entries(NEW_FLOW_PROMPT_IDS)) {
        expect(text, flow).toContain(flow);
        expect(text, parameter).toContain(parameter);
      }
      // No longer described as missing or left out.
      expect(text).not.toContain('prices do not change with demand or reputation');
      expect(text).not.toContain('cauldrons, bottles and potions of a fluid');
      expect(text).not.toContain('fetching items like an allay');
      expect(text).not.toContain('and the Java project export leaves them out');
    },
  );

  it('names the two new flows with their name parameter', () => {
    expect(NEW_FLOW_PROMPT_IDS['villager-look']).toBe('look_name');
    expect(NEW_FLOW_PROMPT_IDS['game-rule']).toBe('rule_name');
  });
});

describe('systemPrompt Try it line', () => {
  it('says Try it proves nothing and points to Play', () => {
    for (const mode of ['chat', 'build'] as const) {
      const text = systemPrompt(mode);
      expect(text).toContain('Never tell a user that Try it proved');
      expect(text).toContain('Play in Minecraft');
    }
  });
});

describe('systemPrompt textures (ADR 0092 D15)', () => {
  it('lists every drawn recipe once, in words', () => {
    const rows = Object.values(TEXTURE_PROMPT_RECIPES).flat();
    expect(rows.map(([id]) => id).sort()).toEqual([...ART_RECIPE_NAMES].sort());
    for (const mode of ['chat', 'build'] as const) {
      const text = systemPrompt(mode);
      for (const [id, words] of rows) {
        expect(text, id).toContain(id === words ? id : `${id} (${words})`);
      }
    }
  });

  it('says MSM draws the pictures in a Minecraft-like style and never calls them placeholders', () => {
    for (const mode of ['chat', 'build'] as const) {
      const text = systemPrompt(mode);
      expect(text).toContain('Minecraft-like style');
      expect(text).toContain('never copied, traced or recoloured');
      expect(text).toContain('Draw...');
      expect(text).not.toMatch(/placeholder/i);
    }
  });
});

describe('systemPrompt worlds and the live world map (ADR 0119, B590)', () => {
  it.each(['chat', 'build'] as const)(
    'names the five world flows and their answers in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      for (const [flow, title] of [
        ['world-islands', 'Islands'],
        ['world-mountains', 'Tall mountains'],
        ['world-one-biome', 'One biome everywhere'],
        ['world-caves', 'Caves only'],
        ['world-empty-sky', 'Empty sky with a start island'],
      ] as const) {
        expect(text, flow).toContain(`"${title}" (${flow}: world_name`);
        expect(NEW_FLOW_PROMPT_IDS[flow]).toBe('world_name');
        for (const answer of WORLD_FLOW_ANSWERS[flow])
          expect(text, `${flow}: ${answer}`).toContain(answer);
      }
      expect(text).toContain('"Make a world"');
    },
  );

  it('says the map shows the changes, with the labels of the app', () => {
    const text = systemPrompt('build');
    for (const label of [
      'Preview tab',
      '"Biomes", "Height", "Side cut" and "Climate"',
      '"Seed of one of my worlds"',
      '"Compare with vanilla"',
      '"Value map"',
      '"Scatter"',
      '"See it on the map" and "Walk in it"',
      '"My world generation"',
      '"Make the land around me"',
      'say that the map and the ground show the change',
    ]) {
      expect(text, label).toContain(label);
    }
  });

  it('states the limits in plain words', () => {
    const text = systemPrompt('chat');
    for (const limit of [
      "not the game's generator",
      'Play is the real check',
      'trees, plants and ores are about right',
      'carved caves and ravines, buildings and the land the game shapes around buildings are not drawn',
      'show their real land with one biome',
      'the End is about right',
      'biome borders are only about right (the map says so)',
      'debug worlds are only in the game',
    ]) {
      expect(text, limit).toContain(limit);
    }
    // Try it's ground is there now.
    expect(text).not.toContain('world generation and other dimensions are not there');
  });

  it('never carries a vanilla worldgen file or path (ADR 0119 D2)', () => {
    for (const mode of ['chat', 'build'] as const) {
      const text = systemPrompt(mode);
      expect(text).toContain("You never receive Minecraft's own world generation files");
      expect(text).not.toMatch(/data\/minecraft\//);
      expect(text).not.toMatch(/worldgen\/[a-z_/]+\.json/);
      expect(text).not.toContain('noise_router');
      expect(text).not.toContain('"final_density":');
    }
  });
});
