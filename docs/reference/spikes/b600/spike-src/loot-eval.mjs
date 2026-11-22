// B600 spike (throwaway): a minimal loot evaluator written from the data's field names and from what the real game
// showed on MSM's own fixture (server-*.json). Not MSM's evaluator: B605 writes that. Used to compare odds (compare.mjs)
// and to time 1,000 rolls of a large table (speed.mjs).
//
// Observed semantics it follows (B600): a pool's entries are expanded into candidates first (conditions tested at
// expansion; `alternatives` keeps the first child that passes, `group` all that pass, `sequence` children until one
// fails; a tag with expand gives one candidate per member, without it one candidate giving all members); then each roll
// picks ONE candidate by weight (weight + quality * luck). Entry modifiers run before pool and table modifiers.

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { float: next, int: (n) => Math.floor(next() * n), range: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) };
}

const strip = (id) => (typeof id === 'string' ? id.replace(/^minecraft:/, '') : id);

export class Evaluator {
  /** data: { tables, predicates, itemTags, enchantments, enchantmentTags } keyed by full id. */
  constructor(data) {
    this.d = data;
    this.unknown = new Map();
  }
  report(kind, type) {
    const k = `${kind}:${type}`;
    this.unknown.set(k, (this.unknown.get(k) ?? 0) + 1);
  }
  int(v, ctx) {
    return Math.round(this.num(v, ctx, true));
  }
  num(v, ctx, isInt = false) {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    const t = strip(v.type);
    switch (t) {
      case 'constant': return v.value;
      case 'uniform': {
        const lo = this.num(v.min, ctx, isInt), hi = this.num(v.max, ctx, isInt);
        return isInt ? ctx.r.range(Math.round(lo), Math.round(hi)) : lo + ctx.r.float() * (hi - lo);
      }
      case 'binomial': {
        const n = this.int(v.n, ctx), p = this.num(v.p, ctx);
        let k = 0;
        for (let i = 0; i < n; i++) if (ctx.r.float() < p) k++;
        return k;
      }
      case 'weighted_list': {
        const total = v.distribution.reduce((a, e) => a + e.weight, 0);
        let x = ctx.r.int(total);
        for (const e of v.distribution) { if ((x -= e.weight) < 0) return this.num(e.data, ctx, isInt); }
        return 0;
      }
      case 'number_dispatcher':
        for (const c of v.cases) if (this.test(c.condition, ctx) === true) return this.num(c.value, ctx, isInt);
        return this.num(v.default ?? 0, ctx, isInt);
      case 'conditional':
        return this.test(v.condition, ctx) === true ? this.num(v.on_true, ctx, isInt) : this.num(v.on_false ?? 0, ctx, isInt);
      default:
        this.report('number', t);
        return 0;
    }
  }
  levelValue(v, level) {
    if (typeof v === 'number') return v;
    const t = strip(v.type);
    if (t === 'linear') return v.base + v.per_level_above_first * (level - 1);
    this.report('level_based_value', t);
    return 0;
  }
  ench(holder, id) {
    return holder?.[id] ?? holder?.[`minecraft:${id}`] ?? 0;
  }
  /** true, false or 'unknown'. */
  test(c, ctx) {
    if (c == null) return true;
    if (Array.isArray(c)) { let r = true; for (const x of c) { const v = this.test(x, ctx); if (v === false) return false; if (v !== true) r = v; } return r; }
    if (typeof c === 'string') { const p = this.d.predicates[c.startsWith('#') ? c : c.includes(':') ? c : `minecraft:${c}`]; return p ? this.test(p, ctx) : (this.report('predicate', c), 'unknown'); }
    const t = strip(c.type);
    switch (t) {
      case 'random_chance': return ctx.r.float() < this.num(c.chance, ctx);
      case 'random_chance_with_enchanted_bonus': {
        const lvl = this.ench(ctx.attacker?.enchantments, c.enchantment);
        return ctx.r.float() < (lvl > 0 ? this.levelValue(c.enchanted_chance, lvl) : c.unenchanted_chance);
      }
      case 'table_bonus': {
        const lvl = this.ench(ctx.tool?.enchantments, c.enchantment);
        return ctx.r.float() < c.chances[Math.min(lvl, c.chances.length - 1)];
      }
      case 'survives_explosion': return ctx.explosionRadius ? ctx.r.float() <= 1 / ctx.explosionRadius : true;
      case 'killed_by_player': return !!ctx.killerIsPlayer;
      case 'match_tool': {
        // Only the enchantments part of an item predicate (spike); anything else is unknown.
        const pr = c.predicate ?? {};
        const keys = Object.keys(pr);
        if (keys.length === 0) return ctx.tool ? true : false;
        if (keys.length !== 1 || !pr.predicates || Object.keys(pr.predicates).join() !== 'minecraft:enchantments') { this.report('condition', 'match_tool(other)'); return 'unknown'; }
        if (!ctx.tool) return false;
        return pr.predicates['minecraft:enchantments'].every((e) => this.ench(ctx.tool.enchantments, e.enchantments) >= (e.levels?.min ?? 1));
      }
      case 'inverted': { const v = this.test(c.term, ctx); return v === 'unknown' ? v : !v; }
      case 'all_of': return this.test(c.terms, ctx);
      case 'any_of': { let r = false; for (const x of c.terms) { const v = this.test(x, ctx); if (v === true) return true; if (v !== false) r = v; } return r; }
      default: this.report('condition', t); return 'unknown';
    }
  }
  /** Applies one modifier (a function, a list or an id) to stacks [{id, count, ench?}]. */
  modify(m, stacks, ctx) {
    if (m == null) return stacks;
    if (Array.isArray(m)) { for (const f of m) stacks = this.modify(f, stacks, ctx); return stacks; }
    if (typeof m === 'string') { this.report('modifier_ref', m); return stacks; }
    if (m.condition !== undefined && this.test(m.condition, ctx) !== true) return stacks;
    const t = strip(m.type);
    return stacks.flatMap((s) => {
      switch (t) {
        case 'set_count': { const n = this.int(m.count, ctx); return [{ ...s, count: m.add ? s.count + n : n }]; }
        case 'limit_count': {
          let c = s.count;
          if (typeof m.limit === 'number') c = Math.min(c, m.limit);
          else { if (m.limit.min !== undefined) c = Math.max(c, this.int(m.limit.min, ctx)); if (m.limit.max !== undefined) c = Math.min(c, this.int(m.limit.max, ctx)); }
          return [{ ...s, count: c }];
        }
        case 'apply_bonus': {
          const lvl = this.ench(ctx.tool?.enchantments, m.enchantment);
          const f = strip(m.formula);
          let c = s.count;
          if (f === 'ore_drops') { if (lvl > 0) c *= Math.max(0, ctx.r.int(lvl + 2) - 1) + 1; }
          else if (f === 'uniform_bonus_count') { if (lvl > 0) c += ctx.r.int(lvl * m.parameters.bonusMultiplier + 1); }
          else if (f === 'binomial_with_bonus_count') { for (let i = 0; i < lvl + m.parameters.extra; i++) if (ctx.r.float() < m.parameters.probability) c++; }
          else this.report('apply_bonus_formula', f);
          return [{ ...s, count: c }];
        }
        case 'enchanted_count_increase': {
          const lvl = this.ench(ctx.attacker?.enchantments, m.enchantment);
          if (lvl === 0) return [s];
          let c = s.count + Math.round(lvl * this.num(m.count, ctx));
          if (m.limit !== undefined && m.limit > 0) c = Math.min(c, m.limit);
          return [{ ...s, count: c }];
        }
        case 'explosion_decay': {
          if (!ctx.explosionRadius) return [s];
          let c = 0;
          for (let i = 0; i < s.count; i++) if (ctx.r.float() <= 1 / ctx.explosionRadius) c++;
          return [{ ...s, count: c }];
        }
        case 'set_damage': return [{ ...s, damage: 1 - this.num(m.damage, ctx) }];
        case 'enchant_randomly': return [this.enchantRandomly(s, m, ctx)];
        case 'enchant_with_levels': return [this.enchantWithLevels(s, m, ctx)];
        case 'sequence': return this.modify(m.functions, [s], ctx);
        case 'set_name': case 'set_lore': case 'set_components': case 'furnace_smelt': return [s];
        default: this.report('function', t); return [s];
      }
    });
  }
  optionsList(options) {
    const all = Object.keys(this.d.enchantments);
    if (options == null) return all;
    const list = Array.isArray(options) ? options : [options];
    return list.flatMap((o) => (o.startsWith('#') ? this.resolveTag(this.d.enchantmentTags, o.slice(1)) : [o]));
  }
  resolveTag(tags, id, seen = new Set()) {
    const full = id.includes(':') ? id : `minecraft:${id}`;
    if (seen.has(full)) return [];
    seen.add(full);
    const t = tags[full];
    if (!t) { this.report('tag', full); return []; }
    return t.values.flatMap((v) => { const x = typeof v === 'string' ? v : v.id; return x.startsWith('#') ? this.resolveTag(tags, x.slice(1), seen) : [x]; });
  }
  enchantRandomly(s, m, ctx) {
    const opts = this.optionsList(m.options);
    const id = opts[ctx.r.int(opts.length)];
    const e = this.d.enchantments[id];
    const level = ctx.r.range(1, e.max_level);
    return { ...s, id: s.id === 'minecraft:book' ? 'minecraft:enchanted_book' : s.id, ench: [[id, level]] };
  }
  enchantWithLevels(s, m, ctx) {
    const enchantability = ctx.enchantability?.[s.id] ?? 1;
    let level = this.int(m.levels, ctx);
    level += 1 + ctx.r.int(Math.floor(enchantability / 4) + 1) + ctx.r.int(Math.floor(enchantability / 4) + 1);
    const bonus = (ctx.r.float() + ctx.r.float() - 1) * 0.15;
    level = Math.max(1, Math.round(level + level * bonus));
    const cost = (c, l) => c.base + c.per_level_above_first * (l - 1);
    let cands = [];
    for (const id of this.optionsList(m.options)) {
      const e = this.d.enchantments[id];
      if (!e) continue;
      if (s.id !== 'minecraft:book' && !(ctx.supports?.(id, s.id) ?? true)) continue;
      for (let l = e.max_level; l >= 1; l--) if (cost(e.min_cost, l) <= level && level <= cost(e.max_cost, l)) { cands.push([id, l, e.weight]); break; }
    }
    const out = [];
    const pick = () => { const total = cands.reduce((a, c) => a + c[2], 0); let x = ctx.r.int(total); for (const c of cands) if ((x -= c[2]) < 0) return c; return null; };
    if (cands.length) {
      out.push(pick());
      while (ctx.r.int(50) <= level) {
        const last = out[out.length - 1][0];
        cands = cands.filter((c) => !out.some((o) => o[0] === c[0]) && this.compatible(last, c[0]) && out.every((o) => this.compatible(o[0], c[0])));
        if (!cands.length) break;
        out.push(pick());
        level = Math.floor(level / 2);
      }
    }
    return { ...s, id: s.id === 'minecraft:book' ? 'minecraft:enchanted_book' : s.id, ench: out.map((o) => [o[0], o[1]]) };
  }
  compatible(a, b) {
    const ex = (x) => { const e = this.d.enchantments[x]; if (!e?.exclusive_set) return []; const l = Array.isArray(e.exclusive_set) ? e.exclusive_set : [e.exclusive_set]; return l.flatMap((o) => (o.startsWith('#') ? this.resolveTag(this.d.enchantmentTags, o.slice(1)) : [o])); };
    return a !== b && !ex(a).includes(b) && !ex(b).includes(a);
  }
  expand(entry, ctx, out) {
    if (this.test(entry.condition, ctx) !== true) return false;
    const t = strip(entry.type);
    switch (t) {
      case 'item': out.push({ entry, make: () => [{ id: entry.name, count: 1 }] }); return true;
      case 'empty': out.push({ entry, make: () => [] }); return true;
      case 'tag': {
        const members = this.resolveTag(this.d.itemTags, entry.items.slice(1));
        if (entry.expand) for (const id of members) out.push({ entry, make: () => [{ id, count: 1 }] });
        else out.push({ entry, make: () => members.map((id) => ({ id, count: 1 })) });
        return true;
      }
      case 'loot_table': {
        const table = typeof entry.value === 'string' ? this.d.tables[entry.value] : entry.value;
        if (!table) { this.report('table', entry.value); return true; }
        out.push({ entry, make: (c) => this.roll(table, c) });
        return true;
      }
      case 'alternatives': for (const ch of entry.children) if (this.expand(ch, ctx, out)) return true; return false;
      case 'group': for (const ch of entry.children) this.expand(ch, ctx, out); return true;
      case 'sequence': for (const ch of entry.children) if (!this.expand(ch, ctx, out)) return false; return true;
      default: this.report('entry', t); return true;
    }
  }
  roll(table, ctx) {
    let stacks = [];
    for (const pool of table.pools ?? []) {
      if (this.test(pool.condition, ctx) !== true) continue;
      const rolls = this.int(pool.rolls, ctx) + Math.floor(this.num(pool.bonus_rolls ?? 0, ctx) * (ctx.luck ?? 0));
      for (let i = 0; i < rolls; i++) {
        const cands = [];
        for (const e of pool.entries) this.expand(e, ctx, cands);
        const weighted = cands.map((c) => [c, Math.max(0, Math.floor((c.entry.weight ?? 1) + (c.entry.quality ?? 0) * (ctx.luck ?? 0)))]);
        const total = weighted.reduce((a, w) => a + w[1], 0);
        if (total === 0) continue;
        let x = ctx.r.int(total);
        for (const [c, w] of weighted) if ((x -= w) < 0) { stacks.push(...this.modify(pool.modifier, this.modify(c.entry.modifier, c.make(ctx), ctx), ctx)); break; }
      }
    }
    return this.modify(table.modifier, stacks, ctx).filter((s) => s.count > 0 || s.id === undefined);
  }
}

/** The same key the GameTest used: item, sorted enchantments, damage bucket. */
export function key(s, maxDamage) {
  let k = s.id;
  if (s.ench?.length) k += '|' + s.ench.map(([id, l]) => id.split(':')[1] + l).sort().join(',');
  if (s.damage && maxDamage) { const d = Math.round(s.damage * maxDamage); if (d > 0) k += '|dmg' + Math.floor((d * 20) / maxDamage); }
  return k;
}
