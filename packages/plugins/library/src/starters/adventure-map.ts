/**
 * The Adventure map Creator flow (ADR 0117 D2, ADR 0113 D2, D7; B557): the start of a map of your
 * own, built in the game and brought back (ADR 0116 D3). Players start in adventure mode (they
 * cannot break blocks), are welcomed by a message or a welcome screen (a dialog), and pass
 * checkpoints that set where they respawn; the world's game rules are set once when it starts, and
 * goals mark the way.
 *
 * It makes a `msm:world_setup` (the game's own world, or a flat world of the map's own), a
 * `minecraft:dialog` when the welcome is a screen, and for each checkpoint a `msm:area` (a column
 * five blocks wide through the whole height, every 32 blocks east of the spawn, so the land under
 * it does not matter; move them in the Area Studio), an advancement granted when a player stands
 * in it (a `minecraft:location` criterion testing the entity tag the area gives the players inside,
 * so moving the area moves the checkpoint) and the advancement's reward, a function that sets the player's spawn
 * point and says so. With goals on, the checkpoints are the goals of a tab; else they are hidden
 * advancements. No rule and no jar: everything lowers to plain data pack files.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  Json,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  setValue,
  stringValue,
} from '../content/parameters';
import { type GoalChoice, goalsRootId, goalsTabBundle } from './goals';
import { GAME_KINDS, inAreaCriterion, vanillaRule } from './skyblock';

/** The game rules the map can set when its world starts, each a vanilla rule and its value. */
export const MAP_GAME_RULES: readonly {
  value: string;
  label: string;
  rule: string;
  setting: boolean;
}[] = Object.freeze([
  { value: 'no_griefing', label: 'Mobs do not break blocks', rule: 'mob_griefing', setting: false },
  { value: 'keep_inventory', label: 'Keep things on death', rule: 'keep_inventory', setting: true },
  { value: 'always_day', label: 'Always day', rule: 'advance_time', setting: false },
  { value: 'no_weather', label: 'No weather', rule: 'advance_weather', setting: false },
  { value: 'no_fall_damage', label: 'No fall damage', rule: 'fall_damage', setting: false },
  { value: 'no_monsters', label: 'No monsters', rule: 'spawn_monsters', setting: false },
]);

/** How far apart the checkpoints are, east of the spawn. */
const CHECKPOINT_STEP = 32;

/** The Adventure map flow's questions, groups "Map", "Start" and "Checkpoints". */
export const ADVENTURE_MAP_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'map_name',
    label: 'What is your map called?',
    description: 'Ids derive from it: Lost Temple gives lost_temple.',
    group: 'Map',
    type: 'string',
    default: 'Lost Temple',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'world',
    label: 'How my world starts',
    group: 'Map',
    type: 'choice',
    default: 'vanilla',
    choices: [
      { value: 'vanilla', label: 'As normal' },
      { value: 'flat', label: 'Flat' },
    ],
  },
  {
    id: 'start_as',
    label: 'Start as',
    description: 'Adventure: players cannot break or place blocks unless an item allows it.',
    group: 'Start',
    type: 'choice',
    default: 'adventure',
    choices: [
      { value: 'adventure', label: 'Adventure' },
      { value: 'survival', label: 'Survival' },
      { value: 'creative', label: 'Creative' },
    ],
  },
  {
    id: 'welcome',
    label: 'Welcome',
    group: 'Start',
    type: 'choice',
    default: 'message',
    choices: [
      { value: 'message', label: 'Welcome message' },
      { value: 'dialog', label: 'Welcome screen' },
      { value: 'none', label: 'None' },
    ],
  },
  {
    id: 'welcome_text',
    label: 'What the welcome says',
    group: 'Start',
    type: 'string',
    default: 'Welcome, adventurer! Find the treasure at the end of the road.',
    maxLength: 200,
  },
  {
    id: 'game_rules',
    label: 'Game rules when the world starts',
    group: 'Start',
    type: 'set',
    default: ['no_griefing', 'keep_inventory'],
    choices: MAP_GAME_RULES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'checkpoints',
    label: 'Checkpoints',
    description:
      'Places where players respawn once they have reached them, every 32 blocks east of the spawn. Move them in the Area Studio.',
    group: 'Checkpoints',
    type: 'number',
    default: 3,
    min: 0,
    max: 5,
    step: 1,
  },
  {
    id: 'goals',
    label: 'Goals',
    description: 'A tab in the advancements screen with a goal for each checkpoint.',
    group: 'Checkpoints',
    type: 'boolean',
    default: true,
  },
]);

