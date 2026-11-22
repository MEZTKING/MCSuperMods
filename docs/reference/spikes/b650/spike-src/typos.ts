// B650 spike: SQ3, three typo methods on 300 misspellings, and SQ4, the stemmer's merges.
import { readFileSync } from 'node:fs';
import { buildIndex, DEFAULT_OPTIONS, type Entry } from './engine.ts';
import { registries, vanillaEntries, vanillaWords } from './layers.ts';
import { bkTreeIndex, deletionIndex, editsFor, fold, osa, rawWords, setTieBreak, soundKey, stem, trigramIndex } from './text.ts';
import { BEHAVIOURS, COLOURS, FLOW_KEYWORDS, WORD_GROUPS } from './vocab.ts';

const REPO = process.env.REPO as string;
const OUT = process.env.B650_OUT as string;
const target = (process.env.TARGET ?? 'mc-26.3') as 'mc-26.3' | 'mc-26.4';
const regs = registries(REPO, target);
const corpus = (JSON.parse(readFileSync(`${OUT}/corpus-${target}.json`, 'utf8')) as Entry[]).map((e) =>
  FLOW_KEYWORDS[e.id] !== undefined ? { ...e, words: [...(e.words ?? []), ...(FLOW_KEYWORDS[e.id] as string[])] } : e,
);
const vanilla = vanillaEntries(regs);

// a seeded generator (mulberry32)
let seed = 650;
const rnd = (): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const near = (c: string): string => {
  for (let r = 0; r < 3; r++) {
    const i = (KEYS[r] as string).indexOf(c);
    if (i >= 0) {
      const row = KEYS[r] as string;
      return row[Math.max(0, Math.min(row.length - 1, i + (rnd() < 0.5 ? -1 : 1)))] as string;
    }
  }
  return c;
};
const edit = (w: string): string => {
  const i = 1 + Math.floor(rnd() * (w.length - 1)); // keep the first letter, as people mostly do
  const op = Math.floor(rnd() * 4);
  if (op === 0) return w.slice(0, i) + near(w[i] as string) + w.slice(i + 1);
  if (op === 1) return w.slice(0, i) + w.slice(i + 1);
  if (op === 2) return w.slice(0, i) + near(w[i] as string) + w.slice(i);
  return i < w.length - 1 ? w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2) : w.slice(0, i - 1) + w[i] + w[i - 1];
};
const edited = (w: string, n: number): string => {
  for (let tries = 0; tries < 20; tries++) {
    let v = w;
    for (let k = 0; k < n; k++) v = edit(v);
    if (v !== w && osa(v, w, 3) === n) return v;
  }
  return edit(w);
};

