/**
 * The words of the Rules catalogue for the search (ADR 0124 D5; B655): one word group per idea
 * of a trigger, step, condition or value label, whose `idea` is a word of that label, so a query
 * in other words ("mines", "kills", "tp", "xp", "countdown ends") reaches the Rule book's "When"
 * and "Do" lines; the 25 entries of Rules 3 for games (B553) included. Plain data.
 */

import type { SearchWordGroup } from '@msm/plugin-api';

/** Word groups of the triggers ("When ..."). */
const TRIGGER_WORDS: SearchWordGroup[] = [
  {
    idea: 'rule',
    same: ['rules', 'rule book', 'rulebook', 'when then', 'if then', 'trigger', 'triggers'],
    near: ['event', 'events', 'logic', 'behaviour', 'automation'],
    misspellings: ['rull', 'rulez'],
  },
  {
    idea: 'uses',
    same: [
      'use',
      'used',
      'right click',
      'right-click',
      'right clicks',
      'clicks',
      'interacts',
      'activates',
    ],
    near: ['tap', 'interact with'],
    slang: ['rclick', 'rmb'],
  },
  {
    idea: 'breaks',
    same: ['break', 'broken', 'mines', 'mined', 'digs', 'dug', 'smashes'],
    near: ['harvests', 'chops'],
  },
  {
    idea: 'steps',
    same: ['step', 'steps on', 'walks on', 'stands on', 'stepped on', 'lands on'],
    near: ['touches', 'walks over'],
  },
  {
    idea: 'random tick',
    same: ['now and then', 'over time', 'every so often'],
    near: ['grows', 'spreads'],
  },
  {
    idea: 'inside',
    same: ['in the block', 'stands in', 'standing in'],
  },
  {
    idea: 'opens',
    same: ['open', 'opened', 'opening'],
    near: ['looks inside'],
  },
  {
    idea: 'closes',
    same: ['close', 'closed', 'shuts'],
  },
  {
    idea: 'travels',
    same: ['travel', 'goes through', 'passes through', 'enters the portal', 'uses the portal'],
  },
  {
    idea: 'hits',
    same: ['hit', 'strikes', 'strike', 'punches', 'smacks', 'whacks', 'slashes', 'stabs'],
    near: ['melee', 'sword hit'],
  },
  {
    idea: 'held',
    same: ['hold', 'holds', 'holding', 'in hand', 'wielding', 'wields'],
    near: ['main hand', 'off hand', 'offhand'],
  },
  {
    idea: 'worn',
    same: ['wear', 'wears', 'wearing', 'equipped', 'puts on', 'has on'],
  },
  {
    idea: 'thrown',
    same: ['throw', 'throws', 'tossed', 'toss', 'chucked'],
    near: ['projectile', 'snowball'],
  },
  {
    idea: 'hurt',
    same: ['hurts', 'damaged', 'damages', 'harmed', 'injured', 'takes damage', 'gets hit'],
    near: ['pain', 'wounded'],
  },
  {
    idea: 'dies',
    same: ['die', 'died', 'death', 'killed', 'kills', 'slain', 'defeated', 'dead'],
    near: ['killing', 'murder', 'loses all hearts'],
    misspellings: ['dyes', 'deid'],
  },
  {
    idea: 'attacks',
    same: ['attack', 'attacked', 'fights', 'bites', 'charges'],
    near: ['aggro', 'aggressive'],
  },
  {
    idea: 'starts',
    same: ['start', 'started', 'begins', 'begin', 'kicks in'],
  },
  {
    idea: 'ends',
    same: ['ended', 'runs out', 'wears off', 'finishes', 'is over', 'time is up', 'times up'],
  },
  {
    idea: 'leaves',
    same: ['leave', 'logs out', 'log out', 'logout', 'quits', 'disconnects', 'exits'],
  },
  {
    idea: 'respawns',
    same: ['respawn', 'respawned', 'comes back', 'after dying', 'revives'],
  },
  {
    idea: 'chats',
    same: ['chat', 'chatted', 'types in chat', 'writes in chat'],
  },
  {
    idea: 'every',
    same: [
      'every few seconds',
      'repeatedly',
      'each second',
      'every second',
      'constantly',
      'periodically',
      'all the time',
      'on a loop',
    ],
    near: ['interval', 'always'],
  },
  {
    idea: 'gets on',
    same: ['gets in', 'climbs in', 'hops on', 'boards', 'sits on', 'climbs on'],
  },
  {
    idea: 'gets off',
    same: ['dismounts', 'dismount', 'gets out', 'climbs out', 'hops off', 'jumps off'],
  },
  {
    idea: 'picks up',
    same: ['pick up', 'picked up', 'collects', 'grabs', 'pickup', 'loots'],
  },
  {
    idea: 'eats',
    same: ['eat', 'ate', 'drinks', 'drink', 'consumes', 'swallows'],
  },
  {
    idea: 'sleep',
    same: ['sleeps', 'goes to bed', 'goes to sleep', 'lies in bed', 'naps'],
    near: ['bed'],
  },
  {
    idea: 'wakes',
    same: ['wake', 'wakes up', 'gets up'],
  },
  {
    idea: 'types',
    same: ['runs the command', 'uses the command', 'enters the command'],
  },
  {
    idea: 'presses',
    same: ['press', 'pressed', 'taps', 'hits the key'],
  },
  {
    idea: 'lets go',
    same: ['releases', 'released', 'let go', 'lifts'],
  },
  {
    idea: 'destroyed',
    same: ['destroy', 'wrecked', 'crashes', 'crashed', 'blown up'],
  },
  {
    idea: 'enters',
    same: ['enter', 'entered', 'goes into', 'walks into', 'arrives in', 'steps into', 'comes in'],
  },
  {
    idea: 'world starts',
    same: ['world loads', 'server starts', 'at the start', 'first load'],
  },
];

