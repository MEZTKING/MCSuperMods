/**
 * The system prompt as one file per topic (AI helper 2, B681). Each topic file holds its
 * paragraphs and the constants the app's tests pin; this file assembles them in order. Since
 * B682 there is one text for every run (ADR 0125 D2), its facts are constants (D7), and it
 * speaks to the user's mode and knows the app (D6); its hash is pinned in
 * `test/system-prompt.test.ts`.
 */
import { APP_MAP } from './app-map';
import { BLOCKS } from './blocks';
import { CONTAINERS, SCRIPT_API_12 } from './containers';
import { CORE_HEAD, CORE_MIDDLE, CORE_TAIL } from './core';
import { EFFECTS } from './effects';
import { MOBS } from './mobs';
import { MOBS_AND_COMMANDS } from './mobs-commands';
import { HOW_TO_WORK } from './modes';
import { PARTICLES, SCRIPT_API_13 } from './particles';
import { PLANTS_AND_STORAGE } from './plants-storage';
import { PORTALS } from './portals';
import { RULES } from './rules';
import {
  SAVED_DATA,
  SCRIPT_API_10,
  SCRIPT_API_11,
  SCRIPT_API_14,
  SCRIPT_API_16,
  TRIGGERS,
} from './scripts';
import { SPEAKING } from './speaking';
import { TEXTURES } from './textures';
import { TRY_IT } from './try-it';
import { MORE_DATA_KINDS, POTIONS, VANILLA_ADDITIONS } from './vanilla-additions';
import { VANILLA_PARITY } from './vanilla-parity';
import { SCRIPT_API_15, VEHICLES } from './vehicles';
import { VILLAGERS_AND_FLUIDS } from './villagers-fluids';
import { WORLDS } from './worlds';

export * from './app-map';
export * from './facts';
export * from './mobs-commands';
export { HOW_TO_WORK, PLAN_FIRST_ABOVE } from './modes';
export * from './not-available';
export * from './plants-storage';
export * from './rules';
export { SCRIPT_API_PROMPT_VERSIONS, type ScriptApiPromptVersion } from './scripts';
export * from './speaking';
export * from './textures';
export {
  TRY_IT_PROMPT_AREA,
  TRY_IT_PROMPT_COMMANDS,
  TRY_IT_PROMPT_GROUNDS,
  TRY_IT_PROMPT_LABELS,
  TRY_IT_PROMPT_SCRIPT_SECONDS,
  TRY_IT_PROMPT_TICK_COMMANDS,
  TRY_IT_PROMPT_TOOLS,
} from './try-it';
export {
  MOB_VARIANT_PROMPT_KINDS,
  MORE_DATA_PROMPT_KINDS,
  MORE_TAG_PROMPT_KINDS,
} from './vanilla-additions';
export * from './vanilla-parity';
export * from './vehicles';
export * from './villagers-fluids';
export * from './worlds';

/** The prompt: the opening, how to speak, each topic paragraph, the app, then how to work. */
const PARAGRAPHS = [
  CORE_HEAD,
  SPEAKING,
  TEXTURES,
  CORE_MIDDLE,
  EFFECTS,
  VANILLA_ADDITIONS,
  TRIGGERS,
  SAVED_DATA,
  POTIONS,
  MORE_DATA_KINDS,
  SCRIPT_API_10,
  SCRIPT_API_11,
  SCRIPT_API_12,
  SCRIPT_API_13,
  SCRIPT_API_14,
  SCRIPT_API_15,
  SCRIPT_API_16,
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
  APP_MAP,
  CORE_TAIL,
].join('\n');

/** The one system prompt (ADR 0125 D2: the same text whatever the size of the run). */
const PROMPT = `${PARAGRAPHS}\n\n${HOW_TO_WORK}`;

/** The assembled system prompt; the same text for every run. */
export function assemblePrompt(): string {
  return PROMPT;
}
