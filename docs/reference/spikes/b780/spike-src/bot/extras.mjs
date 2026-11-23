// B780 spike (throwaway): P8 to P14 on a running Paper server with the spike plugin, driven from the console and by
// headless stand-in players. Usage: node extras.mjs <server dir> <packets.json> <port> <out.json>
import { writeFileSync } from 'node:fs';
import { Bot, packetIds } from './bot.mjs';
import { Results, Server, sleep } from './lib.mjs';

const [dir, report, port, out] = process.argv.slice(2);
const ids = packetIds(report);
const srv = new Server(dir);
const res = new Results();
const P = 'msm_spike';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const on = (k) => !ONLY || ONLY.includes(k);

async function join(name) {
  const bot = new Bot({ name, port: Number(port), ids, protocol: 777, log: (l) => console.log(`  [bot] ${l}`) });
  await bot.connect();
  return bot;
}
async function tryJoin(name) {
  const bot = new Bot({ name, port: Number(port), ids, protocol: 777, log: () => {} });
  try {
    await bot.connect();
    return { bot, ok: true };
  } catch (e) {
    return { bot, ok: false, reason: bot.disconnect ?? e.message };
  }
}
async function status(name) {
  const m = await srv.ask(`${P} status ${name}`, /status (\S+) (health .*|offline)/);
  return m?.[2] ?? '?';
}
async function blockType(x, y, z) {
  const m = await srv.ask(`${P} probe block ${x} ${y} ${z}`, /PROBE block \S+ \S+ \S+ = (\S+)/);
  return m?.[1];
}

// ---------------------------------------------------------------- P8 argument types
if (on('P8')) {
  const T = 'P8 argument types';
  const bot = await join('msmextra');
  await sleep(500);
  const values = {
    integer: '5', number: '2.5', word: 'abc', text: 'hello world', boolean: 'true', player: 'msmextra', players: '@a',
    entity: '@e[type=minecraft:player]', position: '1 2 3', block_position: '1 2 3', item: 'minecraft:diamond',
    block: 'minecraft:stone', dimension: 'minecraft:overworld', time: '10s', team_colour: 'red', hex_colour: 'ff0000',
    rotation: '0 0', angle: '90', uuid: '00000000-0000-0000-0000-000000000001', item_predicate: 'minecraft:diamond',
    block_predicate: 'minecraft:stone', effect: 'minecraft:speed', enchantment: 'minecraft:sharpness', biome: 'minecraft:plains',
    structure: 'minecraft:village_plains', entity_type: 'minecraft:pig', particle: 'minecraft:flame', game_mode: 'creative',
    text_component: '"hi"', int_range: '1..5', identifier: 'msm:test', message: 'hello there', dialog: 'minecraft:server_links',
  };
  for (const [type, value] of Object.entries(values)) {
    const text = await srv.run([`${P}_args ${type} ${value}`], 250);
    const m = new RegExp(`arg ${type} = (.*)`).exec(text);
    res.check(T, type, m !== null, m ? m[1] : text.split('\n').filter(Boolean).slice(0, 2).join(' / '));
  }
  res.check(T, 'the client stays connected with the command tree (all parsers sent)', !bot.closed, bot.disconnect ?? '');
  bot.close();
  await sleep(300);
}