interface Case { from: string; to: string; set: string; flow?: string }
const cases: Case[] = [];
const longest = (title: string): string => rawWords(title).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0] ?? '';
for (const e of corpus.filter((x) => x.source === 'flow')) {
  const w = longest(e.title);
  if (w !== '') cases.push({ from: edited(w, 1), to: fold(w), set: 'flow titles, one edit', flow: e.id });
}
const ids = [...(regs.entity_type ?? []), ...(regs.item ?? [])].filter((p) => !p.includes('/'));
const picked = new Set<string>();
for (let i = 0; picked.size < 100 && i < 5000; i++) {
  const p = ids[Math.floor(rnd() * ids.length)] as string;
  const w = longest(p.replace(/_/g, ' '));
  if (w === '' || picked.has(w)) continue;
  picked.add(w);
  cases.push({ from: edited(w, editsFor(w.length)), to: fold(w), set: 'vanilla names, edits by length' });
}
const HAND: [string, string][] = [
  ['creper', 'creeper'], ['creaper', 'creeper'], ['skeliton', 'skeleton'], ['skelleton', 'skeleton'], ['zombe', 'zombie'], ['zomby', 'zombie'],
  ['dimond', 'diamond'], ['diamand', 'diamond'], ['daimond', 'diamond'], ['netherrite', 'netherite'], ['netherit', 'netherite'], ['emrald', 'emerald'],
  ['emarald', 'emerald'], ['obsidan', 'obsidian'], ['obsidain', 'obsidian'], ['redston', 'redstone'], ['restone', 'redstone'], ['pickax', 'pickaxe'],
  ['pikaxe', 'pickaxe'], ['pickacks', 'pickaxe'], ['chesplate', 'chestplate'], ['chestplait', 'chestplate'], ['leggins', 'leggings'], ['legings', 'leggings'],
  ['enchantmant', 'enchantment'], ['enchantmen', 'enchantment'], ['enchantent', 'enchantment'], ['potoin', 'potion'], ['poshun', 'potion'], ['potin', 'potion'],
  ['villiger', 'villager'], ['vilager', 'villager'], ['villeger', 'villager'], ['golum', 'golem'], ['gollem', 'golem'], ['elitra', 'elytra'],
  ['elytrea', 'elytra'], ['endermen', 'enderman'], ['ender man', 'enderman'], ['wither skelly', 'wither'], ['piglen', 'piglin'], ['piglinn', 'piglin'],
  ['dimention', 'dimension'], ['demension', 'dimension'], ['dimenshun', 'dimension'], ['vehical', 'vehicle'], ['vehicule', 'vehicle'], ['vehicel', 'vehicle'],
  ['glyder', 'glider'], ['glidder', 'glider'], ['custum', 'custom'], ['costum', 'custom'], ['sheild', 'shield'], ['shiled', 'shield'],
  ['crossbo', 'crossbow'], ['crosbow', 'crossbow'], ['arrrow', 'arrow'], ['arow', 'arrow'], ['torche', 'torch'], ['lanturn', 'lantern'],
  ['lantren', 'lantern'], ['furnance', 'furnace'], ['furnice', 'furnace'], ['crafing', 'crafting'], ['craftting', 'crafting'], ['recepie', 'recipe'],
  ['recipie', 'recipe'], ['resipe', 'recipe'], ['texure', 'texture'], ['textre', 'texture'], ['texsture', 'texture'], ['animashun', 'animation'],
  ['aminal', 'animal'], ['animel', 'animal'], ['monstor', 'monster'], ['monser', 'monster'], ['dragen', 'dragon'], ['dragin', 'dragon'],
  ['portel', 'portal'], ['protal', 'portal'], ['biom', 'biome'], ['boime', 'biome'], ['strucure', 'structure'], ['structer', 'structure'],
  ['vilage', 'village'], ['villige', 'village'], ['minecart', 'minecart'], ['mincart', 'minecart'], ['saplin', 'sapling'], ['sappling', 'sapling'],
  ['mushrom', 'mushroom'], ['mushroon', 'mushroom'], ['bamboo', 'bamboo'], ['bambo', 'bamboo'], ['cactis', 'cactus'], ['catcus', 'cactus'],
  ['pumkin', 'pumpkin'], ['pumpkn', 'pumpkin'], ['watermellon', 'watermelon'], ['melun', 'melon'], ['carot', 'carrot'], ['carrott', 'carrot'],
  ['potatoe', 'potato'], ['potateo', 'potato'], ['beetrot', 'beetroot'], ['coockie', 'cookie'], ['cokie', 'cookie'], ['saddel', 'saddle'],
  ['sadle', 'saddle'], ['hors', 'horse'], ['hourse', 'horse'], ['parot', 'parrot'], ['parrott', 'parrot'], ['dolfin', 'dolphin'],
  ['dolphine', 'dolphin'], ['axolottl', 'axolotl'], ['axalotl', 'axolotl'], ['axolot', 'axolotl'], ['snifer', 'sniffer'], ['sniffr', 'sniffer'],
  ['warden', 'warden'], ['wardin', 'warden'], ['beacom', 'beacon'], ['becon', 'beacon'], ['anvel', 'anvil'], ['anvill', 'anvil'],
  ['lectern', 'lectern'], ['lecturn', 'lectern'], ['jukbox', 'jukebox'], ['jukebx', 'jukebox'], ['scaffoldin', 'scaffolding'], ['scafolding', 'scaffolding'],
  ['trident', 'trident'], ['tridnet', 'trident'], ['spawnr', 'spawner'], ['spawnner', 'spawner'], ['hopprr', 'hopper'], ['hoper', 'hopper'],
  ['observr', 'observer'], ['obsever', 'observer'], ['commpass', 'compass'], ['compas', 'compass'], ['lether', 'leather'], ['leathr', 'leather'],
  ['teliport', 'teleport'], ['teleprot', 'teleport'], ['amethist', 'amethyst'], ['amythest', 'amethyst'], ['copprr', 'copper'], ['coper', 'copper'],
];
for (const [from, to] of HAND) if (from !== to && !from.includes(' ')) cases.push({ from, to: fold(to), set: 'hand list' });

// The dictionary the engine corrects against: folded words of the static and vanilla layers.
const freq = new Map<string, number>();
for (const e of [...corpus, ...vanilla]) {
  const seen = new Set<string>();
  for (const w of rawWords([e.title, e.sentence ?? '', (e.words ?? []).join(' '), e.body ?? '', (e.ids ?? []).join(' ')].join(' '))) if (w.length >= 3 && !/^\d+$/.test(w)) seen.add(fold(w));
  for (const w of seen) freq.set(w, (freq.get(w) ?? 0) + 1);
}
const sounds = new Map<string, string[]>();
for (const w of freq.keys()) if (w.length >= 4) sounds.set(soundKey(w), [...(sounds.get(soundKey(w)) ?? []), w]);

