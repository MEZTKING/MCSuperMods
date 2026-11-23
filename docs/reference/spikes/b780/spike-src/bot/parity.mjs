// B780 spike (throwaway): SampleGameModesParityTest's seven checks replayed on a Paper server by console commands,
// the spike plugin's probes (Paper API reads) and headless stand-in players (bot.mjs). The sample's vanilla data
// pack sits in the spike plugin's jar (no Rules engine on Paper), so the expectations are the vanilla data pack
// column of fixtures/sample-game-modes/README.md, plus the function bridge's signals, which Paper's plugin receives.
// Usage: node parity.mjs <server dir> <packets.json> <port> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { Bot, packetIds } from './bot.mjs';
import { Results, Server, sleep } from './lib.mjs';

const [dir, report, port, out] = process.argv.slice(2);
const ids = packetIds(report);
const srv = new Server(dir);
const res = new Results();
const NS = 'msm_sample_game_modes';
const P = 'msm_spike';
const bots = [];
// NO_BRIDGE=1: the sample's zip in world/datapacks and a spike plugin without the bridge command (the vanilla data pack on Paper).
const BRIDGE = process.env.NO_BRIDGE !== '1';
const bridgeN = (n) => (BRIDGE ? n : 0);

async function join(name) {
  const bot = new Bot({ name, port: Number(port), ids, protocol: 777, log: (l) => console.log(`  [bot] ${l}`) });
  const t = Date.now();
  await bot.connect();
  bot.joinMs = Date.now() - t;
  bots.push(bot);
  return bot;
}

async function probePlayer(name) {
  const m = await srv.ask(`${P} probe player ${name}`, /PROBE player (\S+) (.*)/);
  if (!m) return null;
  const s = m[2];
  const get = (k) => new RegExp(`${k} (\\S+)`).exec(s)?.[1];
  return { raw: s, joined: get('joined') === 'true', bread: Number(get('bread')), slowFalling: get('slowFalling') === 'true', mode: get('mode'), health: Number(get('health')), team: get('team'), points: get('points'), tags: /tags \[([^\]]*)\]/.exec(s)?.[1] ?? '' };
}

async function block(x, y, z) {
  const m = await srv.ask(`${P} probe block ${x} ${y} ${z}`, /PROBE block \S+ \S+ \S+ = (\S+) loot (\S+)/);
  return m ? { type: m[1], loot: m[2] } : { type: '?', loot: '?' };
}

async function score(holder, objective) {
  const m = await srv.ask(`${P} probe score ${holder} ${objective}`, /PROBE score \S+ \S+ = (\S+)/);
  return m ? m[1] : '?';
}

async function tagged(tag) {
  const m = await srv.ask(`${P} probe tagged ${tag}`, /PROBE tagged \S+ = (\d+)/);
  return m ? Number(m[1]) : -1;
}

async function until(fn, ms = 10000, step = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(step);
  }
  return false;
}

/** The bridge's signal lines with this word in the whole log so far, with their executors. */
function signalsSoFar(word) {
  const all = readFileSync(`${dir}/logs/latest.log`, 'utf8');
  const lines = all.split('\n').filter((l) => l.includes(`msm_signal_${NS} ${word} `));
  return { n: lines.length, executors: [...new Set(lines.map((l) => /executor=(\S+)/.exec(l)?.[1]))] };
}

const forceload = () => srv.cmd('forceload add -16 -16 15 15');