/** Word groups of the steps ("Do ..."). */
const STEP_WORDS: SearchWordGroup[] = [
  {
    idea: 'give',
    same: ['gives', 'grant', 'grants', 'award', 'awards', 'hand out'],
  },
  {
    idea: 'take',
    same: ['takes', 'take away', 'remove from inventory', 'confiscate', 'costs'],
  },
  {
    idea: 'heal',
    same: ['heals', 'healing', 'regenerate', 'restore health', 'health back', 'mend'],
    near: ['cure'],
  },
  {
    idea: 'feed',
    same: ['feeds', 'fill hunger', 'saturation', 'satiate', 'fill up'],
  },
  {
    idea: 'experience',
    same: ['experience points', 'experience orbs'],
    slang: ['xp', 'exp'],
    misspellings: ['experiance', 'expirience', 'experince'],
    vanillaIds: ['minecraft:experience_bottle', 'minecraft:experience_orb'],
  },
  {
    idea: 'game mode',
    same: ['gamemode', 'survival', 'creative', 'adventure', 'spectator', 'game modes'],
    slang: ['gm', 'gmc', 'gms'],
  },
  {
    idea: 'teleport',
    same: ['teleports', 'teleporting', 'warp', 'warps', 'blink', 'move to', 'send to'],
    slang: ['tp', 'tele'],
    misspellings: ['teleprt', 'telport', 'teliport'],
  },
  {
    idea: 'launch',
    same: ['launches', 'bounce', 'bounces', 'fling', 'flings', 'knock up', 'propel', 'catapult'],
    near: ['jump pad', 'trampoline', 'push'],
    slang: ['yeet', 'yeets'],
  },
  {
    idea: 'message',
    same: ['messages', 'chat message', 'tell', 'say', 'announce', 'broadcast', 'notify'],
    near: ['text', 'words'],
  },
  {
    idea: 'title',
    same: ['titles', 'big text', 'heading', 'subtitle', 'banner text', 'announcement'],
  },
  {
    idea: 'hotbar',
    same: ['action bar', 'actionbar', 'text above the hotbar', 'small text'],
  },
  {
    idea: 'remove',
    same: ['removes', 'delete', 'deletes', 'erase', 'clear', 'get rid of', 'despawn'],
  },
  {
    idea: 'weather',
    same: ['clear weather', 'sunny', 'forecast', 'clear skies'],
  },
  {
    idea: 'ride',
    same: ['rides', 'riding', 'make ride'],
  },
  {
    idea: 'boss bar',
    same: ['bossbar', 'health bar', 'boss health', 'progress bar'],
  },
  {
    idea: 'if',
    same: ['otherwise', 'else', 'only if'],
    near: ['branch'],
  },
  {
    idea: 'repeat',
    same: ['repeats', 'loop', 'loops', 'times', 'over and over', 'again'],
  },
  {
    idea: 'for each',
    same: ['each player', 'every player', 'all players', 'everyone'],
  },
  {
    idea: 'random',
    same: ['at random', 'randomly', 'pick one', 'gamble', 'lucky', 'roll'],
    near: ['dice', 'surprise', 'lottery'],
  },
  {
    idea: 'wait',
    same: ['waits', 'delay', 'pause', 'later', 'after a while'],
  },
  {
    idea: 'stop',
    same: ['stops', 'cancel', 'cancels', 'prevent', 'prevents', 'block it', 'disable'],
  },
  {
    idea: 'safe',
    same: ['keep the blocks safe', 'no block damage', 'protect blocks', 'no griefing'],
  },
  {
    idea: 'counter',
    same: ['counters', 'count', 'tally', 'variable', 'number'],
  },
  {
    idea: 'spawn',
    same: [
      'spawns',
      'spawned',
      'spawning',
      'summon',
      'summons',
      'appears',
      'shows up',
      'natural spawn',
    ],
    near: ['arrives', 'is born'],
    slang: ['/summon'],
  },
  {
    idea: 'joins',
    same: ['join', 'joined', 'logs in', 'log in', 'login', 'connects', 'first join', 'assign'],
    near: ['welcome'],
  },
  {
    idea: 'place',
    same: ['places', 'placed', 'put down', 'puts down', 'set block', 'setblock', 'sets down'],
  },
  {
    idea: 'explosion',
    same: [
      'explode',
      'explodes',
      'explosions',
      'blows up',
      'goes boom',
      'detonates',
      'boom',
      'kaboom',
    ],
    near: ['tnt', 'creeper', 'bomb'],
    vanillaIds: ['minecraft:tnt', 'minecraft:creeper'],
  },
  {
    // The step Set on fire (ADR 0127 D1).
    idea: 'set on fire',
    same: ['sets on fire', 'ignite', 'ignites', 'light on fire', 'catch fire', 'catches fire'],
    near: ['burn', 'burns', 'burning', 'flames'],
  },
  {
    idea: 'shoots',
    same: ['shoot', 'shooting', 'fires a shot', 'fires'],
    near: ['cannon', 'gun'],
  },
  {
    idea: 'reset',
    same: ['resets', 'restore', 'rebuild', 'clean up', 'start over'],
  },
];