export function adventureMapBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName, target } = context;
  const values = readValues(ADVENTURE_MAP_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'map_name'));
  const id = name.id;
  const flat = stringValue(values, 'world') === 'flat';
  const welcome = stringValue(values, 'welcome');
  const text = stringValue(values, 'welcome_text').trim() || `Welcome to ${name.display}!`;
  const count = Math.max(0, Math.min(5, Math.round(numberValue(values, 'checkpoints'))));
  const gameMode = stringValue(values, 'start_as');
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.display}, an adventure map`),
  ];

  const gameRules: JsonObject = {};
  const ruleWords: string[] = [];
  for (const value of setValue(values, 'game_rules')) {
    const entry = MAP_GAME_RULES.find((choice) => choice.value === value);
    const rule = entry === undefined ? undefined : vanillaRule(target, entry.rule);
    if (entry === undefined || rule === undefined) continue;
    gameRules[rule] = entry.setting;
    ruleWords.push(entry.label.toLowerCase());
  }

  const newPlayer: JsonObject = {};
  if (welcome === 'message') newPlayer.message = text;
  if (welcome === 'dialog') {
    const dialog = rl(namespace, `${id}/welcome`);
    elements.push(
      element(
        dialog,
        KINDS.dialog,
        {
          type: 'minecraft:notice',
          title: { text: name.display, color: 'gold' },
          body: { type: 'minecraft:plain_message', contents: text },
          action: { label: 'Begin' },
        },
        "The welcome screen: a dialog of the type notice, with the map's name, the welcome and one button. The world setup opens it for each new player, once.",
      ),
    );
    newPlayer.dialog = dialog;
  }

  // Checkpoints: columns through the whole height, so the land under them does not matter.
  const checkpoints = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const x = n * CHECKPOINT_STEP;
    return {
      n,
      id: rl(namespace, `${id}/checkpoint_${n}`),
      reached: rl(namespace, `${id}/reached_checkpoint_${n}`),
      from: [x - 2, -64, -2],
      to: [x + 2, 319, 2],
      x,
    };
  });
  for (const checkpoint of checkpoints) {
    elements.push(
      element(
        checkpoint.id,
        GAME_KINDS.area,
        {
          name: `Checkpoint ${checkpoint.n}`,
          dimension: 'minecraft:overworld',
          from: [...checkpoint.from],
          to: [...checkpoint.to],
        },
        `Checkpoint ${checkpoint.n}: a column five blocks wide through the whole height of the overworld, ${checkpoint.x} blocks east of the spawn. Its tick function tags the players inside, and the checkpoint's advancement tests that tag, so moving the area in the Area Studio moves the checkpoint. Move it onto your build.`,
      ),
      element(
        checkpoint.reached,
        KINDS.function,
        {
          lines: [
            `# Checkpoint ${checkpoint.n} of ${name.display}: run as the player who reached it`,
            'spawnpoint @s ~ ~ ~',
            `title @s actionbar {"text":"Checkpoint ${checkpoint.n} reached","color":"gold"}`,
          ],
        },
        `Run as the player when they first reach checkpoint ${checkpoint.n} (the reward of its advancement): their spawn point is set where they stand and the action bar says so.`,
      ),
    );
  }

  const setup: JsonObject = {
    world: flat
      ? {
          type: 'flat',
          layers: [
            { block: 'minecraft:bedrock', height: 1 },
            { block: 'minecraft:dirt', height: 2 },
            { block: 'minecraft:grass_block', height: 1 },
          ],
          nether: 'vanilla',
          end: 'vanilla',
        }
      : { type: 'vanilla', nether: 'vanilla', end: 'vanilla' },
    spawn_radius: 0,
    game_mode: gameMode,
    difficulty: 'normal',
    game_rules: gameRules,
  };
  if (Object.keys(newPlayer).length > 0) setup.new_player = newPlayer;

  const checkpointGoals: GoalChoice[] = checkpoints.map((checkpoint) => ({
    value: `checkpoint_${checkpoint.n}`,
    label: `Checkpoint ${checkpoint.n}`,
    title: `Checkpoint ${checkpoint.n}`,
    description: `Reach checkpoint ${checkpoint.n}`,
    icon: checkpoint.n === checkpoints.length ? 'minecraft:gold_block' : 'minecraft:lantern',
    frame: checkpoint.n === checkpoints.length ? 'goal' : 'task',
    criterion: inAreaCriterion(checkpoint.id),
    reward: checkpoint.reached,
    rewardWords: 'it sets their spawn point and says so',
  }));
  if (booleanValue(values, 'goals')) {
    const tab = goalsTabBundle(namespace, target, {
      base: `${id}/goals`,
      title: name.display,
      description: 'Follow the road',
      goals: checkpoints.length > 0 ? [] : ['get_diamond'],
      icon: 'minecraft:compass',
      colour: [196, 28, 52],
      background: 'adventure',
      extra: checkpointGoals,
    });
    elements.push(...tab.elements);
    setup.goals = goalsRootId(namespace, `${id}/goals`);
  } else {
    // Without goals each checkpoint is a hidden advancement (no display) with the same reward.
    for (const [index, goal] of checkpointGoals.entries()) {
      elements.push(
        element(
          rl(namespace, `${id}/checkpoints/checkpoint_${index + 1}`),
          KINDS.advancement,
          {
            criteria: { reached: structuredClone(goal.criterion) as Json },
            rewards: { function: goal.reward as string },
          },
          `Checkpoint ${index + 1}, hidden (no display): granted once when a player stands in its area, it runs ${goal.reward} as that player.`,
        ),
      );
    }
  }

  elements.splice(
    1,
    0,
    element(
      rl(namespace, id),
      GAME_KINDS.worldSetup,
      setup,
      `How the world starts: ${flat ? `a World Type called ${name.display}, flat grass on dirt over bedrock, listed on the Create New World screen` : "the game's own world (no World Type of its own)"}. Players play in ${gameMode} mode on normal difficulty${ruleWords.length > 0 ? `; when the world first starts the game rules are set: ${ruleWords.join(', ')}` : ''}.${welcome === 'none' ? '' : ` Each new player is welcomed by ${welcome === 'dialog' ? 'the welcome screen' : 'a message'}, once.`} Build your map in the game and bring the builds back as structures. Everything here lowers to plain data pack files.`,
    ),
  );
  return { elements, assets: [] };
}