// ---------------------------------------------------------------- 1 the game is set up when the world loads
{
  const T = '1 the_game_is_set_up_when_the_world_loads';
  const text = await srv.run([`${P} probe game`, `data get storage ${NS}:msm_games`, 'difficulty', `bossbar get ${NS}:msm_games/timer/arena/round max`, `locate biome ${NS}:msm_games/sky`], 4000);
  res.check(T, 'world start ran (storage world_setup:1b)', /world_setup: 1b/.test(text));
  res.check(T, 'difficulty normal', /difficulty is Normal/.test(text) && /difficulty NORMAL/.test(text));
  res.check(T, 'sky biome (the World Type was used)', /nearest msm_sample_game_modes:msm_games\/sky is at/.test(text));
  res.check(T, 'goals tab', /goals root true/.test(text));
  res.check(T, 'red team', /team msm_sample_game_modes.arena.red = red prefix '\[Red\] ' friendlyFire false/.test(text), /PROBE team \S+red = .*/.exec(text)?.[0]);
  res.check(T, 'blue team', /team msm_sample_game_modes.arena.blue = blue prefix '\[Blue\] ' friendlyFire false/.test(text), /PROBE team \S+blue = .*/.exec(text)?.[0]);
  res.check(T, 'Defeats on the sidebar', /PROBE sidebar msm_sample_game_modes.arena.points criteria playerKillCount name 'Defeats'/.test(text), /PROBE sidebar.*/.exec(text)?.[0]);
  res.check(T, 'round boss bar max 300', /maximum of 300/.test(text));
}

// ---------------------------------------------------------------- 2 the island is placed once and the kit given once
{
  const T = '2 the_island_is_placed_once_and_the_kit_given_once';
  forceload();
  const first = await join('msmskyfirst');
  res.note(T, 'first player joined', `${first.joinMs} ms at ${first.pos}`);
  const joined = await until(async () => (await probePlayer('msmskyfirst'))?.joined);
  res.check(T, 'first join advancement done', joined);
  forceload();
  await sleep(300);
  const text = await srv.run([`data get storage ${NS}:msm_games`], 300);
  res.check(T, 'start flag set', /start: 1b/.test(text), /has the following contents: .*/.exec(text)?.[0]);
  res.check(T, 'island grass at 2 66 2', (await block(2, 66, 2)).type === 'minecraft:grass_block');
  res.check(T, 'island dirt at 2 65 2', (await block(2, 65, 2)).type === 'minecraft:dirt');
  const chest = await block(7, 67, 3);
  res.check(T, 'chest naming its loot table', chest.type === 'minecraft:chest' && chest.loot === `${NS}:sky_survival/start_chest`, JSON.stringify(chest));
  const spawn = await srv.ask(`${P} probe game`, /PROBE world \S+ difficulty \S+ spawn (\S+) (\S+) (\S+)/);
  res.check(T, 'world spawn 5 67 3', spawn && spawn[1] === '5' && spawn[2] === '67' && spawn[3] === '3', spawn?.[0]);
  let p = await probePlayer('msmskyfirst');
  res.check(T, 'first kit: 3 bread, slow falling, survival', p.bread === 3 && p.slowFalling && p.mode === 'SURVIVAL', p.raw);
  res.check(T, 'welcome said to the first player', first.chat.some((l) => l.includes('Welcome to Sky Survival')), first.chat.join(' | '));
  await sleep(1000);
  p = await probePlayer('msmskyfirst');
  res.check(T, 'still 3 bread 20 ticks later', p.bread === 3, p.raw);
  srv.cmd('setblock 2 66 2 minecraft:air');
  const second = await join('msmskysecond');
  const j2 = await until(async () => (await probePlayer('msmskysecond'))?.joined);
  const p2 = await probePlayer('msmskysecond');
  res.check(T, 'second player joined and got the kit', j2 && p2.bread === 3, p2.raw);
  forceload();
  await sleep(200);
  res.check(T, 'island not placed again', (await block(2, 66, 2)).type === 'minecraft:air');
  srv.cmd('tp msmskysecond 5.5 67 3.5', 'summon minecraft:pig 3.5 67 3.5 {NoAI:1b,Tags:["msm_b559_pig"]}');
  const tagIsland = await until(async () => (await probePlayer('msmskysecond')).tags.includes(`${NS}.area.sky_survival.home_island`));
  res.check(T, 'home island area tags the player on it', tagIsland);
  res.check(T, 'pig to clear', (await tagged('msm_b559_pig')) === 1);
  await srv.run([`function ${NS}:msm_games/area/sky_survival/home_island/reset`], 300);
  res.check(T, 'reset placed the island', (await block(2, 66, 2)).type === 'minecraft:grass_block');
  res.check(T, 'reset removed the pig', (await tagged('msm_b559_pig')) === 0);
  const p3 = await probePlayer('msmskysecond');
  res.check(T, 'reset left the player', p3 && p3.health > 0 && !second.closed);
  first.close();
  second.close();
  await sleep(300);
}