/** Word groups of the conditions ("Only if ...") and values ("the ..."). */
const CONDITION_WORDS: SearchWordGroup[] = [
  {
    idea: 'sneaking',
    same: ['sneak', 'sneaks', 'crouching', 'crouch', 'crouches', 'shift', 'shifting'],
  },
  {
    idea: 'has',
    same: ['has an item', 'carries', 'owns', 'in inventory', 'in their inventory'],
  },
  {
    idea: 'health',
    same: ['hearts', 'hp', 'life', 'hit points'],
    near: ['low health', 'full health'],
  },
  {
    idea: 'food',
    same: ['hunger', 'food bar', 'hungry', 'starving'],
  },
  {
    idea: 'level',
    same: ['levels', 'xp level', 'experience level'],
  },
  {
    idea: 'chance',
    same: ['chances', 'percent', 'per cent', 'odds', 'probability', 'sometimes', 'occasionally'],
    near: ['luck'],
  },
  {
    idea: 'day',
    same: ['daytime', 'day time', 'during the day', 'sunlight'],
  },
  {
    idea: 'night',
    same: ['nighttime', 'night time', 'at night', 'dark', 'midnight', 'evening'],
  },
  {
    idea: 'raining',
    same: ['rain', 'rains', 'rainy', 'wet weather', 'in the rain', 'downpour'],
  },
  {
    idea: 'thundering',
    same: ['thunder', 'thunderstorm', 'storm', 'storming', 'stormy', 'lightning storm'],
  },
  {
    idea: 'facing',
    same: ['faces', 'direction', 'looking', 'north', 'south', 'east', 'west'],
  },
  {
    idea: 'caused',
    same: ['cause', 'caused by', 'because of', 'source', 'who did it'],
  },
  {
    idea: 'running',
    same: ['is running', 'still going', 'active', 'ticking'],
  },
  {
    idea: 'at least',
    same: ['more than', 'greater than', 'minimum', 'or more'],
  },
  {
    idea: 'position',
    same: ['altitude', 'y level', 'where the player is'],
  },
  {
    idea: 'number of players',
    same: ['player count', 'online players', 'how many players', 'players online'],
  },
  {
    idea: 'time of day',
    same: ['daytime clock', 'what time it is', 'hour'],
  },
  {
    idea: 'fuel',
    same: ['gas', 'petrol', 'gasoline', 'energy left', 'battery'],
  },
  {
    idea: 'ammunition',
    same: ['ammo', 'bullets', 'shells', 'rounds', 'shots left'],
  },
  {
    idea: 'sums',
    same: ['sum', 'maths', 'math', 'plus', 'minus', 'add up', 'calculate'],
  },
  {
    idea: 'team size',
    same: ['players on the team', 'how many on the team', 'team count'],
  },
  {
    idea: 'time left',
    same: ['seconds left', 'remaining time', 'time remaining', 'how long left'],
  },
];

/** Every word group of the Rules plugin. */
export const RULES_WORDS: SearchWordGroup[] = [...TRIGGER_WORDS, ...STEP_WORDS, ...CONDITION_WORDS];
