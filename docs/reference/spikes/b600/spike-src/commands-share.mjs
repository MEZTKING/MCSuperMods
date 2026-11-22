// B600 spike (throwaway), 2S7: the function lines of the library's mirror (examples/) and the fixtures, classified by
// what Try it could run: today (nothing of the game's own), with the plan's draft list, and with a few additions.
// usage: node commands-share.mjs <repo> <out json>
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const [repo, outFile, templatesFile] = process.argv.slice(2);
const files = [];
function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (n === 'node_modules') continue; if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.json') || n.endsWith('.mcfunction')) files.push(p); } }
for (const root of ['examples', 'fixtures']) walk(join(repo, root));
const lines = [];
const sources = {};
for (const f of files) {
  let ls = null;
  if (f.endsWith('.mcfunction')) ls = readFileSync(f, 'utf8').split('\n');
  else { try { const j = JSON.parse(readFileSync(f, 'utf8')); if (j.kind === 'minecraft:function' && Array.isArray(j.data?.lines)) ls = j.data.lines; } catch {} }
  if (!ls) continue;
  const src = relative(repo, f).split('/').slice(0, 3).join('/');
  sources[src] = (sources[src] ?? 0) + 1;
  for (const l of ls) lines.push({ src, l: l.trim() });
}
const DRAFT = new Set(['give', 'clear', 'setblock', 'fill', 'clone', 'summon', 'kill', 'tp', 'teleport', 'effect', 'say', 'tellraw', 'title', 'playsound', 'particle', 'time', 'function', 'schedule', 'scoreboard', 'execute']);
const DRAFT_SCOREBOARD = /^scoreboard players (set|add|remove) /;
const DRAFT_EXEC = new Set(['as', 'at', 'if', 'unless', 'run']);
const DRAFT_EXEC_IF = new Set(['block', 'score']);
// Small additions proposed by the spike (B606 or reserve B647).
const MORE = new Set(['tag', 'gamemode', 'weather', 'xp', 'experience', 'spawnpoint', 'msg', 'tell', 'w', 'me', 'data', 'item', 'loot', 'advancement', 'attribute', 'stopsound', 'gamerule', 'difficulty', 'damage', 'ride', 'rotate', 'random', 'return', 'enchant', 'bossbar', 'team', 'trigger', 'dialog', 'forceload', 'kick', 'list', 'seed']);
const MORE_SCOREBOARD = /^scoreboard (players (set|add|remove|reset|operation|get|enable|display)|objectives (add|remove|setdisplay|modify)) /;
const MORE_EXEC = new Set(['as', 'at', 'if', 'unless', 'run', 'positioned', 'align', 'anchored', 'facing', 'rotated', 'in', 'on', 'store', 'summon']);
const MORE_EXEC_IF = new Set(['block', 'score', 'entity', 'blocks', 'predicate', 'items', 'data', 'loaded', 'dimension', 'biome', 'function']);

function classify(line, ext) {
  let s = line;
  const macro = s.startsWith('$');
  if (macro) s = s.slice(1);
  const words = s.split(/\s+/);
  const head = words[0];
  const cmds = ext ? new Set([...DRAFT, ...MORE]) : DRAFT;
  if (!cmds.has(head)) return { ok: false, head, macro };
  if (head === 'scoreboard') return { ok: (ext ? MORE_SCOREBOARD : DRAFT_SCOREBOARD).test(s + ' '), head: words.slice(0, 3).join(' '), macro };
  if (head === 'execute') {
    const run = s.indexOf(' run ');
    const chain = (run < 0 ? s : s.slice(0, run)).split(/\s+/).slice(1);
    const sub = ext ? MORE_EXEC : DRAFT_EXEC;
    const ifs = ext ? MORE_EXEC_IF : DRAFT_EXEC_IF;
    // walk the chain's keywords only (skip arguments roughly: a keyword is a word in the known set after an argument list)
    let okChain = true;
    for (let i = 0; i < chain.length; i++) {
      const w = chain[i];
      if (w === 'if' || w === 'unless') { if (!ifs.has(chain[i + 1])) { okChain = false; break; } }
      if (['as', 'at', 'positioned', 'align', 'anchored', 'facing', 'rotated', 'in', 'on', 'store', 'summon', 'if', 'unless'].includes(w) && !sub.has(w)) { okChain = false; break; }
    }
    if (!okChain) return { ok: false, head: 'execute (subcommand)', macro };
    if (run < 0) return { ok: true, head, macro };
    return classify(s.slice(run + 5), ext);
  }
  return { ok: true, head, macro };
}
if (templatesFile) for (const t of JSON.parse(readFileSync(templatesFile, 'utf8'))) { sources[`template:${t.template}`] = 1; for (const l of t.lines) lines.push({ src: t.template, l: l.trim() }); }
const body = lines.filter((x) => x.l !== '' && !x.l.startsWith('#'));
const res = { files: Object.values(sources).reduce((a, b) => a + b, 0), projects: Object.keys(sources).length, lines: lines.length, commandLines: body.length, macroLines: body.filter((x) => x.l.startsWith('$')).length };
for (const [label, ext] of [['draft', false], ['withAdditions', true]]) {
  const missing = {};
  let ok = 0;
  for (const x of body) { const c = classify(x.l, ext); if (c.ok) ok++; else missing[c.head] = (missing[c.head] ?? 0) + 1; }
  res[label] = { understood: ok, share: +(ok / body.length).toFixed(3), notUnderstood: Object.fromEntries(Object.entries(missing).sort((a, b) => b[1] - a[1]).slice(0, 25)) };
}
const heads = {};
for (const x of body) { const h = (x.l.startsWith('$') ? '$' : '') + x.l.replace(/^\$/, '').split(/\s+/)[0]; heads[h] = (heads[h] ?? 0) + 1; }
res.heads = Object.fromEntries(Object.entries(heads).sort((a, b) => b[1] - a[1]));
writeFileSync(outFile, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