const methods: Record<string, unknown> = {};
for (const [tie, make] of [[false, deletionIndex], [true, deletionIndex], [true, trigramIndex], [true, bkTreeIndex]] as const) {
  setTieBreak(tie);
  const t0 = performance.now();
  const ix = make(freq);
  const buildMs = +(performance.now() - t0).toFixed(1);
  let right = 0;
  let wrongFirst = 0;
  let none = 0;
  let inCandidates = 0;
  let rescuedBySound = 0;
  let soundWrong = 0;
  const bySet: Record<string, { n: number; right: number; wrong: number; none: number }> = {};
  const wrongs: string[] = [];
  const t1 = performance.now();
  for (const c of cases) {
    const s = (bySet[c.set] ??= { n: 0, right: 0, wrong: 0, none: 0 });
    s.n++;
    if (freq.has(c.from)) {
      // the misspelling is itself a word: not corrected (SL13)
      none++;
      s.none++;
      continue;
    }
    const got = ix.correct(c.from);
    if (got.some((g) => g.word === c.to)) inCandidates++;
    if (got[0]?.word === c.to) { right++; s.right++; }
    else if (got.length > 0) { wrongFirst++; s.wrong++; wrongs.push(`${c.from}->${got[0]?.word} (wanted ${c.to})`); }
    else {
      none++;
      s.none++;
      const snd = (sounds.get(soundKey(c.from)) ?? []).filter((w) => Math.abs(w.length - c.from.length) <= 2);
      if (snd[0] === c.to) rescuedBySound++;
      else if (snd.length > 0) soundWrong++;
    }
  }
  const queryMs = (performance.now() - t1) / cases.length;
  methods[`${ix.name}${tie ? '' : ' (first draft ties)'}`] = { buildMs, keys: (ix as unknown as { size?: number }).size, perWordMs: +queryMs.toFixed(3), right, wrongFirst, none, inCandidates, soundAlike: { rescued: rescuedBySound, wrong: soundWrong }, bySet, wrongs: wrongs.slice(0, 40) };
}

// D16's sub-bar: every flow title with one wrong letter still finds its flow in the top three.
const index = buildIndex([...corpus, ...vanilla], { groups: WORD_GROUPS, colours: COLOURS, behaviours: BEHAVIOURS }, vanillaWords(regs), { ...DEFAULT_OPTIONS, v1: true, soundAlike: true });
let flowTop3 = 0;
const flowMisses: string[] = [];
for (const c of cases.filter((x) => x.flow !== undefined)) {
  const e = corpus.find((x) => x.id === c.flow) as Entry;
  const q = rawWords(e.title).map((w) => (fold(w) === c.to ? c.from : w)).join(' ');
  const ids2 = index.search(q, 'very-easy', 3).hits.map((h) => h.entry.id);
  if (ids2.includes(c.flow as string)) flowTop3++;
  else flowMisses.push(`${q} -> ${ids2.join(', ')}`);
}

// SQ4: which different dictionary words the stemmer merges.
const dictionary = new Set(freq.keys());
const protect = new Set([...vanillaWords(regs)].map(fold));
for (const g of WORD_GROUPS) protect.add(fold(g.idea));
const merges = (label: string, f: (w: string) => string): unknown => {
  const groups = new Map<string, string[]>();
  for (const w of dictionary) {
    const s = f(w);
    groups.set(s, [...(groups.get(s) ?? []), w]);
  }
  const merged = [...groups.entries()].filter(([, ws]) => ws.length > 1).map(([s, ws]) => `${s}: ${ws.sort().join(' ')}`);
  return { label, groups: merged.length, words: merged.reduce((n, m) => n + m.split(' ').length - 1, 0), list: merged.sort() };
};
const stemmer = {
  plain: merges('rule stemmer, no protected words', (w) => stem(w)),
  protected: merges('rule stemmer, protected words', (w) => stem(w, protect)),
  dictionaryFirstDraft: merges('dictionary stemmer as first written, protected words', (w) => stem(w, protect, dictionary, false)),
  dictionary: merges('dictionary stemmer with the B650 order and exceptions, protected words', (w) => stem(w, protect, dictionary)),
};
const KNOWN_BAD: [string, string][] = [['coming', 'com'], ['mined', 'min'], ['noted', 'not'], ['named', 'nam'], ['shaped', 'shap'], ['scraping', 'scrap'], ['gives', 'gif'], ['saves', 'safe'], ['news', 'new'], ['lives', 'life'], ['leaves', 'leave'], ['boots', 'boot'], ['ranged', 'range'], ['closed', 'clos'], ['moved', 'mov'], ['creeper', 'creep'], ['glass', 'glas'], ['lapis', 'lapi'], ['bus', 'bu'], ['moss', 'mos']];
const badCount = (f: (w: string) => string): string[] => KNOWN_BAD.filter(([w, s]) => dictionary.has(w) && f(w) === s).map(([w, s]) => `${w}->${s}`);
const knownBad = {
  plain: badCount((w) => stem(w)),
  protected: badCount((w) => stem(w, protect)),
  dictionaryFirstDraft: badCount((w) => stem(w, protect, dictionary, false)),
  dictionary: badCount((w) => stem(w, protect, dictionary)),
};

console.log(JSON.stringify({ target, cases: cases.length, sets: Object.fromEntries([...new Set(cases.map((c) => c.set))].map((s) => [s, cases.filter((c) => c.set === s).length])), dictionaryWords: freq.size, methods, flowTitlesOneEdit: { n: cases.filter((c) => c.flow).length, top3: flowTop3, misses: flowMisses }, knownBad, stemmer }, null, 1));