// ---------------------------------------------------------------- P9 the bridge both ways, reload
if (on('P9')) {
  const T = 'P9 bridge';
  const bot = await join('msmbridge');
  await sleep(400);
  let text = await srv.run(['execute as msmbridge at @s run function msm_spike:as_player'], 400);
  res.check(T, 'function -> plugin command, as a player (execute as)', /msm_signal_msm_spike as_player \(sender=\S+ executor=msmbridge/.test(text), /msm_signal_msm_spike as_player \([^)]*\)/.exec(text)?.[0]);
  srv.cmd('op msmbridge');
  await sleep(300);
  srv.read();
  bot.command('function msm_spike:as_player');
  await sleep(500);
  text = srv.read();
  res.check(T, 'function -> plugin command, run by the player himself', /msm_signal_msm_spike as_player \(sender=msmbridge executor=msmbridge/.test(text), /msm_signal_msm_spike as_player \([^)]*\)/.exec(text)?.[0]);
  bot.command('msm_signal_msm_spike typed');
  await sleep(400);
  text = srv.read();
  res.check(T, 'the signal command typed by an operator', /msm_signal_msm_spike typed/.test(text));
  srv.cmd('deop msmbridge');
  await sleep(300);
  srv.read();
  bot.command('msm_signal_msm_spike typed_by_non_op');
  await sleep(400);
  text = srv.read();
  res.note(T, 'the signal command typed by a non-operator (no permission requirement in the spike)', /typed_by_non_op/.test(text) ? 'ran: the API needs an explicit requires()' : 'refused');
  text = await srv.run([`${P} fn msm_spike:reply`], 400);
  res.check(T, 'plugin -> data pack function (dispatchCommand as the console)', /fn msm_spike:reply -> true/.test(text) && /\[msm_spike\] reply ran/.test(text), /fn msm_spike:reply -> \S+ in \d+ us/.exec(text)?.[0]);
  // /minecraft:reload: the data packs reload; the lifecycle COMMANDS event fires again.
  srv.read();
  const t = Date.now();
  srv.cmd('minecraft:reload');
  const done = await srv.waitFor(/signal #\d+ msm_signal_msm_spike load/, 20000);
  await sleep(1500);
  text = srv.seen + srv.read();
  res.note(T, 'reload time to the load function', `${Date.now() - t} ms`);
  res.check(T, 'COMMANDS event again at reload (bootstrap handler)', /bootstrap COMMANDS event #2 cause RELOAD/.test(text), /bootstrap COMMANDS event #\d+ cause \S+/.exec(text)?.[0]);
  res.check(T, 'COMMANDS event again at reload (plugin handler)', /plugin COMMANDS event cause RELOAD/.test(text));
  res.check(T, 'packs discovered again at reload', /discovered pack \/msm_pack/.test(text));
  res.check(T, 'the load tag ran again and reached the plugin', done !== null);
  res.note(T, 'late.mcfunction (names a command registered at enable) after reload', /Failed to load function msm_spike:late/.test(text) ? 'still fails to load: functions are parsed before the enable-time COMMANDS handler runs' : 'loads now');
  text = await srv.run(['function msm_spike:hello'], 400);
  res.check(T, 'the bridge still works after reload', /signal #\d+ msm_signal_msm_spike hello/.test(text));
  bot.close();
  await sleep(300);
}

// ---------------------------------------------------------------- P10 kept out for a time
if (on('P10')) {
  const T = 'P10 ban with an end time';
  const bot = await join('msmban');
  await sleep(400);
  srv.read();
  srv.cmd(`${P} ban msmban 5`);
  await sleep(800);
  const text = srv.read();
  res.check(T, 'the online player is kicked', bot.closed === true, bot.disconnect);
  res.note(T, 'kick message shown', bot.disconnect);
  res.note(T, 'entry', /banned online msmban until (.*)/.exec(text)?.[1]);
  const again = await tryJoin('msmban');
  res.check(T, 'joining again is refused while banned', !again.ok, again.reason);
  res.note(T, 'refusal message shown at login', again.reason);
  await sleep(5200);
  const later = await tryJoin('msmban');
  res.check(T, 'joining is allowed after the end time', later.ok, later.reason ?? '');
  later.bot.close();
  srv.read();
  srv.cmd(`${P} ban msmoffline 4`);
  await sleep(500);
  res.note(T, 'offline ban', /banned offline msmoffline .*/.exec(srv.read())?.[0]);
  const off = await tryJoin('msmoffline');
  res.check(T, 'an offline (never joined) player banned by name is refused', !off.ok, off.reason);
  await sleep(4200);
  const off2 = await tryJoin('msmoffline');
  res.check(T, 'and allowed after the end time', off2.ok);
  off2.bot.close();
  await sleep(300);
}

// ---------------------------------------------------------------- P11 cancelling by area boxes
if (on('P11')) {
  const T = 'P11 protected boxes';
  const bot = await join('msmprot');
  await sleep(400);
  srv.cmd('forceload add 16 16 31 31', 'gamemode creative msmprot', 'tp msmprot 21.5 101 24.5');
  await sleep(500);
  srv.cmd('setblock 20 100 20 minecraft:stone', 'setblock 26 100 26 minecraft:stone', `${P} protect clear`, `${P} protect add 18 95 18 22 105 22`);
  await sleep(400);
  srv.read();
  bot.breakBlock(20, 100, 20, 1);
  await sleep(400);
  res.check(T, 'a break inside the box is cancelled (block stays)', (await blockType(20, 100, 20)) === 'minecraft:stone');
  bot.breakBlock(26, 100, 26, 2);
  await sleep(400);
  res.check(T, 'a break outside the box is allowed', (await blockType(26, 100, 26)) === 'minecraft:air');
  srv.cmd('gamemode survival msmprot', 'tp msmprot 20.5 101 20.5', 'give msmprot minecraft:bread 4');
  await sleep(1200);
  const h0 = await status('msmprot');
  srv.read();
  srv.cmd('damage msmprot 5');
  await sleep(300);
  const h1 = await status('msmprot');
  res.check(T, 'damage inside the box is cancelled', /health 20\.0/.test(h1), `${h0} -> ${h1}`);
  srv.read();
  bot.send('play', 'player_action', Buffer.from([4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]));
  await sleep(400);
  res.check(T, 'dropping an item inside the box is cancelled', /drop cancelled for msmprot/.test(srv.read()));
  const bench = /bench: .*/.exec(srv.read() + '');
  res.note(T, 'box check cost', bench?.[0] ?? 'see the startup log line "bench:"');
  bot.close();
  await sleep(300);
}

// ---------------------------------------------------------------- P12 a death with no death screen
if (on('P12')) {
  const T = 'P12 death';
  const bot = await join('msmdeath');
  await sleep(400);
  srv.cmd(`${P} protect clear`, 'gamemode survival msmdeath', 'tp msmdeath 40.5 101 40.5', 'give msmdeath minecraft:bread 4', 'give msmdeath minecraft:iron_sword');
  await sleep(3500); // spawn protection
  srv.read();
  srv.cmd(`${P} death cancel`, 'damage msmdeath 1000');
  await sleep(600);
  let text = srv.read();
  res.note(T, 'cancel: PlayerDeathEvent', /death msmdeath .*/.exec(text)?.[0]);
  res.note(T, 'cancel: after', `${await status('msmdeath')}; death screen packets ${bot.deathScreen}; health packet ${bot.health}`);
  res.check(T, 'cancelling PlayerDeathEvent: no death screen', bot.deathScreen === 0);
  srv.cmd('effect clear msmdeath', 'tp msmdeath 40.5 101 40.5');
  srv.cmd(`${P} death damage`, 'damage msmdeath 1000');
  await sleep(600);
  text = srv.read();
  res.note(T, 'damage mode', /lethal damage .*/.exec(text)?.[0]);
  res.check(T, 'turning lethal damage into a respawn: no death screen, items dropped', bot.deathScreen === 0 && /dropped [1-9]/.test(text), await status('msmdeath'));
  srv.cmd(`${P} death off`, 'gamerule immediate_respawn true', 'give msmdeath minecraft:bread 2', 'tp msmdeath 40.5 101 40.5');
  await sleep(300);
  srv.read();
  srv.cmd('damage msmdeath 1000');
  await sleep(600);
  text = srv.read();
  res.note(T, 'game rule immediate_respawn (data pack): server lines', text.split('\n').filter((l) => /msmdeath|immediate/.test(l)).join(' / '));
  res.note(T, 'game rule immediate_respawn: death screen packet still sent (the client skips the screen itself)', `${bot.deathScreen}`);
  bot.respawn();
  await sleep(500);
  res.note(T, 'after respawn', await status('msmdeath'));
  srv.cmd('gamerule immediate_respawn false');
  bot.close();
  await sleep(300);
}

// ---------------------------------------------------------------- P13 menus and dialogs
if (on('P13')) {
  const T = 'P13 menus';
  const bot = await join('msmmenu');
  await sleep(400);
  srv.read();
  srv.cmd(`${P} menu msmmenu`);
  await sleep(500);
  res.check(T, 'a chest-like menu opens on the client', bot.screen?.title === 'Shop (spike)', JSON.stringify(bot.screen));
  bot.click(11);
  await sleep(500);
  const text = srv.read();
  res.check(T, 'a click reaches the plugin with the slot and item, cancelled', /menu click by msmmenu slot 11 raw 11 click LEFT item IRON_SWORD/.test(text), /menu click .*/.exec(text)?.[0]);
  res.check(T, 'the player stays connected', !bot.closed, bot.disconnect ?? '');
  srv.cmd(`${P} dialog msmmenu`);
  await sleep(500);
  res.check(T, 'a dialog made through the API reaches the client', bot.dialogs >= 1, `${bot.dialogs}`);
  srv.cmd('dialog show msmmenu minecraft:server_links');
  await sleep(500);
  res.note(T, 'a vanilla dialog by command (data pack route)', `${bot.dialogs} dialog packets`);
  bot.close();
  await sleep(300);
}

// ---------------------------------------------------------------- P14 a world per match
if (on('P14')) {
  const T = 'P14 worlds';
  const a = await join('msmworld1');
  const b = await join('msmworld2');
  await sleep(500);
  for (const name of ['arena_1', 'arena_2', 'arena_3']) {
    srv.read();
    const t = Date.now();
    srv.cmd(`${P} world make ${name}`);
    const made = await srv.waitFor(/world make (\S+) key (\S+) path (\S+) in (\d+) ms; template (\S+) in (\d+) ms; floor (\S+)/, 30000);
    res.check(T, `${name}: made`, made !== null, made?.[0]);
    await sleep(300);
    const floor = await srv.run([`execute in msm_spike:${name} if block -12 100 -12 minecraft:stone_bricks run say FLOOR-OK-${name}`], 400);
    res.check(T, `${name}: the arena template placed in it (place template, run after the plugin's own command)`, floor.includes(`FLOOR-OK-${name}`));
    res.note(T, `${name}: wall time`, `${Date.now() - t} ms`);
    srv.cmd(`${P} world tp ${name}`);
    await sleep(800);
    const s = await status('msmworld1');
    res.check(T, `${name}: players sent in`, s.includes(name), s);
    srv.read();
    const t2 = Date.now();
    srv.cmd(`${P} world unload ${name}`);
    const un = await srv.waitFor(/world unload (\S+) -> (\S+) in (\d+) ms; path (\S+)/, 30000);
    res.check(T, `${name}: unloaded (players moved out first)`, un && un[2] === 'true', `${un?.[0]} wall ${Date.now() - t2} ms`);
    if (un) {
      const del = await srv.ask(`${P} world delete ${un[4]}`, /world delete \S+ files (\d+) in (\d+) ms/, 30000);
      res.check(T, `${name}: folder deleted`, del && Number(del[1]) > 0, del?.[0]);
    }
  }
  const list = await srv.ask(`${P} world list`, /worlds (.*)/);
  res.note(T, 'worlds left', list?.[1]);
  res.check(T, 'players still connected', !a.closed && !b.closed);
  a.close();
  b.close();
}

writeFileSync(out, `${JSON.stringify({ minecraft: '26.3', rows: res.rows }, null, 2)}\n`);
console.log(`done: ${res.rows.filter((r) => r.pass).length} passed, ${res.rows.filter((r) => r.pass === false).length} failed`);
process.exit(0);