// ---------------------------------------------------------------- 3 the one block refills through its phases
{
  const T = '3 the_one_block_refills_through_its_phases';
  forceload();
  const bot = await join('msmoneblock');
  await until(async () => (await probePlayer('msmoneblock'))?.joined);
  srv.cmd('gamemode creative msmoneblock', 'tp msmoneblock 12.5 67 6.5');
  await sleep(300);
  res.check(T, 'phase 0 at the start', (await score('#one_block.magic_block.phase', `${NS}.msm_one_block`)) === '0');
  bot.takeChat();
  srv.read();
  const sig0 = signalsSoFar(`break2+${NS}+one_block+magic_block`).n;
  const PLAINS = ['grass_block', 'dirt', 'oak_log', 'oak_leaves', 'melon', 'chest'].map((b) => `minecraft:${b}`);
  const UNDER = ['stone', 'coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'redstone_ore', 'lapis_ore', 'chest'].map((b) => `minecraft:${b}`);
  const seen = [];
  let bad = '';
  let log = '';
  for (let i = 0; i < 20; i++) {
    forceload();
    let now = '';
    await until(async () => {
      now = (await block(12, 66, 4)).type;
      return now !== 'minecraft:air';
    }, 2000, 50);
    seen.push(now.replace('minecraft:', ''));
    const phase = i < 10 ? PLAINS : UNDER;
    if (!phase.includes(now)) bad += `break ${i + 1}: ${now}; `;
    log += await srv.run(['kill @e[type=!minecraft:player,x=12,y=66,z=4,distance=..4]'], 100);
    bot.breakBlock(12, 66, 4, i + 1);
    await sleep(150);
    log += srv.read();
  }
  await sleep(300);
  log += srv.read();
  const lines = bot.takeChat();
  res.check(T, '20 breaks each refilled from its phase', bad === '', `${bad} seen ${seen.join(',')}`);
  res.check(T, 'phase 2 after 20 breaks', (await score('#one_block.magic_block.phase', `${NS}.msm_one_block`)) === '2');
  res.check(T, 'breaks 0 in the new phase', (await score('#one_block.magic_block.breaks', `${NS}.msm_one_block`)) === '0');
  res.check(T, '"Underground" said once', lines.filter((l) => l === 'Underground').length === 1, lines.join(' | '));
  res.check(T, '"Deep dark" said once', lines.filter((l) => l === 'Deep dark').length === 1);
  res.check(T, 'no "Underground at last!" (no Rules on Paper)', lines.filter((l) => l === 'Underground at last!').length === 0);
  const sig = signalsSoFar(`break2+${NS}+one_block+magic_block`);
  res.check(T, 'the bridge reaches the plugin once per break of phase 2 (10)', sig.n - sig0 === bridgeN(10), `${sig.n - sig0}; executors ${sig.executors}`);
  srv.cmd('kill @e[type=!minecraft:player,x=12,y=66,z=4,distance=..3]');
  bot.close();
  await sleep(300);
}

// ---------------------------------------------------------------- 4 the round timer ends and runs its end
{
  const T = '4 the_round_timer_ends_and_runs_its_end';
  forceload();
  const bot = await join('msmlistener');
  await until(async () => (await probePlayer('msmlistener'))?.joined);
  srv.cmd('gamemode spectator msmlistener', 'tp msmlistener 0.5 120 30.5');
  forceload();
  await sleep(200);
  await srv.run([`function ${NS}:msm_games/area/arena/arena/reset`, 'setblock 3 101 3 minecraft:gold_block'], 300);
  const before = (await probePlayer('msmlistener')).points;
  bot.titles = [];
  const end0 = signalsSoFar(`end+${NS}+arena+round`).n;
  let log = await srv.run([`function ${NS}:msm_games/timer/arena/round/start`, `${P} probe game`], 400);
  res.check(T, 'boss bar visible at the start, full', /PROBE bossbar visible true progress 1.0/.test(log), /PROBE bossbar.*/.exec(log)?.[0]);
  res.check(T, 'holder 300 at the start', (await score('#arena.round', `${NS}.msm_timers`)) === '300');
  res.check(T, 'running', (await score('#arena.round.on', `${NS}.msm_timers`)) === '1');
  srv.cmd(`scoreboard players set #arena.round ${NS}.msm_timers 2`);
  const ended = await until(async () => (await score('#arena.round.on', `${NS}.msm_timers`)) === '0', 8000, 200);
  await sleep(200);
  log += srv.read();
  res.check(T, 'the timer ended', ended);
  res.check(T, 'holder 0 at the end', (await score('#arena.round', `${NS}.msm_timers`)) === '0');
  const bar = await srv.ask(`${P} probe game`, /PROBE bossbar (.*)/);
  res.check(T, 'boss bar hidden after the end', bar && /visible false/.test(bar[1]), bar?.[0]);
  res.check(T, 'title "Round over" reached the player', bot.titles.includes('Round over'), bot.titles.join(' | '));
  forceload();
  await sleep(200);
  res.check(T, 'round_end rebuilt the arena', (await block(3, 101, 3)).type === 'minecraft:air');
  const after = (await probePlayer('msmlistener')).points;
  res.check(T, 'no point from the round end (no Rules on Paper)', after === before, `${before} -> ${after}`);
  const end1 = signalsSoFar(`end+${NS}+arena+round`);
  res.check(T, 'the bridge reached the plugin once for the round end', end1.n - end0 === bridgeN(1), `${end1.n - end0}; executors ${end1.executors}`);
  bot.close();
  await sleep(300);
}

// ---------------------------------------------------------------- 5 the arena is entered and reset
{
  const T = '5 the_arena_is_entered_and_reset';
  forceload();
  const bot = await join('msmarena');
  await until(async () => (await probePlayer('msmarena'))?.joined);
  srv.cmd('gamemode creative msmarena', 'tp msmarena 5.5 67 3.5');
  forceload();
  await sleep(200);
  await srv.run([`function ${NS}:msm_games/area/arena/arena/reset`], 300);
  res.check(T, 'arena floor', (await block(-12, 100, -12)).type === 'minecraft:stone_bricks');
  res.check(T, 'arena wall', (await block(-12, 101, -12)).type === 'minecraft:mossy_stone_bricks');
  res.check(T, 'corner lantern', (await block(-12, 104, -12)).type === 'minecraft:lantern');
  const tag = `${NS}.area.arena.arena`;
  res.check(T, 'not tagged before walking in', !(await probePlayer('msmarena')).tags.includes(tag));
  srv.read();
  const enter0 = signalsSoFar(`enter+${NS}+arena+arena`).n;
  srv.cmd('tp msmarena 0.5 101 0.5');
  res.check(T, 'tagged on entering', await until(async () => (await probePlayer('msmarena')).tags.includes(tag)));
  await sleep(150);
  const log = srv.read();
  res.check(T, 'no team (no Rules on Paper)', (await probePlayer('msmarena')).team === 'none');
  const enter1 = signalsSoFar(`enter+${NS}+arena+arena`);
  res.check(T, 'the bridge reached the plugin once for the entry, as the player', BRIDGE ? enter1.n - enter0 === 1 && enter1.executors.includes('msmarena') : enter1.n - enter0 === 0, `${enter1.n - enter0}; executors ${enter1.executors}`);
  srv.cmd('tp msmarena 0.5 120 40.5');
  res.check(T, 'untagged on leaving', await until(async () => !(await probePlayer('msmarena')).tags.includes(tag)));
  forceload();
  srv.cmd('setblock 2 101 2 minecraft:dirt', 'summon minecraft:pig 4.5 101 4.5 {NoAI:1b,Tags:["msm_b559_arena_pig"]}', 'tp msmarena -3.5 101 -3.5');
  await sleep(300);
  res.check(T, 'pig to clear', (await tagged('msm_b559_arena_pig')) === 1);
  await srv.run([`function ${NS}:msm_games/area/arena/arena/reset`], 300);
  res.check(T, 'reset removed the dirt', (await block(2, 101, 2)).type === 'minecraft:air');
  res.check(T, 'reset removed the pig', (await tagged('msm_b559_arena_pig')) === 0);
  res.check(T, 'reset left the player', !bot.closed && (await probePlayer('msmarena')).health > 0);
  bot.close();
  await sleep(300);
}

// ---------------------------------------------------------------- 6 a kill scores on the sidebar
{
  const T = '6 a_kill_scores_on_the_sidebar';
  const winner = await join('msmwinner');
  const loser = await join('msmloser');
  await until(async () => (await probePlayer('msmwinner'))?.joined && (await probePlayer('msmloser'))?.joined);
  srv.cmd('tp msmwinner 40.5 100 40.5', 'tp msmloser 41.5 100 40.5');
  await sleep(3600); // the loser's spawn protection
  const before = (await probePlayer('msmwinner')).points;
  await srv.run(['damage msmloser 1000 minecraft:player_attack by msmwinner'], 400);
  const after = (await probePlayer('msmwinner')).points;
  const b = before === 'unset' ? 0 : Number(before);
  res.check(T, 'the winner scores one point on Defeats', Number(after) === b + 1, `${before} -> ${after}`);
  res.note(T, 'the loser saw the death screen packet', `${loser.deathScreen} (player_combat_kill)`);
  const side = await srv.ask(`${P} probe game`, /PROBE sidebar (\S+)/);
  res.check(T, 'sidebar still Defeats', side?.[1] === `${NS}.arena.points`);
  loser.respawn();
  await sleep(300);
  winner.close();
  loser.close();
  await sleep(300);
}

// ---------------------------------------------------------------- 7 the lucky block (vanilla pack column)
{
  const T = '7 the_lucky_block_rule_fires_in_the_jar_only';
  const text = await srv.run([`give @a ${NS}:lucky_block`, `function ${NS}:msm_rules/signal/timer/arena/round/ended`], 400);
  res.check(T, 'the lucky block item is not registered', /Unknown item|Unknown or incomplete|Incorrect argument/i.test(text), text.split('\n')[0]);
  const present = /signal #\d+ msm_signal_msm_sample_game_modes end/.test(text);
  if (BRIDGE) res.note(T, 'bridge functions present on Paper (the vanilla run expects them absent)', present ? 'present: they load and call the plugin command' : 'absent');
  else res.check(T, 'the bridge functions are absent (failed to load, as on vanilla)', !present && /Unknown function/.test(text), text.split('\n').filter(Boolean).slice(1, 2).join(''));
}

writeFileSync(out, `${JSON.stringify({ minecraft: '26.3', paper: 'see README', rows: res.rows }, null, 2)}\n`);
for (const b of bots) b.close();
const fails = res.rows.filter((r) => r.pass === false).length;
console.log(`done: ${res.rows.filter((r) => r.pass).length} passed, ${fails} failed`);
process.exit(0);
