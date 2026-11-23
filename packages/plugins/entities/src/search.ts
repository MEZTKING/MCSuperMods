/**
 * The plugin's search data (plugin API 1.23.0, ADR 0124 D5, D13; B655): the plain words of the
 * mob, vehicle, village job and villager look kinds and of the plugin's templates, where their
 * titles do not carry them, and the technical words of the area (entities, mob AI, hostile and
 * passive, steering), loaded lazily through `searchData()`. The words of the things the Creator
 * flows make (mobs, pets, mounts, vehicles, bosses, villagers and their jobs, taming and
 * breeding) are the library's; spawning is the Rules plugin's word. Every line is data; `test/search.test.ts` checks it with
 * `validateSearchContributions` and checks every vanilla id against both targets.
 */

import type { PluginSearchData } from '@msm/plugin-api';

export const SEARCH: PluginSearchData = {
  vocabulary: {
    words: [
      {
        idea: 'entity',
        same: ['entities', 'entity type', 'living thing'],
        near: ['mob', 'creature'],
        misspellings: ['entitiy', 'enitity', 'entety'],
      },
      {
        idea: 'ai',
        same: ['mob ai', 'brain', 'pathfinding'],
        near: ['wanders', 'targets', 'thinks'],
      },
      {
        idea: 'hostile',
        same: ['attacks players', 'enemy', 'enemies', 'evil'],
        near: ['monster'],
      },
      {
        idea: 'passive',
        same: ['peaceful', 'friendly', 'harmless', 'neutral'],
        near: ['animal', 'never attacks'],
      },
      {
        idea: 'steer',
        same: ['drive', 'driving', 'pilot', 'steering'],
        near: ['wheel', 'throttle'],
      },
    ],
  },
  keywords: {
    // Kinds.
    'msm:entity': ['mob', 'creature', 'monster', 'animal', 'npc', 'custom mob', 'beast'],
    'msm:vehicle': ['vehicle', 'car', 'plane', 'boat', 'drive', 'ride', 'transport'],
    'msm:villager_profession': [
      'job',
      'village job',
      'profession',
      'villager work',
      'trades',
      'workstation',
    ],
    'msm:villager_type': [
      'villager look',
      'villager skin',
      'villager outfit',
      'biome villager',
      'clothes',
    ],
    // Templates: mobs.
    msm_entity_creature: ['animal', 'mob', 'critter', 'beast', 'wanders'],
    msm_entity_monster: ['hostile', 'enemy', 'zombie-like', 'attacks', 'evil'],
    msm_entity_ambient: ['bat-like', 'critter', 'background mob', 'ambient', 'harmless'],
    msm_entity_pet: ['tame', 'dog', 'cat', 'companion', 'follows you', 'sits'],
    msm_entity_farm_animal: ['cow-like', 'livestock', 'breed', 'farm', 'passive'],
    msm_entity_mount: ['ride', 'horse', 'saddle', 'steed', 'rideable'],
    msm_entity_flying: ['flies', 'bird', 'bat', 'wings', 'flyer'],
    msm_entity_fish: ['fish', 'swims', 'water mob', 'sea creature'],
    msm_entity_archer: ['skeleton-like', 'shoots arrows', 'bow', 'ranged', 'archer'],
    msm_entity_boss: ['boss', 'boss bar', 'miniboss', 'strong mob', 'raid boss'],
    msm_entity_wandering_merchant: ['trader', 'merchant', 'wandering trader', 'shop', 'sells'],
    msm_entity_fair_trader: ['reputation', 'discount', 'remembers', 'trader'],
    msm_entity_pack_mule: ['mule', 'donkey', 'carries a chest', 'storage', 'pack animal'],
    msm_entity_shoulder_pet: ['parrot-like', 'shoulder', 'sits on shoulder', 'pet'],
    msm_entity_bucket_fish: ['bucket', 'catch in a bucket', 'axolotl-like', 'fish'],
    msm_entity_hovering: ['hovers', 'floats', 'levitates', 'ghost-like'],
    msm_entity_swooping: ['swoops', 'dives', 'phantom-like', 'flyer'],
    msm_entity_phasing: ['ghost', 'spirit', 'goes through walls', 'vex-like'],
    msm_entity_roosting: ['roosts', 'perches', 'bat-like', 'sleeps upside down'],
    msm_entity_collector: ['picks up items', 'collects', 'allay-like', 'gathers'],
    msm_entity_digger: ['digs', 'sniffer-like', 'finds items', 'burrows'],
    msm_entity_barterer: ['barter', 'piglin-like', 'swaps', 'trades gold'],
    msm_entity_dash_mount: ['dash', 'camel-like', 'charge', 'mount', 'ride'],
    // Templates: vehicles.
    msm_vehicle_go_kart: ['kart', 'racing', 'go kart', 'drive'],
    msm_vehicle_car: ['automobile', 'drive', 'truck', 'jeep'],
    msm_vehicle_tank: ['army', 'cannon', 'military', 'shoots'],
    msm_vehicle_biplane: ['plane', 'aeroplane', 'airplane', 'fly', 'aircraft'],
    msm_vehicle_helicopter: ['chopper', 'heli', 'fly', 'aircraft'],
    msm_vehicle_motorboat: ['speedboat', 'boat', 'water', 'ship'],
    msm_vehicle_raft: ['boat', 'float', 'water', 'log raft'],
    msm_vehicle_hovercraft: ['hover', 'floats', 'over water', 'hover car'],
    // Templates: villagers.
    msm_villager_profession: ['job', 'profession', 'workstation', 'villager trades'],
    msm_villager_type: ['villager skin', 'outfit', 'clothes', 'biome villager'],
  },
};
