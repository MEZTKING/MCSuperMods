/**
 * The system prompt as one file per topic (AI helper 2, B681). Each topic file holds its
 * paragraphs and the constants the app's tests pin; this file assembles them in the order the
 * prompt has always had. Wording is not touched here: the text is byte-identical to the single
 * file it was moved from (pinned by a hash in `test/system-prompt.test.ts`).
 */
import type { AiMode } from '../protocol';
import { BLOCKS } from './blocks';
import { CONTAINERS, SCRIPT_API_12 } from './containers';
import { CORE_HEAD, CORE_MIDDLE, CORE_TAIL } from './core';
import { EFFECTS } from './effects';
import { MOBS } from './mobs';
import { MOBS_AND_COMMANDS } from './mobs-commands';
import { BUILD, CHAT } from './modes';
import { PARTICLES, SCRIPT_API_13 } from './particles';
import { PLANTS_AND_STORAGE } from './plants-storage';
import { PORTALS } from './portals';
import { RULES } from './rules';
import { SAVED_DATA, SCRIPT_API_11, SCRIPT_API_14, TRIGGERS } from './scripts';
import { TEXTURES } from './textures';
import { TRY_IT } from './try-it';
import { MORE_DATA_KINDS, POTIONS, VANILLA_ADDITIONS } from './vanilla-additions';
import { VANILLA_PARITY } from './vanilla-parity';
import { SCRIPT_API_15, VEHICLES } from './vehicles';
import { VILLAGERS_AND_FLUIDS } from './villagers-fluids';
import { WORLDS } from './worlds';

export * from './mobs-commands';
export * from './plants-storage';
export * from './rules';
export * from './textures';
export * from './vanilla-parity';
export * from './vehicles';
export * from './villagers-fluids';
export * from './worlds';

/** The core prompt: the opening, then each topic paragraph in the prompt's fixed order. */
const CORE = [
  CORE_HEAD,
  TEXTURES,
  CORE_MIDDLE,
  EFFECTS,
  VANILLA_ADDITIONS,
  TRIGGERS,
  SAVED_DATA,
  POTIONS,
  MORE_DATA_KINDS,
  SCRIPT_API_11,
  SCRIPT_API_12,
  SCRIPT_API_13,
  SCRIPT_API_14,
  SCRIPT_API_15,
  BLOCKS,
  CONTAINERS,
  PORTALS,
  PARTICLES,
  MOBS,
  VEHICLES,
  VANILLA_PARITY,
  VILLAGERS_AND_FLUIDS,
  PLANTS_AND_STORAGE,
  MOBS_AND_COMMANDS,
  RULES,
  WORLDS,
  TRY_IT,
  CORE_TAIL,
].join('\n');

/** The assembled system prompt of a mode. */
export function assemblePrompt(mode: AiMode): string {
  return `${CORE}\n\n${mode === 'build' ? BUILD : CHAT}`;
}
